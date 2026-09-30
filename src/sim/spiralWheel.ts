import type { GoldPiece, GoldSize } from './pan';
import type { Rng } from './rng';

/**
 * A spiral wheel concentrator, for finishing the concentrate jar (see "Pan progression" in the
 * design doc). A tilted wheel turns with spiral grooves cut in its face and a spray bar washing
 * across it. Black sand fed onto its low edge climbs the spiral and spills off the rim into a
 * tailings bucket; gold, heavier, rides the grooves the other way, to a hole in the centre and a
 * cup behind it.
 *
 * Its power is how hard the tilt and the spray work together:
 * - underpowered: the sand won't climb off fast enough and crowds the centre, so the cup comes up
 *   dirty (sand in the cup hides the fines, which go back to the jar with it);
 * - balanced: sand climbs away, gold rides in;
 * - overpowered: the water throws fine gold out over the rim with the sand.
 * Feeding faster crowds the wheel the same way. The cup is lifted into the vial; the tailings
 * bucket can be poured back into the tray to run again, or dumped, and nothing says what's in it.
 */

export const SPIRAL_TUNING = {
  /** How much black sand one scoop from the jar puts in the feed tray, and how much the tray holds. */
  scoop: 0.125,
  trayMax: 0.25,
  /** Black sand fed onto the wheel per second at full feed. */
  feedMax: 0.035,
  /** Sand on the wheel past this crowds the centre. */
  crowdAt: 0.012,
  /** Share per second of the excess that slides down into the cup. */
  crowdLeak: 0.6,
  /** Share per second of the wheel's sand that climbs off the rim, at balanced power. */
  clearRate: 1.6,
  /** Power (tilt and spray together, 0..1) that runs balanced. */
  balancedFrom: 0.35,
  balancedTo: 0.65,
  /** Chance per second a piece on the wheel rides into the cup, when it isn't crowded. */
  cupRate: { fine: 0.9, flake: 1.4, picker: 2.5 } as Record<GoldSize, number>,
  /** Chance per second a piece goes over the rim, balanced, and per unit of overpower. */
  baseLoss: { fine: 0.035, flake: 0.008, picker: 0 } as Record<GoldSize, number>,
  overLoss: { fine: 1.8, flake: 0.7, picker: 0.04 } as Record<GoldSize, number>,
  /** Cup sand past which the fines in it are hidden: they go back to the jar with the sand. */
  cupDirty: 0.01,
  /** The tailings bucket holds this much before the wheel has to stop. */
  bucketMax: 0.5,
} as const;

export type SpiralState = 'underpowered' | 'balanced' | 'overpowered';

export interface SpiralControls {
  /** How steeply the wheel is tilted, 0..1. */
  readonly tilt: number;
  /** How hard the spray bar runs, 0..1. */
  readonly spray: number;
  /** How fast the tray feeds sand onto the wheel, 0..1. */
  readonly feed: number;
}

export interface SpiralStepEvents {
  readonly state: SpiralState;
  /** Black sand fed onto the wheel, and spilled off the rim, this step. */
  readonly fed: number;
  readonly spilled: number;
  /** Pieces that rode into the cup, and went over the rim (a glint in the tailings), this step. */
  readonly toCup: number;
  readonly overRim: number;
  /** Past the crowding point: sand is sliding into the cup. */
  readonly crowded: boolean;
}

/** Sand with gold in it, wherever it sits on the machine. */
interface Batch {
  sand: number;
  gold: GoldPiece[];
}

/** What lifting the cup gives: gold for the vial, and sand (with any hidden fines) for the jar. */
export interface CupHarvest {
  readonly gold: GoldPiece[];
  readonly backToJar: Batch;
}

const empty = (): Batch => ({ sand: 0, gold: [] });

export class SpiralWheel {
  readonly tray: Batch = empty();
  readonly wheel: Batch = empty();
  readonly cup: Batch = empty();
  readonly tailings: Batch = empty();
  /** Set level when it's set up; a wheel off level sends everything to one side. */
  leveled = false;

  constructor(private readonly rng: Rng) {}

  /** How hard the tilt and spray work together. */
  static power(controls: SpiralControls): number {
    return clamp01(controls.tilt) * 0.5 + clamp01(controls.spray) * 0.5;
  }

  static classify(power: number): SpiralState {
    if (power < SPIRAL_TUNING.balancedFrom) return 'underpowered';
    if (power > SPIRAL_TUNING.balancedTo) return 'overpowered';
    return 'balanced';
  }

  get trayFull(): boolean {
    return this.tray.sand >= SPIRAL_TUNING.trayMax - 1e-9;
  }

  get bucketFull(): boolean {
    return this.tailings.sand >= SPIRAL_TUNING.bucketMax - 1e-9;
  }

  /** Nothing in the tray or on the wheel: the run is over. */
  get idle(): boolean {
    return this.tray.sand < 1e-6 && this.wheel.sand < 1e-6 && this.wheel.gold.length === 0;
  }

  /** A scoop from the jar into the feed tray; its gold comes with it in proportion. Returns how much went in. */
  scoopFrom(jar: { blackSand: number; magnetite: number; gold: GoldPiece[] }): number {
    const amount = Math.min(jar.blackSand, SPIRAL_TUNING.scoop, SPIRAL_TUNING.trayMax - this.tray.sand);
    if (amount <= 1e-6) return 0;
    this.take(jar, amount, this.tray);
    return amount;
  }

