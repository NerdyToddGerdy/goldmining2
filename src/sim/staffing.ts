import type { Creek, DigSpot } from './creek';
import { ECONOMY_TUNING, payDebt, type Economy } from './economy';
import { estimateAround, type Estimate } from './estimate';
import { MARKET } from './market';
import type { GoldPiece } from './pan';
import type { PanningSession } from './panningSession';
import type { Rng } from './rng';
import type { Sluice } from './sluice';

/**
 * The first hired hand (see "Staffing System" in the design doc): one general hand who runs the
 * player's sluice while the player is somewhere else.
 *
 * The hand drives the same Sluice and Creek models the player does, only slower and less
 * attentive: hauling from spots along the stretch, tossing topsoil, feeding at a cautious pace,
 * raking clogs late, cleaning out on a fixed schedule. So the player is always the better
 * operator, and staff buy time, not output. The hand's cleanouts go into a crew bucket beside
 * the sluice, unrevealed: the player washes it into the jar and pans it, so the reveal stays theirs.
 *
 * Wages run by the game day whether there is work or not, and are paid in town with the claim
 * fees. A hand left unpaid for a couple of days walks off. Nothing here needs a screen.
 */

export const STAFF_TUNING = {
  /** Dollars per game day. The first day is paid up front at hiring. */
  wage: 25,
  /** Days of unpaid wages before the hand walks off. */
  quitDays: 2,
  /** Seconds to dig, carry and shovel a load into the header, plus hauling per creek length. */
  feedTime: 5,
  haulPerLength: 8,
  tossTime: 5,
  pryTime: 4,
  bailTime: 3,
  refuelTime: 4,
  /** A hand lets a clog sit this long before raking it. */
  rakeDelay: 3,
  /** Shovelfuls between cleanouts, and seconds of rinse before lifting the mat. */
  cleanoutEvery: 8,
  rinse: 4,
  /** The water power a hand aims for, and how far off they set it. */
  targetPower: 0.45,
  flowNoise: 0.08,
  /** The crew bucket holds about five mats: most of a stretch's worth. */
  bucketCapacity: 4,
  /** Simulation step while the hand works. */
  step: 0.05,
  /** Share of fed gold a hand keeps, for estimates only. */
  estimatedRecovery: 0.7,
} as const;

const NAMES = ['Abe', 'Clem', 'Dutch', 'Ezra', 'Hattie', 'Jonas', 'Lottie', 'Mose', 'Nell', 'Ruth', 'Silas', 'Tillie', 'Wes'];

/** Why the hand isn't working. */
export type IdleReason =
  | 'playerHere'
  | 'noSluice'
  | 'claimLapsed'
  | 'workedOut'
  | 'bucketFull'
  | 'pumpDry';

export interface HandState {
  readonly name: string;
  readonly wage: number;
  /** Intake setting the hand has chosen. */
  flow: number;
  /** Seconds until the current action is done. */
  timer: number;
  /** Seconds of rinse left in a cleanout, or null when not cleaning out. */
  rinsing: number | null;
  clogTime: number;
  sinceClean: number;
  idle: IdleReason | null;
}

/** What the hand did since the player last came by. */
export interface CrewReport {
  seconds: number;
  shovelfuls: number;
  cleanouts: number;
  clues: number;
}

export interface CrewSnapshot {
  readonly hand: HandState | null;
  /** Negative while wages are paid ahead. */
  readonly wagesOwed: number;
  readonly bucket: { readonly blackSand: number; readonly gold: readonly GoldPiece[] };
  readonly report: CrewReport;
}

/** The sluice the hand works, where it is, and what the player's presence and claim allow. */
export interface CrewSite {
  readonly creek: Creek;
  readonly spot: DigSpot;
  readonly sluice: Sluice;
  readonly session: PanningSession;
  /** Set when something outside the hand's control stops the work. */
  readonly stopped: Extract<IdleReason, 'playerHere' | 'noSluice' | 'claimLapsed'> | null;
}

export type HireResult = 'hired' | 'alreadyHired' | 'noSluice' | 'homeCreek' | 'claimLapsed' | 'restricted' | 'cantAfford';

export class Crew {
  hand: HandState | null = null;
  wagesOwed = 0;
  readonly bucket: { blackSand: number; gold: GoldPiece[] } = { blackSand: 0, gold: [] };
  report: CrewReport = emptyReport();

  constructor(
    private readonly rng: Rng,
    saved?: CrewSnapshot,
  ) {
    if (!saved) return;
    const copy = structuredClone(saved) as CrewSnapshot & { hand: HandState | null; bucket: { blackSand: number; gold: GoldPiece[] } };
    this.hand = copy.hand;
    this.wagesOwed = copy.wagesOwed;
    this.bucket.blackSand = copy.bucket.blackSand;
    this.bucket.gold.push(...copy.bucket.gold);
    this.report = copy.report;
  }

  snapshot(): CrewSnapshot {
    return structuredClone({ hand: this.hand, wagesOwed: this.wagesOwed, bucket: this.bucket, report: this.report });
  }

