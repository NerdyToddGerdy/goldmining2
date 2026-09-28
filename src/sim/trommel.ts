import { rollShovelful, totalMg, type GoldPiece, type PanLoad, type Rock } from './pan';
import type { Rng } from './rng';
import { Sluice, bareKit, type SluiceKit, type SluiceSnapshot, type SluiceStepEvents } from './sluice';
import { WEAR_TUNING } from './wear';

/**
 * Trommel (see the gear interaction matrix in the design doc: "Load and maintain · drum rotates;
 * oversize rock separates; fines reach recovery deck · throughput versus jamming and wear").
 *
 * A rotating screen drum on a frame, with a spray bar running through it and a riffled recovery
 * deck underneath, driven by a small engine that also runs the spray pump. Gravel goes into the
 * hopper at the top end; the drum tumbles it under the spray, breaking up clay; fines fall through
 * the screen onto the deck, and rocks and whatever clay balls survive roll out the far end onto the
 * oversize pile. It eats rocky, clayey gravel that would jam a highbanker, and a lot of it, but
 * only at the right drum speed:
 *
 * - Crawling: too slow a turn barely tumbles the load. Clay balls roll out whole, carrying gold,
 *   and little screens through.
 * - Tumbling: the load cascades, clay breaks, fines drop through. The working speed.
 * - Racing: too fast, the load rides round the drum and is flung out the end with the rocks, fines
 *   and gold and all, and the drum wears faster.
 *
 * The spray is the deck's water: it washes the fines through the screen and runs the recovery deck
 * below (a sluice box, so its underpowered / balanced / overpowered states apply). What goes wrong:
 * - Overfed, the drum jams solid and stops. Clearing it tips the load out the end onto the pile.
 * - Fed faster than the deck can take, the deck's header backs up and the drum stops screening.
 * - The tank runs dry; the engine wears with its hours and seizes, as a highbanker's does.
 * Nothing here needs a screen.
 */

export const TROMMEL_TUNING = {
  /** The recovery deck: a wide riffled box at a set slope, watered by the spray. */
  deckSlope: 0.5,
  deckFlow: 1,
  deckScale: 2.2,
  /** Hopper holds this much; the drum takes it in at feedRate a second at a tumbling speed. */
  hopperMax: 3,
  feedRate: 1.4,
  /** The drum jams solid past this much in it. */
  drumMax: 2.6,
  /** Screening: share of the drum's fines through per second, tumbling under full spray. */
  screenRate: 0.55,
  /** Clay broken per second, tumbling under spray. */
  clayBreak: 0.6,
  /** Rocks rolling out the end per second, per rock, at a working speed. */
  rockExit: 0.6,
  /** Drum speed (0..1) below which it crawls and above which it races. */
  crawl: 0.3,
  race: 0.72,
  /** Racing flings this share of the drum's fines out the end per second at full speed. */
  flingRate: 0.35,
  /** Gold held in clay balls rolling out whole, by how much of the load is still clay. */
  clayCarry: 0.8,
  /** Seconds of running on a full tank, burning more with the drum and spray turned up. */
  tank: 180,
  idleBurn: 0.3,
  /** How much faster the drum wears racing. */
  raceWear: 2,
} as const;

export type DrumState = 'stopped' | 'crawling' | 'tumbling' | 'racing' | 'jammed';
export type TrommelEvent = 'jammed' | 'outOfFuel' | 'seized' | null;

export interface TrommelStepEvents {
  readonly drum: DrumState;
  readonly deck: SluiceStepEvents;
  /** Fines through the screen onto the deck this step. */
  readonly screened: number;
  /** Rocks and clay balls out the end this step. */
  readonly oversize: number;
  /** Gold carried out the end this step (in clay balls, or flung by a racing drum). */
  readonly goldOut: number;
  readonly event: TrommelEvent;
}

interface Load {
  light: number;
  black: number;
  clay: number;
  rocks: Rock[];
  gold: GoldPiece[];
}

