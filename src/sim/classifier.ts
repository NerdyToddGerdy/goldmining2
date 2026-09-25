import { totalMg, type GoldPiece, type Rock, type Shovelful } from './pan';
import type { Rng } from './rng';

/**
 * Hand classifier: a screen sitting on a bucket (see issue #1 and "Material Chains" in the
 * design doc). A shovelful goes on the screen; shaking it lets sized material fall through into
 * the bucket while oversize rocks stay on top. Rocks can be inspected one by one for wedged
 * pickers, or tipped off unexamined. The bucket of clean, even material then goes to the sluice
 * or the pan.
 *
 * Two screens: coarse passes everything but rocks, quickly; fine also holds back pebbles, so what
 * reaches the bucket is less volume for the same gold, but it passes slowly and blinds more.
 * Gold always passes: even a picker is smaller than the fine mesh. Nothing here needs a screen.
 */

export type ScreenSize = 'coarse' | 'fine';

/** Material that has been through the screen: no rocks, and with a fine screen, no pebbles. */
export interface ScreenedMaterial {
  readonly light: number;
  readonly black: number;
  readonly clay: number;
  readonly gold: readonly GoldPiece[];
}

export const CLASSIFIER_TUNING = {
  /** Volume shaken through per second on a clean mesh. */
  passRate: { coarse: 0.4, fine: 0.2 } as Record<ScreenSize, number>,
  /** Share of a shovelful's light material that is pebbles: through a coarse screen, held by a fine one. */
  pebbleShare: 0.3,
  /** How much each rock on the screen blinds the mesh. */
  blindPerRock: 0.07,
  /** How much each unit of pebbles blinds a fine mesh. */
  blindPerPebble: 1.2,
  maxBlind: 0.85,
  /** The bucket holds about three shovelfuls of screened material. */
  bucketCapacity: 2.2,
} as const;

interface OnScreen {
  light: number;
  black: number;
  clay: number;
  /** Held on a fine screen only; on a coarse screen pebbles are counted in `light`. */
  pebbles: number;
  gold: GoldPiece[];
  rocks: Rock[];
}

export interface ClassifierSnapshot {
  readonly screen: ScreenSize;
  readonly onScreen: OnScreen | null;
  readonly bucket: { readonly light: number; readonly black: number; readonly clay: number; readonly gold: readonly GoldPiece[] };
}

export type LoadResult = 'loaded' | 'screenBusy' | 'bucketFull';

export class Classifier {
  screen: ScreenSize = 'coarse';
  private onScreen: OnScreen | null = null;
  private bucket: { light: number; black: number; clay: number; gold: GoldPiece[] } = { light: 0, black: 0, clay: 0, gold: [] };
  /** Gold lost off the screen: pickers in rocks tipped off unexamined, or material tipped before it passed. */
  readonly lost: GoldPiece[] = [];

  constructor(
    private readonly rng: Rng,
    saved?: ClassifierSnapshot,
  ) {
    if (!saved) return;
    const copy = structuredClone(saved) as { screen: ScreenSize; onScreen: OnScreen | null; bucket: Classifier['bucket'] };
    this.screen = copy.screen;
    this.onScreen = copy.onScreen;
    this.bucket = copy.bucket;
  }

  snapshot(): ClassifierSnapshot {
    return structuredClone({ screen: this.screen, onScreen: this.onScreen, bucket: this.bucket });
  }

  /** Material still on the screen that shaking can get through. */
  get passable(): number {
    const s = this.onScreen;
    return s ? s.light + s.black + s.clay : 0;
  }

  /** Rocks sitting on the screen, for drawing and inspecting. */
  get rocks(): readonly Rock[] {
    return this.onScreen?.rocks ?? [];
  }

  /** Pebbles held on a fine screen. */
  get pebbles(): number {
    return this.onScreen?.pebbles ?? 0;
  }

  get hasLoad(): boolean {
    return this.onScreen !== null;
  }

  /** How badly oversize is blinding the mesh, 0..maxBlind. */
  get blinding(): number {
    const T = CLASSIFIER_TUNING;
    const s = this.onScreen;
    if (!s) return 0;
    return Math.min(T.maxBlind, s.rocks.length * T.blindPerRock + s.pebbles * T.blindPerPebble);
  }

  get bucketVolume(): number {
    return this.bucket.light + this.bucket.black + this.bucket.clay;
  }

  get bucketFull(): boolean {
    return this.bucketVolume >= CLASSIFIER_TUNING.bucketCapacity;
  }

