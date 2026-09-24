import type { Rng } from './rng';

/**
 * Gold pan simulation (see "Pan UX Specification" in the design doc).
 *
 * The pan holds a load of creek gravel: light sand, black sand, unbroken clay, oversize rocks,
 * and discrete gold pieces. The player controls tilt, swirl, and shake. Washing removes light
 * sand over the lip; washing harder than the current stratification can hold also loses black
 * sand and gold. Shaking re-stratifies (heavies sink) and breaks clay; swirling slowly mixes the
 * layers again. Gold stays hidden until the player chooses to stop and reveal.
 */

export type GoldSize = 'fine' | 'flake' | 'picker';

export interface GoldPiece {
  readonly id: number;
  readonly size: GoldSize;
  readonly mg: number;
}

export interface Rock {
  readonly id: number;
  /** A picker wedged in a crack. Only discovered when the rock is raked out and inspected. */
  readonly stuckPicker: GoldPiece | null;
}

export interface PanControls {
  /** 0 = level, 1 = tipped hard toward the lip. */
  readonly tilt: number;
  /** 0 = still, 1 = fastest swirl. */
  readonly swirl: number;
  /** 0 = none, 1 = full side-to-side shake. */
  readonly shake: number;
}

export type PanState = 'timid' | 'balanced' | 'aggressive';
export type PanPhase = 'working' | 'revealed' | 'emptied';

/** Physical character of the ground a load was dug from. */
export interface DigSpot {
  /** Expected milligrams of gold in one pan-sized load. */
  readonly richness: number;
  /** 0..1 */
  readonly clayiness: number;
  /** 0..1 */
  readonly rockiness: number;
}

/** What visibly happened during one step, for the renderer to draw. */
export interface PanStepEvents {
  readonly state: PanState;
  /** Light sand washed over the lip this step (pan-volume fraction). */
  readonly lightSpilled: number;
  /** Black sand washed over the lip this step. The dark streak that signals loss. */
  readonly darkSpilled: number;
  readonly clayRolledOut: number;
  readonly glints: number;
}

/** Tuning constants, gathered so the feel can be adjusted in one place. */
export const PAN_TUNING = {
  /** Wash below this fraction of the safe limit reads as timid. */
  timidFraction: 0.35,
  /** Safe wash limit = base + perStrat × stratification. */
  safeLimitBase: 0.15,
  safeLimitPerStrat: 0.45,
  lightWashRate: 0.12,
  /**
   * Baseline heavy loss even within the safe limit, scaled by how unsorted the pan is and
   * rising steeply (cubed) as wash approaches the limit, so gentle panning is nearly lossless.
   */
  baseHeavyLoss: 0.012,
  /** Additional heavy loss per unit of wash above the safe limit. */
  excessHeavyLoss: 0.35,
  /** Washing once there is almost no light sand left strips the concentrate itself. */
  overworkLoss: 2,
  overworkBelowLight: 0.1,
  shakeStratRate: 0.6,
  shakeClayBreakRate: 0.8,
  swirlMixRate: 0.08,
  /** Clay balls roll out in proportion to wash squared: gentle water barely moves them. */
  clayRollRate: 0.8,
  /** Share of the gold in a clay ball's share of the pan that leaves with it. */
  clayGoldCarry: 0.5,
  /** Fraction of blocked wash per rock left in the pan. */
  rockBlock: 0.08,
  maxRockBlock: 0.6,
  turbidityDecay: 0.5,
  glintRate: 0.8,
  workedDownLight: 0.03,
  mobility: { fine: 1.6, flake: 0.8, picker: 0.15 } as Record<GoldSize, number>,
  /** How easily remaining light sand hides a piece at reveal. */
  hideFactor: { fine: 1, flake: 0.5, picker: 0.1 } as Record<GoldSize, number>,
  rockPickerChance: 0.03,
} as const;

let nextId = 1;
const newId = (): number => nextId++;

