import type { Rng } from './rng';

/**
 * Gold pan simulation (see "Pan UX Specification" in the design doc).
 *
 * The pan holds a load of creek gravel: light sand, black sand, unbroken clay, oversize rocks,
 * and discrete gold pieces. The player shakes the pan and chooses how far to tip it. Held level,
 * shaking breaks up clay and settles the heavies to the bottom (stratifies). Once the clay is gone,
 * shaking with the pan tipped washes light material over the lip. Washing removes light
 * sand over the lip; washing harder than the current stratification can hold also loses black
 * sand and gold. Washing slowly churns the
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
  /** 0 = none, 1 = full shake. Level, it settles the pan; tipped (and with the clay gone), it washes. */
  readonly shake: number;
}

export type PanState = 'timid' | 'balanced' | 'aggressive';
/** Which side of a riffled pan faces the lip. The steel pan is smooth all round. */
export type PanSide = 'riffles' | 'smooth';
/** A shovelful of creek gravel, or black sand poured back from the concentrate jar. */
export type PanKind = 'gravel' | 'concentrate';
export type PanPhase = 'working' | 'revealed' | 'emptied';

/** One shovelful of material in the pan, with the character of the layer it was dug from. */
export interface PanLoad {
  /** Expected milligrams of gold in this load. */
  readonly richness: number;
  /** 0..1 */
  readonly clayiness: number;
  /** 0..1 */
  readonly rockiness: number;
  /**
   * Share of the coarse gold (flakes and pickers) someone already took out: old workings kept what
   * they could see and lost the fines, so what's left of their gold runs fine. Absent means none.
   */
  readonly coarseTaken?: number;
  /**
   * The sand's grain, 0 fine silt to 1 coarse grit. Fine sand washes fast but lets the heavies go
   * at a shallower tip; coarse sand holds at a steeper tip but washes slowly. Absent means medium.
   */
  readonly grain?: number;
}

/** What visibly happened during one step, for the renderer to draw. */
export interface PanStepEvents {
  readonly state: PanState;
  /** Light sand washed over the lip this step (pan-volume fraction). */
  readonly lightSpilled: number;
  /** Black sand washed over the lip this step. The dark streak that signals loss. */
  readonly darkSpilled: number;
  readonly glints: number;
  /** Gold pieces washed out this step. */
  readonly goldLost: number;
}

/** Black sand and the gold hidden in it, poured from the concentrate jar. */
export interface ConcentratePour {
  readonly blackSand: number;
  readonly gold: readonly GoldPiece[];
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
  /**
   * Washing once there is almost no light sand left strips the concentrate itself. Measured
   * relative to what the pan started with, so a small pour from the jar is not "stripped" from the start.
   */
  overworkLoss: 2,
  overworkBelowFraction: 0.15,
  shakeStratRate: 0.6,
  shakeClayBreakRate: 0.8,
  /** Below this, the last of the clay counts as broken up: otherwise it would only ever halve. */
  clayGone: 0.004,
  /** How fast washing churns the settled layers back together. */
  washMixRate: 0.08,
  /** Fraction of blocked wash per rock left in the pan. */
  rockBlock: 0.08,
  maxRockBlock: 0.6,
  turbidityDecay: 0.5,
  glintRate: 0.8,
  /** Worked down once this fraction of the starting light material is left. */
  workedDownFraction: 0.04,
  /** Sifted out: the sand left rounds to 0%. Nothing more can wash out, so sifting stops. */
  siftedOutFraction: 0.005,
  mobility: { fine: 1.6, flake: 0.8, picker: 0.15 } as Record<GoldSize, number>,
  /** How easily remaining light sand hides a piece at reveal. */
  hideFactor: { fine: 1, flake: 0.5, picker: 0.1 } as Record<GoldSize, number>,
  rockPickerChance: 0.03,
  /** Concentrate is heavy: it washes off slowly... */
  concentrateWashScale: 0.45,
  /** ...and tolerates much less wash before gold goes with it. */
  concentrateSafeScale: 0.7,
  /** Share of poured concentrate that is the finest, heaviest sand, left when worked down. */
  concentrateResidue: 0.15,
  /**
   * How a gravel pan's grain moves it: the safe tip scales from fineSafe (silt) to fineSafe +
   * grainSafe (grit), and the wash rate from fineWash down by grainWash.
   */
  fineSafe: 0.7,
  grainSafe: 0.6,
  fineWash: 1.3,
  grainWash: 0.6,
  /**
   * The finishing pan, for concentrate: small and deep-riffled. Its safe tip is a little shallower
   * than the steel pan's, but its riffles hold the fines even when it's tipped too far, and it
   * works the black sand down to a thinner tail that hides less at the reveal. Being small, it
   * washes slower: it costs time, not gold.
   */
  finishingSafeScale: 0.9,
  finishingMobility: { fine: 0.3, flake: 0.45, picker: 1 } as Record<GoldSize, number>,
  finishingBaseLoss: 0.5,
  finishingHide: 0.55,
  finishingWashScale: 0.75,
  /**
   * The snuffer bottle, at the reveal: squeeze, touch the nozzle to the black-sand tail, and it
   * draws up specks, and sand with them. Where along the tail (0 head .. 1 tip) and how thin the
   * tail was worked decide what comes up.
   */
  snuffReach: 0.14,
  snuffBase: 0.3,
  snuffThin: 0.6,
  /** Sand drawn per squeeze: a little from a thin tail, more from a thick one. */
  snuffSand: 0.012,
  snuffThickSand: 0.035,
  /** Past this much sand the bottle is cloudy: its specks can't be picked clean and go back to the jar. */
  bottleClear: 0.05,
  /**
   * The riffled pan, riffles toward the lip: the grooves catch heavies as they head for the lip,
   * so it takes a steeper tip before gold goes. But they also hold sand back: riffles-first it
   * can't be worked below this share of its sand, and revealed that way, the black sand packed
   * in the grooves hides more of the fines. Flip to the smooth side to finish.
   */
  riffleSafeScale: 1.4,
  riffleHold: 0.1,
  riffleCover: 1.8,
  /** Turning the pan round in the hands stirs the settled layers a little. */
  flipMix: 0.85,
} as const;