  /** Wages more than a day behind (or any owed after the hand has gone): expansion is restricted. */
  get wagesOverdue(): boolean {
    return this.wagesOwed > (this.hand ? this.hand.wage : 0);
  }

  /**
   * Hire a hand for the sluice wherever it's set up. Needs a set-up sluice on a stretch that can
   * be worked (never the Home Creek), nothing overdue, and the first day's wage in hand.
   */
  hire(session: PanningSession, economy: Economy, homeCreekId: number, restricted: boolean): HireResult {
    if (this.hand) return 'alreadyHired';
    const place = session.sluicePlace;
    if (!place) return 'noSluice';
    if (place.creekId === homeCreekId) return 'homeCreek';
    if (!economy.canWork(place.creekId)) return 'claimLapsed';
    if (restricted) return 'restricted';
    const wage = STAFF_TUNING.wage;
    if (session.cash < wage) return 'cantAfford';
    session.cash = Math.round((session.cash - wage) * 100) / 100;
    this.wagesOwed -= wage;
    this.hand = {
      name: NAMES[this.rng.int(0, NAMES.length - 1)]!,
      wage,
      flow: 0.7,
      timer: 0,
      rinsing: null,
      clogTime: 0,
      sinceClean: 0,
      idle: null,
    };
    this.report = emptyReport();
    return 'hired';
  }

  /** Let the hand go. Wages already owed are still owed. */
  dismiss(): void {
    this.hand = null;
  }

  /**
   * Wages run by the game day, working or not. Returns 'quit' if the hand walks off unpaid;
   * whatever is owed stays owed.
   */
  accrue(seconds: number): 'quit' | null {
    if (!this.hand || seconds <= 0) return null;
    this.wagesOwed += (this.hand.wage * seconds) / ECONOMY_TUNING.daySeconds;
    const limit = this.hand.wage * STAFF_TUNING.quitDays;
    if (this.wagesOwed > limit) {
      // They leave the moment the limit is reached, and aren't owed for time after.
      this.wagesOwed = limit;
      this.hand = null;
      return 'quit';
    }
    return null;
  }

  /** Pay wages from cash, as far as it goes. Returns dollars paid. */
  payWages(session: PanningSession): number {
    const { paid, left } = payDebt(this.wagesOwed, session.cash);
    if (paid <= 0) return 0;
    session.cash = Math.round((session.cash - paid) * 100) / 100;
    this.wagesOwed = left;
    return paid;
  }

  /** Hand the report over (when the player comes by) and start a fresh one. */
  takeReport(): CrewReport {
    const report = this.report;
    this.report = emptyReport();
    return report;
  }

  /**
   * Wash as much of the crew bucket into the player's jar as fits. Gold goes in proportion to
   * the sand, like pouring from the jar. Returns the volume moved.
   */
  washIntoJar(session: PanningSession): number {
    const amount = Math.min(this.bucket.blackSand, session.jarSpace);
    if (amount <= 0) return 0;
    const share = amount / this.bucket.blackSand;
    const moved: GoldPiece[] = [];
    const kept: GoldPiece[] = [];
    for (const piece of this.bucket.gold) (share >= 1 || this.rng.next() < share ? moved : kept).push(piece);
    session.addConcentrate({ blackSand: amount, gold: moved });
    this.bucket.blackSand -= amount;
    if (this.bucket.blackSand < 1e-9) this.bucket.blackSand = 0;
    this.bucket.gold = kept;
    return amount;
  }

  /** Work the sluice for `seconds` of game time. */
  work(seconds: number, site: CrewSite | null, onClue: () => void = () => {}): void {
    const hand = this.hand;
    if (!hand || seconds <= 0) return;
    if (!site || site.stopped) {
      hand.idle = site?.stopped ?? 'noSluice';
      return;
    }
    const T = STAFF_TUNING;
    const { sluice, creek, session } = site;
    let left = seconds;
    while (left > 1e-9) {
      const dt = Math.min(T.step, left);
      left -= dt;

      // Keep the pump fed from the player's cans; with none left, the work stops.
      const pump = sluice.usesPump ? sluice.kit.pump : null;
      if (pump && pump.fuel <= 0) {
        if (session.fuelCans <= 0) {
          hand.idle = 'pumpDry';
          return;
        }
        session.refuelPump();
        hand.timer = Math.max(hand.timer, T.refuelTime);
      }

      hand.idle = null;
      this.report.seconds += dt;
      if (hand.timer <= 0 && hand.rinsing === null) this.setFlow(hand, sluice);
      sluice.step(dt, { flow: hand.flow });

      // Clogs get raked, eventually.
      hand.clogTime = sluice.clog > 0.5 ? hand.clogTime + dt : 0;
      if (hand.clogTime >= T.rakeDelay) {
        sluice.rake();
        hand.clogTime = 0;
      }

      if (hand.rinsing !== null) {
        hand.rinsing -= dt;
        if (hand.rinsing > 0) continue;
        if (this.bucket.blackSand + sluice.matVolume > T.bucketCapacity + 1e-9) {
          hand.rinsing = 0;
          hand.idle = 'bucketFull';
          return;
        }
        const mat = sluice.liftMat();
        this.bucket.blackSand += mat.blackSand;
        this.bucket.gold.push(...mat.gold);
        hand.rinsing = null;
        hand.sinceClean = 0;
        this.report.cleanouts += 1;
        continue;
      }

      hand.timer -= dt;
      if (hand.timer > 0) continue;

      const target = this.nextSpot(creek, site.spot);
      const headerClear = sluice.headerVolume < 0.05;
      if (headerClear && hand.sinceClean > 0 && (hand.sinceClean >= T.cleanoutEvery || !target)) {
        hand.rinsing = T.rinse;
        continue;
      }
      if (!target) {
        if (headerClear) {
          hand.idle = 'workedOut';
          return;
        }
        hand.timer = 1;
        continue;
      }
      hand.timer = this.act(creek, target, site.spot, sluice, onClue);
    }
  }