export class Pan {
  lightSand: number;
  blackSand: number;
  clay: number;
  /** 0 = fully mixed, 1 = heavies fully settled to the bottom. */
  stratification = 0.1;
  turbidity: number;
  rocks: Rock[];
  gold: GoldPiece[];
  readonly lost: GoldPiece[] = [];
  lostBlackSand = 0;
  phase: PanPhase = 'working';
  elapsed = 0;
  /** Set by reveal(): the pieces the player can see. The rest stay mixed in the black sand. */
  visible: GoldPiece[] = [];
  hidden: GoldPiece[] = [];

  readonly initialLightSand: number;

  constructor(
    private readonly rng: Rng,
    spot: DigSpot,
  ) {
    this.clay = spot.clayiness * rng.range(0.05, 0.18);
    this.blackSand = rng.range(0.03, 0.07);
    this.lightSand = 0.85 - this.clay - this.blackSand;
    this.initialLightSand = this.lightSand;
    this.turbidity = this.clay * 2;

    const rockCount = Math.round(spot.rockiness * rng.range(2, 7));
    this.rocks = Array.from({ length: rockCount }, () => ({
      id: newId(),
      stuckPicker: rng.next() < PAN_TUNING.rockPickerChance ? makePiece(rng, 'picker') : null,
    }));

    this.gold = [];
    let budget = spot.richness * rng.range(0.3, 1.8);
    while (budget > 0 && this.gold.length < 80) {
      const roll = rng.next();
      const size: GoldSize = roll < 0.7 ? 'fine' : roll < 0.97 ? 'flake' : 'picker';
      const piece = makePiece(rng, size);
      this.gold.push(piece);
      budget -= piece.mg;
    }
  }

  get workedDown(): boolean {
    return this.lightSand <= PAN_TUNING.workedDownLight;
  }

  /** Wash beyond which black sand and gold start going over the lip. */
  get safeLimit(): number {
    return PAN_TUNING.safeLimitBase + PAN_TUNING.safeLimitPerStrat * this.stratification;
  }

  effectiveWash(controls: PanControls): number {
    const block = Math.min(PAN_TUNING.maxRockBlock, this.rocks.length * PAN_TUNING.rockBlock);
    return clamp01(controls.swirl) * clamp01(controls.tilt) * (1 - block);
  }

  classify(wash: number): PanState {
    if (wash > this.safeLimit) return 'aggressive';
    if (wash < this.safeLimit * PAN_TUNING.timidFraction) return 'timid';
    return 'balanced';
  }