  /** Pour the tailings bucket back into the tray, to run it again. */
  rerunTailings(): void {
    const room = Math.max(0, SPIRAL_TUNING.trayMax - this.tray.sand);
    if (room <= 1e-6 || this.tailings.sand <= 1e-6) return;
    const amount = Math.min(room, this.tailings.sand);
    this.move(this.tailings, amount, this.tray);
  }

  /** Dump the tailings: sand and whatever gold went over the rim. Returns the pieces lost (never shown). */
  dumpTailings(): GoldPiece[] {
    const lost = this.tailings.gold;
    this.tailings.sand = 0;
    this.tailings.gold = [];
    return lost;
  }

  /**
   * Lift the cup. Clean, every piece is picked out; with sand in it, the fines (and some flakes)
   * are hidden and go back to the jar with the sand.
   */
  liftCup(): CupHarvest {
    const dirty = Math.min(0.9, this.cup.sand / SPIRAL_TUNING.cupDirty);
    const gold: GoldPiece[] = [];
    const back: GoldPiece[] = [];
    for (const piece of this.cup.gold) {
      const hide = piece.size === 'fine' ? dirty : piece.size === 'flake' ? dirty * 0.4 : 0;
      (this.rng.next() < hide ? back : gold).push(piece);
    }
    const backToJar = { sand: this.cup.sand, gold: back };
    this.cup.sand = 0;
    this.cup.gold = [];
    return { gold, backToJar };
  }

  /** Everything on the machine, for a save to count back into the jar without disturbing the run. */
  contents(): { sand: number; gold: GoldPiece[] } {
    const all = [this.tray, this.wheel, this.cup, this.tailings];
    return { sand: all.reduce((n, b) => n + b.sand, 0), gold: all.flatMap((b) => b.gold) };
  }

  /** Everything on the machine back into the jar: stepping away from it mid-run. */
  emptyInto(jar: { blackSand: number; magnetite: number; gold: GoldPiece[] }, magnetiteShare: number): void {
    for (const b of [this.tray, this.wheel, this.cup, this.tailings]) {
      jar.blackSand += b.sand;
      jar.magnetite += b.sand * magnetiteShare;
      jar.gold.push(...b.gold);
      b.sand = 0;
      b.gold = [];
    }
  }

  step(dt: number, controls: SpiralControls): SpiralStepEvents {
    const T = SPIRAL_TUNING;
    const power = SpiralWheel.power(controls);
    const state = SpiralWheel.classify(power);
    if (!this.leveled || this.bucketFull) return { state, fed: 0, spilled: 0, toCup: 0, overRim: 0, crowded: false };

    // Feed: from the tray's low end onto the wheel.
    const fed = Math.min(this.tray.sand, clamp01(controls.feed) * T.feedMax * dt);
    if (fed > 0) this.move(this.tray, fed, this.wheel);

    // Sand climbs the spiral and spills off the rim, faster the harder the wheel is worked.
    const clear = T.clearRate * (power / 0.5) ** 1.5;
    const spilled = Math.min(this.wheel.sand, this.wheel.sand * clear * dt, T.bucketMax - this.tailings.sand);
    this.tailings.sand += spilled;
    this.wheel.sand -= spilled;

    // Crowded: sand piles to the centre and slides into the cup.
    const excess = Math.max(0, this.wheel.sand - T.crowdAt);
    const crowded = excess > 0;
    const leak = excess * T.crowdLeak * dt;
    this.wheel.sand -= leak;
    this.cup.sand += leak;
    const crowding = Math.min(1, excess / T.crowdAt);

    // Gold: rides to the cup, or goes over the rim.
    const over = Math.max(0, (power - T.balancedTo) / (1 - T.balancedTo));
    let toCup = 0;
    let overRim = 0;
    this.wheel.gold = this.wheel.gold.filter((piece) => {
      const r = this.rng.next();
      const loss = (T.baseLoss[piece.size] + T.overLoss[piece.size] * over) * dt;
      if (r < loss) {
        this.tailings.gold.push(piece);
        overRim += 1;
        return false;
      }
      if (r < loss + T.cupRate[piece.size] * (1 - 0.6 * crowding) * dt) {
        this.cup.gold.push(piece);
        toCup += 1;
        return false;
      }
      return true;
    });
    return { state, fed, spilled, toCup, overRim, crowded };
  }

  /** Take `amount` of the jar's sand, with its gold in proportion, into `to`. */
  private take(jar: { blackSand: number; magnetite: number; gold: GoldPiece[] }, amount: number, to: Batch): void {
    const share = Math.min(1, amount / Math.max(jar.blackSand, 1e-9));
    jar.magnetite -= jar.magnetite * share;
    jar.blackSand -= amount;
    if (jar.blackSand < 1e-9) jar.blackSand = 0;
    jar.gold = jar.gold.filter((piece) => {
      if (share < 1 && this.rng.next() >= share) return true;
      to.gold.push(piece);
      return false;
    });
    to.sand += amount;
  }

  /** Move sand from one batch to another, its gold going in proportion. */
  private move(from: Batch, amount: number, to: Batch): void {
    const share = Math.min(1, amount / Math.max(from.sand, 1e-9));
    from.sand -= amount;
    if (from.sand < 1e-9) from.sand = 0;
    from.gold = from.gold.filter((piece) => {
      if (share < 1 && this.rng.next() >= share) return true;
      to.gold.push(piece);
      return false;
    });
    to.sand += amount;
  }
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}