let nextId = 1;
const newId = (): number => nextId++;

/** After restoring saved pieces and rocks, keep new ids clear of the restored ones. */
export function reservePanIds(maxUsed: number): void {
  nextId = Math.max(nextId, maxUsed + 1);
}

/** Everything needed to put a pan back exactly as it was, as plain data. */
export interface PanSnapshot {
  readonly kind: PanKind;
  readonly initialLightSand: number;
  readonly lightSand: number;
  readonly blackSand: number;
  readonly clay: number;
  readonly stratification: number;
  readonly turbidity: number;
  readonly rocks: readonly Rock[];
  readonly gold: readonly GoldPiece[];
  readonly phase: PanPhase;
  readonly elapsed: number;
  readonly visible: readonly GoldPiece[];
  readonly hidden: readonly GoldPiece[];
  /** How muddy the water it's panned in is (a wash tub), 0 clear. Absent means clear creek water. */
  readonly waterMurk?: number;
  /** The sand's grain; absent means medium. */
  readonly grain?: number;
  /** Worked in the finishing pan. Absent means the steel pan. */
  readonly finishing?: boolean;
  /** Worked in the riffled pan, and which side faces the lip. Absent means the steel pan. */
  readonly riffled?: PanSide;
  /** Where each hidden piece lies along the revealed tail (0 head .. 1 tip), in `hidden`'s order. */
  readonly tailPos?: readonly number[];
  /** What the snuffer bottle has drawn up from this pan. */
  readonly bottle?: { readonly sand: number; readonly gold: readonly GoldPiece[] };
  /** How thin the tail was worked when it was revealed. */
  readonly tailThin?: number;
}

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
  /**
   * How muddy the water is that this pan is worked in: 0 for a creek, rising in a wash tub with
   * every pan. Muddy water settles the pan slower, shows fewer glints, and hides colour at the reveal.
   */
  waterMurk = 0;
  /** Worked in the finishing pan (concentrate only). */
  finishing = false;
  /** Worked in the riffled pan (creek gravel only). */
  riffled = false;
  /** Which side of the riffled pan faces the lip. */
  side: PanSide = 'riffles';
  /** Where each hidden piece lies along the revealed tail, 0 head .. 1 tip, in `hidden`'s order. */
  tailPos: number[] = [];
  /** The snuffer bottle's draw from this pan: sand, and the specks in it. */
  bottle: { sand: number; gold: GoldPiece[] } = { sand: 0, gold: [] };
  /** How thin the tail was worked at the reveal, 0 thick .. 1 a thin line. Fixed from then on. */
  tailThinness = 0;

  readonly initialLightSand: number;
  readonly kind: PanKind;
  /** The sand's grain, 0 fine silt to 1 coarse grit (0.5 for concentrate and screened material). */
  readonly grain: number;

  /**
   * A pan of creek gravel from `load`, or, with `pour`, black sand from the concentrate jar.
   * In a concentrate pan the black sand itself is the material to wash away: relative to gold
   * it is the light fraction, so it fills the role light sand plays in a gravel pan.
   */
  constructor(
    private readonly rng: Rng,
    load: PanLoad,
    pour?: ConcentratePour,
  ) {
    this.grain = pour ? 0.5 : Math.min(1, Math.max(0, load.grain ?? 0.5));
    if (pour) {
      this.kind = 'concentrate';
      this.clay = 0;
      this.turbidity = 0;
      this.stratification = 0.5;
      this.lightSand = pour.blackSand * (1 - PAN_TUNING.concentrateResidue);
      this.blackSand = pour.blackSand * PAN_TUNING.concentrateResidue;
      this.initialLightSand = Math.max(this.lightSand, 1e-6);
      this.rocks = [];
      this.gold = [...pour.gold];
      return;
    }
    this.kind = 'gravel';
    const shovelful = rollShovelful(rng, load);
    this.clay = shovelful.clay;
    this.blackSand = shovelful.blackSand;
    this.lightSand = shovelful.lightSand;
    this.initialLightSand = this.lightSand;
    this.turbidity = this.clay * 2;
    this.rocks = shovelful.rocks;
    this.gold = shovelful.gold;
  }

  snapshot(): PanSnapshot {
    return {
      kind: this.kind,
      initialLightSand: this.initialLightSand,
      lightSand: this.lightSand,
      blackSand: this.blackSand,
      clay: this.clay,
      stratification: this.stratification,
      turbidity: this.turbidity,
      rocks: this.rocks,
      gold: this.gold,
      phase: this.phase,
      elapsed: this.elapsed,
      visible: this.visible,
      hidden: this.hidden,
      ...(this.waterMurk > 0 ? { waterMurk: this.waterMurk } : {}),
      ...(this.grain !== 0.5 ? { grain: this.grain } : {}),
      ...(this.finishing ? { finishing: true } : {}),
      ...(this.riffled ? { riffled: this.side } : {}),
      ...(this.tailPos.length ? { tailPos: [...this.tailPos] } : {}),
      ...(this.bottle.sand > 0 || this.bottle.gold.length ? { bottle: { sand: this.bottle.sand, gold: [...this.bottle.gold] } } : {}),
      ...(this.tailThinness > 0 ? { tailThin: this.tailThinness } : {}),
    };
  }

  /**
   * A pan of screened material from the classifier's bucket: no rocks to rake, and with a fine
   * screen, less light material for the same gold.
   */
  static fromScreened(rng: Rng, material: { light: number; black: number; clay: number; gold: readonly GoldPiece[] }): Pan {
    return Pan.restore(rng, {
      kind: 'gravel',
      initialLightSand: Math.max(material.light, 1e-6),
      lightSand: material.light,
      blackSand: material.black,
      clay: material.clay,
      stratification: 0.1,
      turbidity: material.clay * 2,
      rocks: [],
      gold: material.gold,
      phase: 'working',
      elapsed: 0,
      visible: [],
      hidden: [],
    });
  }

  static restore(rng: Rng, snap: PanSnapshot): Pan {
    const pan = new Pan(rng, { richness: 0, clayiness: 0, rockiness: 0 }, { blackSand: 0, gold: [] });
    // kind and initialLightSand are fixed for a pan's life; restoring is the one place they are set after construction.
    const fixed = pan as { kind: PanKind; initialLightSand: number; grain: number };
    fixed.kind = snap.kind;
    fixed.initialLightSand = snap.initialLightSand;
    fixed.grain = snap.grain ?? 0.5;
    pan.lightSand = snap.lightSand;
    pan.blackSand = snap.blackSand;
    pan.clay = snap.clay;
    pan.stratification = snap.stratification;
    pan.turbidity = snap.turbidity;
    pan.rocks = [...snap.rocks];
    pan.gold = [...snap.gold];
    pan.phase = snap.phase;
    pan.elapsed = snap.elapsed;
    pan.visible = [...snap.visible];
    pan.hidden = [...snap.hidden];
    pan.waterMurk = snap.waterMurk ?? 0;
    pan.finishing = snap.finishing ?? false;
    pan.riffled = snap.riffled !== undefined;
    pan.side = snap.riffled ?? 'riffles';
    pan.tailPos = [...(snap.tailPos ?? [])];
    while (pan.tailPos.length < pan.hidden.length) pan.tailPos.push(rng.next());
    pan.bottle = { sand: snap.bottle?.sand ?? 0, gold: [...(snap.bottle?.gold ?? [])] };
    pan.tailThinness = snap.tailThin ?? 0;
    return pan;
  }

  /**
   * A concentrate pan worked all the way down leaves only the finest residue, visibly spent:
   * it is tipped out rather than saved, so the jar doesn't fill with sand that holds nothing.
   */
  /** All the sand is gone (it reads 0%): sifting does nothing more, so the pan can't be overworked past here. */
  get siftedOut(): boolean {
    return this.lightSand <= this.initialLightSand * PAN_TUNING.siftedOutFraction;
  }

  get residueSpent(): boolean {
    return this.kind === 'concentrate' && this.workedDown;
  }

  get workedDown(): boolean {
    return this.lightSand <= this.initialLightSand * PAN_TUNING.workedDownFraction;
  }

  /** Riffles toward the lip: catching heavies, and holding sand back. */
  get rifflesToLip(): boolean {
    return this.riffled && this.side === 'riffles';
  }

  /** Turn a riffled pan round, riffles to the lip or the smooth side. Returns false if there's nothing to flip. */
  flip(): boolean {
    if (!this.riffled || this.phase !== 'working') return false;
    this.side = this.side === 'riffles' ? 'smooth' : 'riffles';
    this.stratification *= PAN_TUNING.flipMix;
    return true;
  }

  /** Riffles-first, the pan holds this much sand back however long it's washed. */
  get riffleFloor(): number {
    return this.rifflesToLip ? this.initialLightSand * PAN_TUNING.riffleHold : 0;
  }

  /** Wash beyond which black sand and gold start going over the lip. */
  get safeLimit(): number {
    const T = PAN_TUNING;
    const limit = T.safeLimitBase + T.safeLimitPerStrat * this.stratification;
    if (this.kind === 'concentrate') return limit * T.concentrateSafeScale * (this.finishing ? T.finishingSafeScale : 1);
    return limit * (T.fineSafe + T.grainSafe * this.grain) * (this.rifflesToLip ? T.riffleSafeScale : 1);
  }

  effectiveWash(controls: PanControls): number {
    const block = Math.min(PAN_TUNING.maxRockBlock, this.rocks.length * PAN_TUNING.rockBlock);
    // Clay holds everything together: nothing washes out until the shaking has broken it all up.
    if (this.clay > 0 || this.siftedOut) return 0;
    return clamp01(controls.shake) * clamp01(controls.tilt) * (1 - block);
  }

  classify(wash: number): PanState {
    if (wash > this.safeLimit) return 'aggressive';
    if (wash < this.safeLimit * PAN_TUNING.timidFraction) return 'timid';
    return 'balanced';
  }

  step(dt: number, controls: PanControls): PanStepEvents {
    const T = PAN_TUNING;
    if (this.phase !== 'working') {
      return { state: 'timid', lightSpilled: 0, darkSpilled: 0, glints: 0, goldLost: 0 };
    }
    this.elapsed += dt;
    const tilt = clamp01(controls.tilt);
    // Once sifted out there is nothing left to sift: the control has no effect.
    const shake = this.siftedOut ? 0 : clamp01(controls.shake);
    const wash = this.effectiveWash(controls);
    const state = this.classify(wash);

    if (shake > 0) {
      // Any shaking breaks up clay. Settling works best with the pan held level.
      let broken = Math.min(this.clay, this.clay * shake * T.shakeClayBreakRate * dt);
      if (this.clay - broken < T.clayGone) broken = this.clay;
      this.clay -= broken;
      this.turbidity += broken * 4;
      this.stratification += shake * (1 - tilt) * T.shakeStratRate * (1 - 0.6 * this.waterMurk) * dt * (1 - this.stratification);
    }
    // Water rushing over the lip churns the layers back together.
    this.stratification -= wash * T.washMixRate * dt * this.stratification;

    this.turbidity = Math.max(0, this.turbidity - this.turbidity * (T.turbidityDecay + wash) * dt);
    const murk = 1 - Math.min(0.5, this.turbidity * 0.5);

    const washRate =
      T.lightWashRate * (this.kind === 'concentrate' ? T.concentrateWashScale * (this.finishing ? T.finishingWashScale : 1) : T.fineWash - T.grainWash * this.grain);
    const lightSpilled = Math.min(Math.max(0, this.lightSand - this.riffleFloor), wash * washRate * murk * dt);
    this.lightSand -= lightSpilled;

    // Heavy loss: small baseline from an unsorted pan, large once over the safe limit,
    // and severe when there is no light sand left to protect the concentrate.
    const excess = Math.max(0, wash - this.safeLimit);
    const protection = this.lightSand / (this.initialLightSand * T.overworkBelowFraction);
    const exposed = 1 + T.overworkLoss * (1 - Math.min(1, protection));
    const nearLimit = Math.min(1, wash / this.safeLimit) ** 3;
    const baseLoss = T.baseHeavyLoss * (this.finishing ? T.finishingBaseLoss : 1);
    const heavyLossRate = (nearLimit * (1 - this.stratification) * baseLoss + excess * T.excessHeavyLoss) * exposed;

    const darkSpilled = this.blackSand * Math.min(1, heavyLossRate * dt);
    this.blackSand -= darkSpilled;
    this.lostBlackSand += darkSpilled;
    const goldLost = this.loseGold((size) => heavyLossRate * T.mobility[size] * (this.finishing ? T.finishingMobility[size] : 1) * dt);

    // Glints hint at gold as the light layer thins; they never say how much.
    const visibility = 1 - Math.min(1, this.lightSand / 0.35);
    const goldPresence = this.gold.reduce((sum, p) => sum + (p.size === 'fine' ? 0.2 : p.size === 'flake' ? 1 : 3), 0);
    const glintChance = visibility * Math.min(3, goldPresence * 0.1) * shake * T.glintRate * (1 - 0.7 * this.waterMurk) * dt;
    const glints = this.rng.next() < glintChance ? 1 : 0;

    return { state, lightSpilled, darkSpilled, glints, goldLost };
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
    this.tailThinness = 1 - Math.min(1, this.lightSand / (this.initialLightSand * 0.3));
    const cover =
      (this.lightSand * 6 + this.waterMurk * 0.3) * (this.finishing ? PAN_TUNING.finishingHide : 1) * (this.rifflesToLip ? PAN_TUNING.riffleCover : 1);
    for (const piece of this.gold) {
      if (this.rng.next() < cover * PAN_TUNING.hideFactor[piece.size]) this.hidden.push(piece);
      else this.visible.push(piece);
    }
    // Heavy pieces lie at the head of the tail; fines are strung out along it.
    for (const piece of this.hidden) this.tailPos.push(this.rng.next() ** (piece.size === 'fine' ? 0.9 : piece.size === 'flake' ? 2 : 3));
    this.gold = [];
    return this.visible;
  }

  get bottleCloudy(): boolean {
    return this.bottle.sand > PAN_TUNING.bottleClear;
  }

  /**
   * Squeeze the snuffer bottle and draw at `at` along the revealed tail (0 head .. 1 tip). Hidden
   * specks near the nozzle come up with a chance that rises the thinner the tail was worked, and
   * sand always comes with them. Returns how many specks came up.
   */
  snuff(at: number): number {
    if (this.phase !== 'revealed') return 0;
    const T = PAN_TUNING;
    const chance = T.snuffBase + T.snuffThin * this.tailThinness;
    let drawn = 0;
    const keepHidden: GoldPiece[] = [];
    const keepPos: number[] = [];
    this.hidden.forEach((piece, i) => {
      const pos = this.tailPos[i] ?? 0.5;
      if (Math.abs(pos - at) <= T.snuffReach && this.rng.next() < chance) {
        this.bottle.gold.push(piece);
        drawn += 1;
      } else {
        keepHidden.push(piece);
        keepPos.push(pos);
      }
    });
    this.hidden = keepHidden;
    this.tailPos = keepPos;
    // Sand comes up too, the heaviest first: the thicker the tail, the more. It never draws the
    // pan down past worked down, which would make its black sand spent residue.
    const want = T.snuffSand + T.snuffThickSand * (1 - this.tailThinness);
    const fromBlack = Math.min(this.blackSand, want);
    this.blackSand -= fromBlack;
    const floor = this.initialLightSand * T.workedDownFraction * 1.01;
    const fromLight = Math.min(Math.max(0, this.lightSand - floor), want - fromBlack);
    this.lightSand -= fromLight;
    this.bottle.sand += fromBlack + fromLight;
    return drawn;
  }

  /**
   * Pick the visible gold out. If the black sand is saved, hidden gold goes with it to the
   * concentrate jar for re-panning later; if dumped, it is lost.
   */
  collect(saveBlackSand: boolean): { collected: GoldPiece[]; toJar: GoldPiece[]; blackSand: number } {
    if (this.phase !== 'revealed') return { collected: [], toJar: [], blackSand: 0 };
    this.phase = 'emptied';
    const collected = [...this.visible];
    const toJar: GoldPiece[] = [];
    let blackSand = 0;
    if (saveBlackSand && !this.residueSpent) {
      toJar.push(...this.hidden);
      blackSand += this.blackSand;
    } else {
      this.lost.push(...this.hidden);
      this.lostBlackSand += this.blackSand;
    }
    // The snuffer bottle: clear, its specks tip into the vial and its sand goes with the pan's.
    // Cloudy, it's concentrate again and goes back to the jar (unless the player dumps it all).
    const bottle = this.bottle;
    this.bottle = { sand: 0, gold: [] };
    if (bottle.sand > PAN_TUNING.bottleClear) {
      if (saveBlackSand || this.residueSpent) {
        toJar.push(...bottle.gold);
        blackSand += bottle.sand;
      } else {
        this.lost.push(...bottle.gold);
        this.lostBlackSand += bottle.sand;
      }
    } else {
      collected.push(...bottle.gold);
      if (saveBlackSand && !this.residueSpent) blackSand += bottle.sand;
      else this.lostBlackSand += bottle.sand;
    }
    return { collected, toJar, blackSand };
  }

  /** Black sand that collecting would put in the jar. */
  sandToSave(saveBlackSand: boolean): number {
    const cloudy = this.bottleCloudy;
    const pan = saveBlackSand && !this.residueSpent ? this.blackSand : 0;
    const bottle = cloudy ? (saveBlackSand || this.residueSpent ? this.bottle.sand : 0) : saveBlackSand && !this.residueSpent ? this.bottle.sand : 0;
    return pan + bottle;
  }

  /** Wash pieces out of the pan at random; returns how many went. */
  private loseGold(chance: (size: GoldSize) => number): number {
    const before = this.gold.length;
    this.gold = this.gold.filter((piece) => {
      if (this.rng.next() < chance(piece.size)) {
        this.lost.push(piece);
        return false;
      }
      return true;
    });
    return before - this.gold.length;
  }
}