  step(dt: number, controls: PanControls): PanStepEvents {
    const T = PAN_TUNING;
    if (this.phase !== 'working') {
      return { state: 'timid', lightSpilled: 0, darkSpilled: 0, clayRolledOut: 0, glints: 0 };
    }
    this.elapsed += dt;
    const tilt = clamp01(controls.tilt);
    const swirl = clamp01(controls.swirl);
    const wash = this.effectiveWash(controls);
    const state = this.classify(wash);

    // Shaking works best with the pan held level.
    const shake = clamp01(controls.shake) * (1 - tilt);
    if (shake > 0) {
      this.stratification += shake * T.shakeStratRate * dt * (1 - this.stratification);
      const broken = Math.min(this.clay, this.clay * shake * T.shakeClayBreakRate * dt);
      this.clay -= broken;
      this.turbidity += broken * 4;
    }
    this.stratification -= swirl * T.swirlMixRate * dt * this.stratification;

    this.turbidity = Math.max(0, this.turbidity - this.turbidity * (T.turbidityDecay + wash) * dt);
    const murk = 1 - Math.min(0.5, this.turbidity * 0.5);

    const lightSpilled = Math.min(this.lightSand, wash * T.lightWashRate * murk * dt);
    this.lightSand -= lightSpilled;

    // Heavy loss: small baseline from an unsorted pan, large once over the safe limit,
    // and severe when there is no light sand left to protect the concentrate.
    const excess = Math.max(0, wash - this.safeLimit);
    const exposed = 1 + T.overworkLoss * (1 - Math.min(1, this.lightSand / T.overworkBelowLight));
    const nearLimit = Math.min(1, wash / this.safeLimit) ** 3;
    const heavyLossRate = (nearLimit * (1 - this.stratification) * T.baseHeavyLoss + excess * T.excessHeavyLoss) * exposed;

    const darkSpilled = this.blackSand * Math.min(1, heavyLossRate * dt);
    this.blackSand -= darkSpilled;
    this.lostBlackSand += darkSpilled;
    this.loseGold((size) => heavyLossRate * T.mobility[size] * dt);

    // Unbroken clay rolls out when swirled, carrying trapped gold with it.
    let clayRolledOut = 0;
    if (this.clay > 0 && wash > 0) {
      clayRolledOut = Math.min(this.clay, this.clay * wash * wash * T.clayRollRate * dt);
      const share = clayRolledOut / (this.clay + this.lightSand + this.blackSand);
      this.clay -= clayRolledOut;
      this.loseGold(() => share * T.clayGoldCarry);
    }

    // Glints hint at gold as the light layer thins; they never say how much.
    const visibility = 1 - Math.min(1, this.lightSand / 0.35);
    const goldPresence = this.gold.reduce((sum, p) => sum + (p.size === 'fine' ? 0.2 : p.size === 'flake' ? 1 : 3), 0);
    const glintChance = visibility * Math.min(3, goldPresence * 0.1) * swirl * T.glintRate * dt;
    const glints = this.rng.next() < glintChance ? 1 : 0;

    return { state, lightSpilled, darkSpilled, clayRolledOut, glints };
  }

  /** Rake out and inspect one oversize rock. Returns a picker if one was stuck to it. */
  rakeRock(rockId: number): GoldPiece | null {
    if (this.phase !== 'working') return null;
    const index = this.rocks.findIndex((r) => r.id === rockId);
    if (index < 0) return null;
    const [rock] = this.rocks.splice(index, 1);
    return rock?.stuckPicker ?? null;
  }

  /** Stop working and fan out the concentrate. Sand left in the pan hides some of the gold. */
  reveal(): GoldPiece[] {
    if (this.phase !== 'working') return this.visible;
    this.phase = 'revealed';
    const cover = this.lightSand * 6;
    for (const piece of this.gold) {
      if (this.rng.next() < cover * PAN_TUNING.hideFactor[piece.size]) this.hidden.push(piece);
      else this.visible.push(piece);
    }
    this.gold = [];
    return this.visible;
  }

  /**
   * Pick the visible gold out. If the black sand is saved, hidden gold goes with it to the
   * concentrate jar for re-panning later; if dumped, it is lost.
   */
  collect(saveBlackSand: boolean): { collected: GoldPiece[]; toJar: GoldPiece[]; blackSand: number } {
    if (this.phase !== 'revealed') return { collected: [], toJar: [], blackSand: 0 };
    this.phase = 'emptied';
    const collected = this.visible;
    if (saveBlackSand) return { collected, toJar: this.hidden, blackSand: this.blackSand };
    this.lost.push(...this.hidden);
    this.lostBlackSand += this.blackSand;
    return { collected, toJar: [], blackSand: 0 };
  }

  private loseGold(chance: (size: GoldSize) => number): void {
    this.gold = this.gold.filter((piece) => {
      if (this.rng.next() < chance(piece.size)) {
        this.lost.push(piece);
        return false;
      }
      return true;
    });
  }
}

function makePiece(rng: Rng, size: GoldSize): GoldPiece {
  const mg = size === 'fine' ? rng.range(0.02, 0.08) : size === 'flake' ? rng.range(0.1, 0.6) : rng.range(1, 5);
  return { id: newId(), size, mg };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function totalMg(pieces: readonly GoldPiece[]): number {
  return pieces.reduce((sum, p) => sum + p.mg, 0);
}
