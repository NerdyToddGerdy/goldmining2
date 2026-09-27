import { rollShovelful, totalMg, type GoldPiece, type GoldSize, type PanLoad, type Rock } from './pan';
import type { Rng } from './rng';

/**
 * Rocker box (see the gear interaction matrix in the design doc: "Rock · material advances with
 * limited water · rhythm and water conservation").
 *
 * A box on curved rockers. Gravel goes on the hopper screen at the top; the player ladles water
 * over it from a bucket and rocks the box. Each stroke washes fines through the screen onto a
 * canvas apron and down over riffles, where gold and black sand are caught; light sand and water
 * run out of the end. Rocks stay on the screen to be tipped off.
 *
 * - Stalled: too little water in the box, or strokes too far apart. Material barely moves, and
 *   clay never breaks up.
 * - Rocking steady: a steady beat with water enough to carry the fines. Good recovery.
 * - Sloshing: strokes too quick, or the box flooded. Material shoots over the riffles, and water
 *   pouring over a flooded apron strips fines out of it.
 *
 * Water is the limit. Every stroke carries some out of the end, and the bucket holds only so many
 * ladles; fetching more costs time, which depends on the site (see SiteTraits.fetchSeconds).
 * Nothing here needs a screen.
 */

export const ROCKER_TUNING = {
  /** Ladles in a full bucket. */
  bucketLadles: 10,
  /** Water level (0..1+) one ladle adds to the box. */
  ladle: 0.22,
  /** Water carried out of the end per stroke, and drained per second standing. */
  strokeWater: 0.035,
  drain: 0.01,
  /** Below this the box is too dry to carry material; above floodFrom it floods. */
  lowWater: 0.12,
  goodWater: 0.35,
  floodFrom: 0.8,
  maxWater: 1.2,
  /** A steady beat: strokes this far apart, in seconds. */
  beat: { min: 0.6, max: 1.5 },
  /** Share of the hopper's washable material through the screen per good stroke. */
  strokeMove: 0.3,
  /** The hopper holds about a shovelful and a bit. */
  hopperMax: 1.1,
  clayBreak: 0.3,
  capture: { fine: 0.86, flake: 0.96, picker: 0.99 } as Record<GoldSize, number>,
  /** Capture lost at full slosh (strokes far too quick) and at full flood. */
  choppyLoss: { fine: 0.7, flake: 0.45, picker: 0.05 } as Record<GoldSize, number>,
  floodLoss: { fine: 0.6, flake: 0.2, picker: 0 } as Record<GoldSize, number>,
  /** Fines stripped out of the apron per flooded stroke, at full flood. */
  floodScour: 0.04,
  clayGoldCarry: 0.5,
  blackCapture: 0.75,
  lightTrap: 0.03,
  /** Apron and riffle load: capture falls off past fullFrom, like the sluice's moss. */
  apronCapacity: 0.4,
  fullFrom: 0.6,
  fullLoss: 0.6,
} as const;

export type RockerState = 'stalled' | 'steady' | 'sloshing';

export interface RockerStroke {
  readonly state: RockerState;
  /** Material washed through the screen by this stroke. */
  readonly released: number;
  readonly goldLost: number;
  readonly glint: boolean;
}

interface Hopper {
  light: number;
  black: number;
  clay: number;
  rocks: Rock[];
  gold: GoldPiece[];
}

export interface RockerSnapshot {
  readonly hopper: Hopper;
  readonly apron: { readonly black: number; readonly light: number; readonly gold: readonly GoldPiece[] };
  readonly water: number;
  readonly bucket: number;
  readonly elapsed: number;
  readonly lastStroke: number;
  readonly fedMg: number;
}

export class Rocker {
  private hopper: Hopper = emptyHopper();
  private apron: { black: number; light: number; gold: GoldPiece[] } = { black: 0, light: 0, gold: [] };
  /** Water standing in the box, 0 dry to 1 brim full. */
  water = 0;
  /** Ladles left in the bucket. */
  bucket: number = ROCKER_TUNING.bucketLadles;
  elapsed = 0;
  private lastStroke = -10;
  /** Gold washed out or tipped off since this rocker was loaded; not saved, since it travels with the player for good. */
  readonly lost: GoldPiece[] = [];
  fedMg = 0;

