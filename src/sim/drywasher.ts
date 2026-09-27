import { rollShovelful, totalMg, type GoldPiece, type GoldSize, type PanLoad, type Rock } from './pan';
import type { Rng } from './rng';

/**
 * Drywasher (see the gear interaction matrix and "Dry-wash chain" in the design doc: "Pulse and
 * separate · air and dust move through riffles; concentrate remains · airflow, dust buildup, feed
 * consistency").
 *
 * No water anywhere. Dry gravel goes on a screen at the top; fines drop onto a sloped riffle tray
 * with a cloth bottom, and a hand bellows under the cloth puffs air up through it. Each puff lifts
 * the light sand so it drifts down the tray and off the end in a cloud of dust, while the heavies
 * settle behind the riffles and work down into the concentrate drawer. The player works the bellows
 * and sets the air gate:
 *
 * - Underblown: too little air. The bed never loosens, heavies don't separate, the drawer fills
 *   with plain sand, and gold rides off with the unsorted mass.
 * - Balanced: light sand drifts off, heavies stay.
 * - Overblown: fine gold goes up with the dust and away.
 *
 * Dust (from dry clay and silt) builds up in the cloth and chokes the airflow until it's shaken
 * out; dry clay lumps blind the screen until it's knocked clear. Nothing here needs a screen.
 */

export const DRYWASHER_TUNING = {
  /** Washable material through the screen per second while the bellows work, with a clear screen. */
  passRate: 0.25,
  /** The screen holds about a shovelful and a bit. */
  hopperMax: 1.1,
  /** Air (after dust) below which the bed is underblown, and above which it is overblown. */
  under: 0.35,
  over: 0.7,
  /** Share of light sand blown off the end at full air; the rest stays in the drawer as junk. */
  blowOff: 1.6,
  capture: { fine: 0.85, flake: 0.95, picker: 0.99 } as Record<GoldSize, number>,
  underLoss: { fine: 0.35, flake: 0.2, picker: 0.02 } as Record<GoldSize, number>,
  overLoss: { fine: 0.75, flake: 0.3, picker: 0 } as Record<GoldSize, number>,
  blackCapture: 0.75,
  /** How much the dust in the cloth chokes the air at its worst. */
  dustChoke: 0.7,
  /** Dust per unit of material through: a little from any dry sand, much more from clay. */
  dustPerMaterial: 0.05,
  dustPerClay: 1.2,
  /** Screen blinding from dry clay lumps, per unit of clay through. */
  clogPerClay: 1.5,
  /** Shaking out the cloth lets a few fines go with the dust. */
  shakeOutFines: 0.03,
  /** The drawer holds this much before it starts losing what it catches. */
  drawerCapacity: 0.45,
  fullFrom: 0.6,
  fullLoss: 0.6,
} as const;

export type DrywasherState = 'still' | 'underblown' | 'balanced' | 'overblown';

export interface DrywasherStepEvents {
  readonly state: DrywasherState;
  /** Material through the screen this step. */
  readonly passed: number;
  /** Light sand and dust blown off the end this step. */
  readonly blown: number;
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

export interface DrywasherSnapshot {
  readonly hopper: Hopper;
  readonly drawer: { readonly black: number; readonly light: number; readonly gold: readonly GoldPiece[] };
  readonly dust: number;
  readonly screenClog: number;
  readonly fedMg: number;
}

export class Drywasher {
  private hopper: Hopper = emptyHopper();
  private drawer: { black: number; light: number; gold: GoldPiece[] } = { black: 0, light: 0, gold: [] };
  /** 0 clean cloth, 1 choked with dust. */
  dust = 0;
  /** 0 clear screen, 1 blinded. */
  screenClog = 0;
  /** Gold lost since this drywasher was loaded; not saved (it travels with the player for good). */
  readonly lost: GoldPiece[] = [];
  fedMg = 0;

  constructor(
    private readonly rng: Rng,
    saved?: DrywasherSnapshot,
  ) {
    if (!saved) return;
    const copy = structuredClone(saved) as DrywasherSnapshot & { hopper: Hopper; drawer: { black: number; light: number; gold: GoldPiece[] } };
    this.hopper = copy.hopper;
    this.drawer = copy.drawer;
    this.dust = copy.dust;
    this.screenClog = copy.screenClog;
    this.fedMg = copy.fedMg;
  }

  snapshot(): DrywasherSnapshot {
    return structuredClone({ hopper: this.hopper, drawer: this.drawer, dust: this.dust, screenClog: this.screenClog, fedMg: this.fedMg });
  }

  get hopperVolume(): number {
    return this.hopper.light + this.hopper.black + this.hopper.clay;
  }

  get hopperRocks(): number {
    return this.hopper.rocks.length;
  }

  get hasLoad(): boolean {
    return this.hopperVolume > 0.005 || this.hopper.rocks.length > 0;
  }

  get screened(): boolean {
    return this.hopperVolume <= 0.005 && this.hopper.rocks.length > 0;
  }

  get hopperFull(): boolean {
    return this.hopperVolume >= DRYWASHER_TUNING.hopperMax;
  }

  get hopperRoom(): number {
    return Math.max(0, DRYWASHER_TUNING.hopperMax - this.hopperVolume);
  }

  /** 0 empty, 1 full. The true value; readouts stay in words. */
  get drawerLoading(): number {
    return Math.min(1, (this.drawer.black + this.drawer.light) / DRYWASHER_TUNING.drawerCapacity);
  }

  get drawerVolume(): number {
    return this.drawer.black + this.drawer.light;
  }

