import { Pan, totalMg, type GoldPiece, type PanLoad, type PanSnapshot } from './pan';
import { quoteSale, type SaleQuote } from './market';
import type { DigSpot } from './creek';
import type { GearId } from './outfitter';
import { Sluice, type Concentrate, type SluiceSnapshot } from './sluice';
import type { Rng } from './rng';

/** Black sand (pan-volume units) the concentrate jar holds. */
export const JAR_CAPACITY = 0.5;
/** Most black sand poured into the pan at once; the rest waits in the jar. */
export const CONCENTRATE_POUR = 0.25;
/** Less than this in the jar is not worth panning. */
export const MIN_CONCENTRATE = 0.005;

/** The player's panning state as plain data, for saving. */
export interface SessionSnapshot {
  readonly vial: readonly GoldPiece[];
  readonly jar: { readonly blackSand: number; readonly gold: readonly GoldPiece[] };
  readonly pansWorked: number;
  readonly pan: PanSnapshot | null;
  readonly cash: number;
  readonly earned: number;
  readonly soldMg: number;
  /** Null until a sluice is bought. */
  readonly sluice: { readonly placedAt: SluicePlace | null; readonly state: SluiceSnapshot | null } | null;
}

/** Where a sluice is set up. */
export interface SluicePlace {
  readonly creekId: number;
  readonly spotId: number;
}

export type SetUpResult = 'set' | 'notOwned' | 'noSite';

/**
 * The player's panning: the pan (empty until a shovelful goes in), the vial of recovered gold,
 * and the concentrate jar of saved black sand.
 */
export class PanningSession {
  pan: Pan | null = null;
  readonly vial: GoldPiece[] = [];
  readonly jar: { blackSand: number; gold: GoldPiece[] } = { blackSand: 0, gold: [] };
  /** Pans of creek gravel worked; re-panned concentrate is not counted. */
  pansWorked = 0;
  /** Dollars on hand. */
  cash = 0;
  /** Lifetime dollars from gold sales, and milligrams sold. */
  earned = 0;
  soldMg = 0;
  /** The sluice, once owned: packed (placedAt null) or set up and running at a sluice site. */
  private sluiceGear: { placedAt: SluicePlace | null; sluice: Sluice | null } | null = null;

  /** A fresh start, or with `saved`, the vial, jar, and any pan in progress as they were left. */
  constructor(
    private readonly rng: Rng,
    saved?: SessionSnapshot,
  ) {
    if (!saved) return;
    this.vial.push(...saved.vial);
    this.jar.blackSand = saved.jar.blackSand;
    this.jar.gold.push(...saved.jar.gold);
    this.pansWorked = saved.pansWorked;
    this.cash = saved.cash;
    this.earned = saved.earned;
    this.soldMg = saved.soldMg;
    this.pan = saved.pan ? Pan.restore(rng, saved.pan) : null;
    if (saved.sluice) {
      const state = saved.sluice.state;
      this.sluiceGear = { placedAt: saved.sluice.placedAt, sluice: state ? new Sluice(rng, state.site, state) : null };
    }
  }

  snapshot(): SessionSnapshot {
    return structuredClone({
      vial: this.vial,
      jar: this.jar,
      pansWorked: this.pansWorked,
      pan: this.pan?.snapshot() ?? null,
      cash: this.cash,
      earned: this.earned,
      soldMg: this.soldMg,
      sluice: this.sluiceGear
        ? { placedAt: this.sluiceGear.placedAt, state: this.sluiceGear.sluice?.snapshot() ?? null }
        : null,
    });
  }

  owns(id: GearId): boolean {
    return id === 'sluice' && this.sluiceGear !== null;
  }

  /** Take possession of bought gear (the outfitter handles the money). */
  acquire(id: GearId): void {
    if (id === 'sluice' && !this.sluiceGear) this.sluiceGear = { placedAt: null, sluice: null };
  }

  /** Where the sluice is set up, if it is. */
  get sluicePlace(): SluicePlace | null {
    return this.sluiceGear?.placedAt ?? null;
  }