  get bucketGoldCount(): number {
    return this.bucket.gold.length;
  }

  /** Everything passable is through: only oversize is left to deal with. */
  get screened(): boolean {
    return this.onScreen !== null && this.passable < 0.005;
  }

  /** Swap screens. Only with nothing on the mesh. */
  setScreen(size: ScreenSize): boolean {
    if (this.onScreen) return false;
    this.screen = size;
    return true;
  }

  /** Put a shovelful on the screen. One at a time, and not into a full bucket. */
  load(shovelful: Shovelful): LoadResult {
    if (this.onScreen) return 'screenBusy';
    if (this.bucketFull) return 'bucketFull';
    const fine = this.screen === 'fine';
    const pebbles = fine ? shovelful.lightSand * CLASSIFIER_TUNING.pebbleShare : 0;
    this.onScreen = {
      light: shovelful.lightSand - pebbles,
      black: shovelful.blackSand,
      clay: shovelful.clay,
      pebbles,
      gold: [...shovelful.gold],
      rocks: [...shovelful.rocks],
    };
    return 'loaded';
  }

  /** Shake the screen. Returns the volume that fell through into the bucket this step. */
  step(dt: number, shake: number): number {
    const s = this.onScreen;
    if (!s || shake <= 0) return 0;
    const T = CLASSIFIER_TUNING;
    const room = Math.max(0, T.bucketCapacity - this.bucketVolume);
    const held = this.passable;
    const passed = Math.min(held, room, T.passRate[this.screen] * shake * (1 - this.blinding) * dt);
    if (passed <= 0) return 0;
    const share = passed / held;
    const light = s.light * share;
    const black = s.black * share;
    const clay = s.clay * share;
    s.light -= light;
    s.black -= black;
    s.clay -= clay;
    this.bucket.light += light;
    this.bucket.black += black;
    this.bucket.clay += clay;
    s.gold = s.gold.filter((piece) => {
      if (share >= 1 || this.rng.next() < share) {
        this.bucket.gold.push(piece);
        return false;
      }
      return true;
    });
    // The last of it: make sure nothing is stranded by rounding.
    if (this.passable < 0.005) {
      this.bucket.light += s.light;
      this.bucket.black += s.black;
      this.bucket.clay += s.clay;
      this.bucket.gold.push(...s.gold);
      s.light = s.black = s.clay = 0;
      s.gold = [];
    }
    return passed;
  }

  /** Pick a rock off the screen and look it over. Returns the picker if one was wedged in it. */
  inspectRock(rockId: number): GoldPiece | null {
    const s = this.onScreen;
    if (!s) return null;
    const index = s.rocks.findIndex((r) => r.id === rockId);
    if (index < 0) return null;
    const [rock] = s.rocks.splice(index, 1);
    return rock?.stuckPicker ?? null;
  }

  /**
   * Tip everything left on the screen onto the spoil pile. Unexamined rocks take their pickers
   * with them, and anything not yet shaken through goes too. Returns the gold that went.
   */
  tipOff(): GoldPiece[] {
    const s = this.onScreen;
    if (!s) return [];
    const gone = [...s.gold, ...s.rocks.flatMap((r) => (r.stuckPicker ? [r.stuckPicker] : []))];
    this.lost.push(...gone);
    this.onScreen = null;
    return gone;
  }

  /**
   * Pour up to `maxVolume` out of the bucket. Gold comes with its share of the volume; pouring
   * everything brings every piece.
   */
  pour(maxVolume: number): ScreenedMaterial | null {
    const total = this.bucketVolume;
    if (total < 0.005) return null;
    const amount = Math.min(total, maxVolume);
    const share = amount / total;
    const b = this.bucket;
    const light = b.light * share;
    const black = b.black * share;
    const clay = b.clay * share;
    b.light -= light;
    b.black -= black;
    b.clay -= clay;
    const gold: GoldPiece[] = [];
    b.gold = b.gold.filter((piece) => {
      if (share >= 0.999 || this.rng.next() < share) {
        gold.push(piece);
        return false;
      }
      return true;
    });
    if (share >= 0.999) b.light = b.black = b.clay = 0;
    return { light, black, clay, gold };
  }

  /** Gold in the bucket and on the screen, for tests and bookkeeping. */
  get heldMg(): number {
    const s = this.onScreen;
    return totalMg(this.bucket.gold) + (s ? totalMg(s.gold) + totalMg(s.rocks.flatMap((r) => (r.stuckPicker ? [r.stuckPicker] : []))) : 0);
  }
}