/** A shovelful, and a full pan: the unit everything else is measured in. */
export const PAN_VOLUME = 0.85;

/** What one shovelful actually holds, in pan-volume units. Pans and sluices both start from this. */
export interface Shovelful {
  readonly lightSand: number;
  readonly blackSand: number;
  readonly clay: number;
  readonly rocks: Rock[];
  readonly gold: GoldPiece[];
}

/** Roll the hidden contents of a shovelful dug from ground with the given character. */
export function rollShovelful(rng: Rng, load: PanLoad): Shovelful {
  const clay = load.clayiness * rng.range(0.05, 0.18);
  const blackSand = rng.range(0.03, 0.07);
  const lightSand = PAN_VOLUME - clay - blackSand;

  const rockCount = Math.round(load.rockiness * rng.range(2, 7));
  const rocks = Array.from({ length: rockCount }, () => ({
    id: newId(),
    stuckPicker: rng.next() < PAN_TUNING.rockPickerChance ? makePiece(rng, 'picker') : null,
  }));

  const gold: GoldPiece[] = [];
  let budget = load.richness * rng.range(0.3, 1.8);
  // Worked-over ground holds its gold as many fines, so it gets room for more specks.
  const maxPieces = load.coarseTaken ? 130 : 80;
  while (budget > 0 && gold.length < maxPieces) {
    const roll = rng.next();
    let size: GoldSize = roll < 0.7 ? 'fine' : roll < 0.97 ? 'flake' : 'picker';
    // Worked-over ground: the coarse gold went to whoever was here before; the fines stayed.
    if (size !== 'fine' && load.coarseTaken && rng.next() < load.coarseTaken) size = 'fine';
    const piece = makePiece(rng, size);
    gold.push(piece);
    budget -= piece.mg;
  }
  return { lightSand, blackSand, clay, rocks, gold };
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