  constructor(
    private readonly rng: Rng,
    saved?: RockerSnapshot,
  ) {
    if (!saved) return;
    const copy = structuredClone(saved) as RockerSnapshot & { hopper: Hopper; apron: { black: number; light: number; gold: GoldPiece[] } };
    this.hopper = copy.hopper;
    this.apron = copy.apron;
    this.water = copy.water;
    this.bucket = copy.bucket;
    this.elapsed = copy.elapsed;
    this.lastStroke = copy.lastStroke;
    this.fedMg = copy.fedMg;
  }

  snapshot(): RockerSnapshot {
    return structuredClone({
      hopper: this.hopper,
      apron: this.apron,
      water: this.water,
      bucket: this.bucket,
      elapsed: this.elapsed,
      lastStroke: this.lastStroke,
      fedMg: this.fedMg,
    });
  }

  /** Washable material still on the screen (rocks aside). */
  get hopperVolume(): number {
    return this.hopper.light + this.hopper.black + this.hopper.clay;
  }

  get hopperRocks(): number {
    return this.hopper.rocks.length;
  }

  get hasLoad(): boolean {
    return this.hopperVolume > 0.005 || this.hopper.rocks.length > 0;
  }

  /** Only rocks left on the screen. */
  get screened(): boolean {
    return this.hopperVolume <= 0.005 && this.hopper.rocks.length > 0;
  }

  get hopperFull(): boolean {
    return this.hopperVolume >= ROCKER_TUNING.hopperMax;
  }

  /** 0 fresh, 1 full. The true value; readouts stay in words. */
  get apronLoading(): number {
    return Math.min(1, (this.apron.black + this.apron.light) / ROCKER_TUNING.apronCapacity);
  }

  get apronGoldCount(): number {
    return this.apron.gold.length;
  }

  /** What cleaning up would bring off the apron and riffles. */
  get apronVolume(): number {
    return this.apron.black + this.apron.light;
  }

  /** Shovel a load onto the hopper screen. Refused when brim full. */
  feed(load: PanLoad): boolean {
    if (this.hopperFull) return false;
    const s = rollShovelful(this.rng, load);
    this.addToHopper(s.lightSand, s.blackSand, s.clay, s.rocks, s.gold);
    return true;
  }

  /** Pour screened material (the classifier's bucket) onto the hopper: no rocks. */
  feedScreened(material: { light: number; black: number; clay: number; gold: readonly GoldPiece[] }): boolean {
    if (this.hopperFull) return false;
    this.addToHopper(material.light, material.black, material.clay, [], material.gold);
    return true;
  }

  get hopperRoom(): number {
    return Math.max(0, ROCKER_TUNING.hopperMax - this.hopperVolume);
  }

  private addToHopper(light: number, black: number, clay: number, rocks: readonly Rock[], gold: readonly GoldPiece[]): void {
    this.hopper.light += light;
    this.hopper.black += black;
    this.hopper.clay += clay;
    this.hopper.rocks.push(...rocks);
    this.hopper.gold.push(...gold);
    this.fedMg += totalMg(gold) + totalMg(rocks.flatMap((r) => (r.stuckPicker ? [r.stuckPicker] : [])));
  }

  /** Pour a ladle from the bucket over the hopper. Returns false with the bucket empty. */
  ladle(): boolean {
    if (this.bucket <= 0) return false;
    this.bucket -= 1;
    this.water = Math.min(ROCKER_TUNING.maxWater, this.water + ROCKER_TUNING.ladle);
    return true;
  }

  /** Fill the bucket (the game layer makes the player wait while it's fetched). */
  fillBucket(): void {
    this.bucket = ROCKER_TUNING.bucketLadles;
  }

  /** Time passing between strokes: water seeps out of the box. */
  step(dt: number): void {
    this.elapsed += dt;
    this.water = Math.max(0, this.water - ROCKER_TUNING.drain * dt);
  }

  /** Seconds since the last stroke. */
  get sinceStroke(): number {
    return this.elapsed - this.lastStroke;
  }

  /** How the box would run right now, for the readout. */
  get state(): RockerState {
    const since = this.sinceStroke;
    if (this.water > ROCKER_TUNING.floodFrom) return 'sloshing';
    if (this.water < ROCKER_TUNING.lowWater || since > ROCKER_TUNING.beat.max * 2) return 'stalled';
    return 'steady';
  }