  get drawerGoldCount(): number {
    return this.drawer.gold.length;
  }

  /** The air that actually reaches the bed through the dust in the cloth. */
  effectiveAir(air: number): number {
    return clamp01(air) * (1 - DRYWASHER_TUNING.dustChoke * this.dust);
  }

  classify(air: number): Exclude<DrywasherState, 'still'> {
    const a = this.effectiveAir(air);
    if (a < DRYWASHER_TUNING.under) return 'underblown';
    if (a > DRYWASHER_TUNING.over) return 'overblown';
    return 'balanced';
  }

  feed(load: PanLoad): boolean {
    if (this.hopperFull) return false;
    const s = rollShovelful(this.rng, load);
    this.addToHopper(s.lightSand, s.blackSand, s.clay, s.rocks, s.gold);
    return true;
  }

  feedScreened(material: { light: number; black: number; clay: number; gold: readonly GoldPiece[] }): boolean {
    if (this.hopperFull) return false;
    this.addToHopper(material.light, material.black, material.clay, [], material.gold);
    return true;
  }

  private addToHopper(light: number, black: number, clay: number, rocks: readonly Rock[], gold: readonly GoldPiece[]): void {
    this.hopper.light += light;
    this.hopper.black += black;
    this.hopper.clay += clay;
    this.hopper.rocks.push(...rocks);
    this.hopper.gold.push(...gold);
    this.fedMg += totalMg(gold) + totalMg(rocks.flatMap((r) => (r.stuckPicker ? [r.stuckPicker] : [])));
  }

  /** One slice of time. `pumping`: the bellows are being worked. `air`: the air gate, 0..1. */
  step(dt: number, pumping: boolean, air: number): DrywasherStepEvents {
    const T = DRYWASHER_TUNING;
    const rng = this.rng;
    if (!pumping) return { state: 'still', passed: 0, blown: 0, goldLost: 0, glint: false };
    const effective = this.effectiveAir(air);
    const state = this.classify(air);
    const under = clamp01((T.under - effective) / T.under);
    const over = clamp01((effective - T.over) / (1 - T.over));

    const held = this.hopperVolume;
    const amount = Math.min(held, T.passRate * (1 - this.screenClog) * dt);
    const share = held > 0 ? amount / held : 0;
    const light = this.hopper.light * share;
    const black = this.hopper.black * share;
    const clay = this.hopper.clay * share;
    this.hopper.light -= light;
    this.hopper.black -= black;
    this.hopper.clay -= clay;

    // Dry clay blinds the screen and turns to dust in the cloth; any dry sand leaves a little dust.
    this.screenClog = Math.min(0.95, this.screenClog + clay * T.clogPerClay);
    this.dust = Math.min(1, this.dust + amount * T.dustPerMaterial + clay * T.dustPerClay);

    const fullness = clamp01((this.drawerLoading - T.fullFrom) / (1 - T.fullFrom)) * T.fullLoss;
    let goldLost = 0;
    this.hopper.gold = this.hopper.gold.filter((piece) => {
      if (share < 1 && rng.next() >= share) return true;
      const caught = T.capture[piece.size] * (1 - T.underLoss[piece.size] * under) * (1 - T.overLoss[piece.size] * over) * (1 - fullness);
      if (rng.next() < caught) this.drawer.gold.push(piece);
      else {
        this.lost.push(piece);
        goldLost += 1;
      }
      return false;
    });

    // Light sand: blown off with enough air, left in the drawer as junk when underblown.
    const blownShare = clamp01(effective * T.blowOff);
    const room = Math.max(0, T.drawerCapacity * 1.2 - this.drawer.black - this.drawer.light);
    const blackKept = Math.min(room, black * T.blackCapture * (1 - 0.6 * over) * (1 - fullness));
    this.drawer.black += blackKept;
    this.drawer.light += Math.min(room - blackKept, light * (1 - blownShare));
    const blown = light * blownShare + clay + (black - blackKept);
    const glint = this.drawer.gold.length > 0 && rng.next() < Math.min(0.3, this.drawer.gold.length * 0.02) * dt * 4;
    return { state, passed: amount, blown, goldLost, glint };
  }

  /** Beat the dust out of the cloth. A few fines go with it. */
  shakeOutDust(): void {
    this.dust = 0;
    this.drawer.gold = this.drawer.gold.filter((piece) => {
      if (piece.size !== 'fine' || this.rng.next() >= DRYWASHER_TUNING.shakeOutFines) return true;
      this.lost.push(piece);
      return false;
    });
  }

  /** Rap the screen to knock the dry clay out of the mesh. */
  knockScreen(): void {
    this.screenClog = 0;
  }

  /** Tip the screen off: rocks, and any gravel not yet through, gold and all. */
  tipOff(): number {
    const pickers = this.hopper.rocks.flatMap((r) => (r.stuckPicker ? [r.stuckPicker] : []));
    const gold = [...this.hopper.gold, ...pickers];
    this.lost.push(...gold);
    this.hopper = emptyHopper();
    return gold.length;
  }

  /** Pull the concentrate drawer: what it caught, to be panned. */
  pullDrawer(): { blackSand: number; gold: GoldPiece[] } {
    const concentrate = { blackSand: this.drawer.black + this.drawer.light, gold: this.drawer.gold };
    this.drawer = { black: 0, light: 0, gold: [] };
    return concentrate;
  }
}

function emptyHopper(): Hopper {
  return { light: 0, black: 0, clay: 0, rocks: [], gold: [] };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