export interface TrommelSnapshot {
  readonly deck: SluiceSnapshot;
  readonly hopper: Load;
  readonly drum: Load;
  readonly fuel: number;
  readonly running: boolean;
  readonly jammed: boolean;
  readonly rinsing: boolean;
  readonly fedMg: number;
  readonly engineWear: number;
  /** The drum's screen and bearings, 0 new .. 1 worn out. */
  readonly drumWear: number;
  /** Gold lost out the end, kept for recovery figures (the deck keeps its own). */
  readonly lostOut: readonly GoldPiece[];
}

export type TrommelStart = 'started' | 'running' | 'noFuel' | 'seized' | 'jammed';

export class Trommel {
  readonly deck: Sluice;
  private hopper: Load = emptyLoad();
  private drum: Load = emptyLoad();
  fuel = 0;
  running = false;
  /** Overfed: jammed solid, the drum stopped until it's cleared. */
  jammed = false;
  /** A cleanout under way: the drum is stopped and clean spray rinses the deck. */
  rinsing = false;
  fedMg = 0;
  engineWear = 0;
  drumWear = 0;
  /** Gold out the end onto the oversize pile. */
  readonly lostOut: GoldPiece[] = [];
  /** Oversize pile beside the trommel, in rocks and clay balls: only for drawing. */
  pile = 0;

  constructor(
    private readonly rng: Rng,
    saved?: TrommelSnapshot,
    kit: SluiceKit = bareKit(),
  ) {
    const T = TROMMEL_TUNING;
    this.deck = new Sluice(rng, { slope: T.deckSlope, flow: T.deckFlow, scale: T.deckScale }, saved?.deck, kit);
    if (!saved) return;
    const copy = structuredClone(saved);
    this.hopper = copy.hopper;
    this.drum = copy.drum;
    this.fuel = copy.fuel;
    this.running = copy.running;
    this.jammed = copy.jammed;
    this.rinsing = copy.rinsing;
    this.fedMg = copy.fedMg;
    this.engineWear = copy.engineWear;
    this.drumWear = copy.drumWear;
    this.lostOut.push(...copy.lostOut);
  }

  snapshot(): TrommelSnapshot {
    return structuredClone({
      deck: this.deck.snapshot(),
      hopper: this.hopper,
      drum: this.drum,
      fuel: this.fuel,
      running: this.running,
      jammed: this.jammed,
      rinsing: this.rinsing,
      fedMg: this.fedMg,
      engineWear: this.engineWear,
      drumWear: this.drumWear,
      lostOut: this.lostOut,
    });
  }

  get hopperVolume(): number {
    return volume(this.hopper);
  }

  get drumVolume(): number {
    return volume(this.drum);
  }

  /** Share of the drum's load that is still unbroken clay. */
  get drumClay(): number {
    const v = this.drumVolume;
    return v > 0 ? this.drum.clay / v : 0;
  }

  get hopperFull(): boolean {
    return this.hopperVolume >= TROMMEL_TUNING.hopperMax;
  }

  get hasLoad(): boolean {
    return this.hopperVolume > 0.01 || this.drumVolume > 0.01 || this.drum.rocks.length > 0 || this.hopper.rocks.length > 0;
  }

  get seized(): boolean {
    return this.engineWear >= 1;
  }

  /** The worse of the engine's hours, the drum's screen and the deck's riffles. */
  get wear(): number {
    return Math.max(this.engineWear, this.drumWear, this.deck.wear);
  }

  /** How the drum turns at a speed (0..1), as the player reads it. */
  classify(speed: number): Exclude<DrumState, 'stopped' | 'jammed'> {
    const T = TROMMEL_TUNING;
    if (speed < T.crawl) return 'crawling';
    if (speed > T.race) return 'racing';
    return 'tumbling';
  }

  feed(load: PanLoad): boolean {
    if (this.hopperFull) return false;
    const s = rollShovelful(this.rng, load);
    this.add(this.hopper, s.lightSand, s.blackSand, s.clay, s.rocks, s.gold);
    return true;
  }

  feedScreened(material: { light: number; black: number; clay: number; gold: readonly GoldPiece[] }): boolean {
    if (this.hopperFull) return false;
    this.add(this.hopper, material.light, material.black, material.clay, [], material.gold);
    return true;
  }