  /** The running sluice at a spot, if that's where it is set up. */
  sluiceAt(creekId: number, spotId: number): Sluice | null {
    const gear = this.sluiceGear;
    return gear?.placedAt?.creekId === creekId && gear.placedAt.spotId === spotId ? gear.sluice : null;
  }

  /**
   * Set the sluice up in the creek beside a spot. Only works at a sluice site. If it is set up
   * somewhere else it is taken down first, which washes its moss into the jar.
   */
  setUpSluice(creekId: number, spot: DigSpot): SetUpResult {
    const gear = this.sluiceGear;
    if (!gear) return 'notOwned';
    if (!spot.sluiceSite) return 'noSite';
    if (gear.placedAt?.creekId === creekId && gear.placedAt.spotId === spot.id) return 'set';
    this.takeDownSluice();
    gear.placedAt = { creekId, spotId: spot.id };
    gear.sluice = new Sluice(this.rng, spot.sluiceSite);
    return 'set';
  }

  /**
   * Take the sluice down and pack it. The moss is lifted and washed into the jar so nothing it
   * caught is lost; gravel still in the header is tipped out, gold and all.
   */
  takeDownSluice(): Concentrate | null {
    const gear = this.sluiceGear;
    if (!gear?.sluice) return null;
    gear.sluice.emptyHeader();
    const concentrate = gear.sluice.liftMat();
    this.addConcentrate(concentrate);
    gear.placedAt = null;
    gear.sluice = null;
    return concentrate;
  }

  /** True when the pan can take a new shovelful: none yet, or the last one is finished. */
  get panIsFree(): boolean {
    return this.pan === null || this.pan.phase === 'emptied';
  }

  /** Fill the pan with a shovelful. */
  startPan(load: PanLoad): Pan {
    if (!this.panIsFree) throw new Error('The pan is still in use');
    this.pan = new Pan(this.rng, load);
    return this.pan;
  }

  get canPanConcentrate(): boolean {
    return this.panIsFree && this.jar.blackSand >= MIN_CONCENTRATE;
  }

  /**
   * Wash a sluice's cleanout (the moss and what it held) into the concentrate jar, ready to pan.
   * The jar holds it however full it gets; the capacity only sets how full it looks.
   */
  addConcentrate(concentrate: Concentrate): void {
    this.jar.blackSand += concentrate.blackSand;
    this.jar.gold.push(...concentrate.gold);
  }

  /**
   * Pour black sand from the jar into the pan to re-pan it. The gold saved in the jar comes with
   * it in proportion to how much of the jar is poured.
   */
  startConcentratePan(): Pan {
    if (!this.canPanConcentrate) throw new Error('Nothing to pour, or the pan is in use');
    const amount = Math.min(this.jar.blackSand, CONCENTRATE_POUR);
    const share = amount / this.jar.blackSand;
    const poured: GoldPiece[] = [];
    const kept: GoldPiece[] = [];
    for (const piece of this.jar.gold) (share >= 1 || this.rng.next() < share ? poured : kept).push(piece);
    this.jar.gold = kept;
    this.jar.blackSand -= amount;
    this.pan = new Pan(this.rng, { richness: 0, clayiness: 0, rockiness: 0 }, { blackSand: amount, gold: poured });
    return this.pan;
  }

  rakeRock(rockId: number): GoldPiece | null {
    const picker = this.pan?.rakeRock(rockId) ?? null;
    if (picker) this.vial.push(picker);
    return picker;
  }

  collect(saveBlackSand: boolean): GoldPiece[] {
    if (!this.pan) return [];
    const { collected, toJar, blackSand } = this.pan.collect(saveBlackSand);
    this.vial.push(...collected);
    this.jar.gold.push(...toJar);
    this.jar.blackSand += blackSand;
    if (this.pan.kind === 'gravel') this.pansWorked += 1;
    return collected;
  }

  /** Sell everything in the vial to the gold buyer. */
  sellVial(): SaleQuote {
    const quote = quoteSale(this.vial);
    this.cash += quote.total;
    this.earned += quote.total;
    this.soldMg += quote.weighedMg + quote.specimenMg;
    this.vial.length = 0;
    return quote;
  }

  get vialMg(): number {
    return totalMg(this.vial);
  }
}