  /** Aim the intake at a sensible middle power, not quite right. */
  private setFlow(hand: HandState, sluice: Sluice): void {
    const full = sluice.power({ flow: 1 });
    if (full <= 0) return;
    const off = (this.rng.next() * 2 - 1) * STAFF_TUNING.flowNoise;
    hand.flow = Math.min(1, Math.max(0.1, STAFF_TUNING.targetPower / full + off));
  }

  /** The nearest spot along the stretch with ground left to dig, starting beside the sluice. */
  private nextSpot(creek: Creek, sluiceSpot: DigSpot): DigSpot | null {
    const spots = creek.creekSpots
      .filter((s) => !creek.isWorkedOut(s))
      .sort((a, b) => Math.abs(a.position - sluiceSpot.position) - Math.abs(b.position - sluiceSpot.position));
    return spots[0] ?? null;
  }

  /** One action at a spot. Returns how long it takes. */
  private act(creek: Creek, spot: DigSpot, sluiceSpot: DigSpot, sluice: Sluice, onClue: () => void): number {
    const T = STAFF_TUNING;
    const blocked = creek.blockedBy(spot);
    if (blocked === 'boulder') {
      creek.pry(spot.id);
      return T.pryTime;
    }
    if (blocked === 'flooded') {
      creek.bail(spot.id);
      return T.bailTime;
    }
    // Topsoil and slumped bank go on the spoil pile.
    const layer = creek.currentLayer(spot);
    if (spot.slumped > 0 || layer?.kind === 'overburden') {
      const tossed = creek.shovel(spot.id, 'spoil');
      if (tossed.ok && tossed.clue) this.clueFound(onClue);
      return T.tossTime;
    }
    if (sluice.feedBlocked) return 1;
    const result = creek.shovel(spot.id, 'pan');
    if (!result.ok) return 1;
    if (result.clue) this.clueFound(onClue);
    if (result.load) {
      sluice.feed(result.load);
      this.report.shovelfuls += 1;
      if (this.hand) this.hand.sinceClean += 1;
    }
    return T.feedTime + T.haulPerLength * Math.abs(spot.position - sluiceSpot.position);
  }

  private clueFound(onClue: () => void): void {
    this.report.clues += 1;
    onClue();
  }
}

function emptyReport(): CrewReport {
  return { seconds: 0, shovelfuls: 0, cleanouts: 0, clues: 0 };
}

/** Roughly how many game days of digging the stretch has left at a hand's pace. */
export function daysOfGroundLeft(creek: Creek, sluiceSpot: DigSpot): number {
  const T = STAFF_TUNING;
  let seconds = 0;
  for (const spot of creek.creekSpots) {
    const haul = T.haulPerLength * Math.abs(spot.position - sluiceSpot.position);
    seconds += spot.slumped * T.tossTime;
    for (const layer of spot.layers) seconds += layer.loads * (layer.kind === 'overburden' ? T.tossTime : T.feedTime + haul);
  }
  return seconds / ECONOMY_TUNING.daySeconds;
}

/**
 * A rough daily take for a hand on this stretch, built only from the player's own field notes:
 * no notes, no estimate. Wide, because notes are few and a hand's recovery varies.
 */
export function estimateDailyTake(creek: Creek, sluiceSpot: DigSpot): Estimate | null {
  let pans = 0;
  let mg = 0;
  for (const spot of creek.creekSpots) {
    if (!spot.notes) continue;
    pans += spot.notes.pans;
    mg += spot.notes.mg;
  }
  if (pans === 0) return null;
  const T = STAFF_TUNING;
  const avgHaul = creek.creekSpots.reduce((sum, s) => sum + T.haulPerLength * Math.abs(s.position - sluiceSpot.position), 0) / creek.creekSpots.length;
  const loadsPerDay = ECONOMY_TUNING.daySeconds / (T.feedTime + avgHaul);
  const dollars = (mg / pans) * loadsPerDay * T.estimatedRecovery * MARKET.spotPerMg * 0.8;
  return estimateAround(dollars, pans < 5 ? 1.2 : 0.7);
}