  private add(into: Load, light: number, black: number, clay: number, rocks: readonly Rock[], gold: readonly GoldPiece[]): void {
    into.light += light;
    into.black += black;
    into.clay += clay;
    into.rocks.push(...rocks);
    into.gold.push(...gold);
    this.fedMg += totalMg(gold) + totalMg(rocks.flatMap((r) => (r.stuckPicker ? [r.stuckPicker] : [])));
  }

  start(): TrommelStart {
    if (this.running) return 'running';
    if (this.seized) return 'seized';
    if (this.jammed) return 'jammed';
    if (this.fuel <= 0) return 'noFuel';
    this.running = true;
    return 'started';
  }

  stop(): void {
    this.running = false;
  }

  refuel(): void {
    this.fuel = TROMMEL_TUNING.tank;
  }

  /**
   * Bar the jam loose and turn the drum out by hand: the whole load goes out the end onto the
   * pile, gold and all. Returns how many pieces went.
   */
  clearJam(): number {
    const lost = [...this.drum.gold, ...this.drum.rocks.flatMap((r) => (r.stuckPicker ? [r.stuckPicker] : []))];
    this.lostOut.push(...lost);
    this.pile += this.drum.rocks.length + this.drum.clay * 10;
    this.drum = emptyLoad();
    this.jammed = false;
    return lost.length;
  }

  /** Tip out the hopper and drum, as when the trommel comes down. Their gold goes with them. */
  emptyAll(): number {
    const lost = [this.hopper, this.drum].flatMap((l) => [...l.gold, ...l.rocks.flatMap((r) => (r.stuckPicker ? [r.stuckPicker] : []))]);
    this.lostOut.push(...lost);
    this.hopper = emptyLoad();
    this.drum = emptyLoad();
    this.jammed = false;
    return lost.length;
  }

  /** Service the engine, patch the screen, fit fresh moss on the deck: back to new. */
  service(): void {
    this.engineWear = 0;
    this.drumWear = 0;
    this.deck.service();
  }

  /** High water on a gravel bar: the hopper and drum are swept out and the deck stripped. */
  floodHit(): void {
    this.emptyAll();
    this.deck.floodHit();
  }