  /** One stroke of the rocker. The time since the last one sets the rhythm. */
  rock(): RockerStroke {
    const T = ROCKER_TUNING;
    const rng = this.rng;
    const interval = this.elapsed - this.lastStroke;
    this.lastStroke = this.elapsed;

    const choppy = clamp01((T.beat.min - interval) / T.beat.min);
    const sluggish = interval > T.beat.max ? T.beat.max / interval : 1;
    const flood = clamp01((this.water - T.floodFrom) / (T.maxWater - T.floodFrom));
    const wet = clamp01(this.water / T.goodWater);
    const dry = this.water < T.lowWater;
    const state: RockerState = choppy > 0.2 || flood > 0 ? 'sloshing' : dry || sluggish < 0.6 ? 'stalled' : 'steady';

    // Every stroke carries water out of the end; a flooded box slops more over.
    this.water = Math.max(0, this.water - T.strokeWater * (1 + flood * 2 + choppy));

    // Clay breaks up with water and motion; until it does, it holds the material together.
    if (!dry) this.hopper.clay = Math.max(0, this.hopper.clay - this.hopper.clay * T.clayBreak * wet);
    if (this.hopper.clay < 0.004) this.hopper.clay = 0;

    const held = this.hopper.light + this.hopper.black;
    const move = dry ? 0 : T.strokeMove * wet * sluggish * (1 + choppy * 0.5);
    const share = held > 0 ? Math.min(1, move) : 0;
    const light = this.hopper.light * share;
    const black = this.hopper.black * share;
    this.hopper.light -= light;
    this.hopper.black -= black;
    // Clay balls rolling through carry gold with them.
    const clayShare = this.hopper.clay > 0 ? Math.min(1, this.hopper.clay / Math.max(held, 0.05)) : 0;

    const fullness = clamp01((this.apronLoading - T.fullFrom) / (1 - T.fullFrom)) * T.fullLoss;
    let goldLost = 0;
    this.hopper.gold = this.hopper.gold.filter((piece) => {
      if (rng.next() >= share) return true;
      const caught =
        T.capture[piece.size] * (1 - T.choppyLoss[piece.size] * choppy) * (1 - T.floodLoss[piece.size] * flood) * (1 - fullness) * (1 - clayShare * T.clayGoldCarry);
      if (rng.next() < caught) this.apron.gold.push(piece);
      else {
        this.lost.push(piece);
        goldLost += 1;
      }
      return false;
    });

    // Water pouring over a flooded apron lifts fines back out.
    if (flood > 0) {
      this.apron.gold = this.apron.gold.filter((piece) => {
        if (piece.size !== 'fine' || rng.next() >= flood * T.floodScour) return true;
        this.lost.push(piece);
        goldLost += 1;
        return false;
      });
    }

    const room = Math.max(0, T.apronCapacity * 1.2 - this.apron.black - this.apron.light);
    const blackCaught = Math.min(room, black * T.blackCapture * (1 - 0.6 * Math.max(choppy, flood)) * (1 - fullness));
    this.apron.black += blackCaught;
    this.apron.light += Math.min(room - blackCaught, light * T.lightTrap);
    const glint = this.apron.gold.length > 0 && rng.next() < Math.min(0.5, this.apron.gold.length * 0.03);
    return { state, released: light + black, goldLost, glint };
  }

  /** Tip whatever is on the screen off onto the spoil pile: rocks, and any unwashed gravel, gold and all. */
  tipOff(): number {
    const pickers = this.hopper.rocks.flatMap((r) => (r.stuckPicker ? [r.stuckPicker] : []));
    const gold = [...this.hopper.gold, ...pickers];
    this.lost.push(...gold);
    this.hopper = emptyHopper();
    return gold.length;
  }

  /** Lift the apron and scrape the riffles: the concentrate, to be panned. */
  cleanUp(): { blackSand: number; gold: GoldPiece[] } {
    const concentrate = { blackSand: this.apron.black + this.apron.light, gold: this.apron.gold };
    this.apron = { black: 0, light: 0, gold: [] };
    return concentrate;
  }
}

function emptyHopper(): Hopper {
  return { light: 0, black: 0, clay: 0, rocks: [], gold: [] };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