  /**
   * One slice of time. `speed`: the drum's turn, 0..1. `spray`: the spray bar, 0..1, which is also
   * the deck's water.
   */
  step(dt: number, speed: number, spray: number): TrommelStepEvents {
    const T = TROMMEL_TUNING;
    const rng = this.rng;
    const sp = clamp01(speed);
    const water = clamp01(spray);
    let event: TrommelEvent = null;

    if (this.running) {
      this.fuel = Math.max(0, this.fuel - dt * (T.idleBurn + (1 - T.idleBurn) * (sp + water) / 2));
      this.engineWear += dt * WEAR_TUNING.enginePerSecond * (0.4 + 0.3 * sp + 0.3 * water);
      if (this.fuel <= 0) {
        this.running = false;
        event = 'outOfFuel';
      } else if (this.seized) {
        this.running = false;
        event = 'seized';
      }
    }
    const turning = this.running && !this.jammed && !this.rinsing && sp > 0.02;
    const drum: DrumState = this.jammed ? 'jammed' : !turning ? 'stopped' : this.classify(sp);
    let screened = 0;
    let oversize = 0;
    let goldOut = 0;

    if (turning) {
      // The hopper feeds the drum as it turns; overfed, the drum jams solid.
      const take = Math.min(this.hopperVolume, T.feedRate * Math.min(1, sp / 0.5) * dt);
      if (take > 0) moveShare(this.hopper, this.drum, take / this.hopperVolume, rng, true);
      if (this.drumVolume > T.drumMax) {
        this.jammed = true;
        this.running = false;
        event = 'jammed';
      } else {
        // Tumbling breaks the clay; a crawling drum hardly does, and without water nothing does.
        const tumble = drum === 'crawling' ? sp / T.crawl * 0.25 : drum === 'racing' ? 0.6 : 1;
        this.drum.clay = Math.max(0, this.drum.clay - this.drum.clay * T.clayBreak * tumble * water * dt);
        if (this.drum.clay < 0.003) this.drum.clay = 0;

        // Fines through the screen onto the deck, as fast as the deck's header will take them.
        const room = this.deck.feedBlocked ? 0 : Math.max(0, this.deck.headerCapacity * 0.8 - this.deck.headerVolume);
        const fines = this.drum.light + this.drum.black;
        const through = Math.min(room, fines * T.screenRate * tumble * (0.3 + 0.7 * water) * (1 - 0.3 * Math.min(1, this.drumWear)) * dt);
        if (through > 0 && fines > 0) {
          const share = through / fines;
          const moved = { light: this.drum.light * share, black: this.drum.black * share, clay: 0, gold: [] as GoldPiece[] };
          this.drum.light -= moved.light;
          this.drum.black -= moved.black;
          // Gold bound up in unbroken clay stays in the drum; free gold drops through with the fines.
          const bound = this.drumClay;
          this.drum.gold = this.drum.gold.filter((piece) => {
            if (rng.next() >= share * (1 - bound)) return true;
            moved.gold.push(piece);
            return false;
          });
          this.deck.feedScreened(moved);
          screened = through;
        }

        // Out the end: rocks, clay balls (with the gold in them), and when racing, flung fines.
        const exit = T.rockExit * Math.min(1.5, sp / 0.5) * dt;
        this.drum.rocks = this.drum.rocks.filter((rock) => {
          if (rng.next() >= exit) return true;
          if (rock.stuckPicker) {
            this.lostOut.push(rock.stuckPicker);
            goldOut += 1;
          }
          oversize += 1;
          return false;
        });
        const clayOut = this.drum.clay * Math.min(1, exit);
        if (clayOut > 0) {
          const clayShare = this.drumClay;
          this.drum.clay -= clayOut;
          oversize += clayOut * 10;
          this.drum.gold = this.drum.gold.filter((piece) => {
            if (rng.next() >= clayShare * T.clayCarry * Math.min(1, exit)) return true;
            this.lostOut.push(piece);
            goldOut += 1;
            return false;
          });
        }
        if (drum === 'racing') {
          const racing = (sp - T.race) / (1 - T.race);
          const fling = T.flingRate * racing * dt;
          this.drum.light *= 1 - fling;
          this.drum.black *= 1 - fling;
          this.drum.gold = this.drum.gold.filter((piece) => {
            if (rng.next() >= fling * (piece.size === 'picker' ? 0.3 : 1)) return true;
            this.lostOut.push(piece);
            goldOut += 1;
            return false;
          });
        }
        this.pile += oversize;
        // The screen and bearings wear with the rock tumbling through, much faster racing.
        this.drumWear += (oversize * WEAR_TUNING.perRock * 0.5 + screened * WEAR_TUNING.perVolume.sluice * 0.3) * (drum === 'racing' ? T.raceWear : 1);
      }
    }

    const deck = this.deck.step(dt, { flow: this.running && !this.jammed ? water : this.rinsing ? 0.5 : 0 });
    return { drum, deck, screened, oversize, goldOut, event };
  }
}

function emptyLoad(): Load {
  return { light: 0, black: 0, clay: 0, rocks: [], gold: [] };
}

function volume(l: Load): number {
  return l.light + l.black + l.clay;
}

/** Move a share of one load into another: sand and clay by volume, rocks and gold piece by piece. */
function moveShare(from: Load, to: Load, share: number, rng: Rng, rocksToo: boolean): void {
  const s = Math.min(1, share);
  for (const k of ['light', 'black', 'clay'] as const) {
    const amount = from[k] * s;
    from[k] -= amount;
    to[k] += amount;
  }
  from.gold = from.gold.filter((piece) => {
    if (s < 1 && rng.next() >= s) return true;
    to.gold.push(piece);
    return false;
  });
  if (rocksToo) {
    from.rocks = from.rocks.filter((rock) => {
      if (s < 1 && rng.next() >= s) return true;
      to.rocks.push(rock);
      return false;
    });
  }
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
