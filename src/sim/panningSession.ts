import { Pan, totalMg, type GoldPiece, type PanLoad, type PanSnapshot } from './pan';
import { quoteSale, type SaleQuote } from './market';
import type { DigSpot } from './creek';
import type { GearId } from './outfitter';
import { Sluice, type Concentrate, type SluiceSnapshot } from './sluice';
import type { Rng } from './rng';

/**
 * Black sand (pan-volume units) the standard concentrate jar holds: about fifteen pans' worth,
 * or one sluice cleanout. It must always hold a full sluice mat, or a cleanout could never finish.
 */
export const JAR_CAPACITY = 0.8;
/** The big concentrate jar from the outfitter holds this many times as much. */
export const BIG_JAR_MULTIPLE = 3;
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
  /** Gear owned other than the sluice (which has its own state below). */
  readonly gear: readonly GearId[];
  /** Null until a sluice is bought. */
  readonly sluice: { readonly placedAt: SluicePlace | null; readonly state: SluiceSnapshot | null } | null;
}

/** Where a sluice is set up. */
export interface SluicePlace {
  readonly creekId: number;
  readonly spotId: number;
}

export type SetUpResult = 'set' | 'notOwned' | 'noSite' | 'jarFull';

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
  /** Simple owned gear, such as the big jar. */
  private readonly gear = new Set<GearId>();

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
    for (const id of saved.gear) this.gear.add(id);
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
      gear: [...this.gear],
      sluice: this.sluiceGear
        ? { placedAt: this.sluiceGear.placedAt, state: this.sluiceGear.sluice?.snapshot() ?? null }
        : null,
    });
  }

  owns(id: GearId): boolean {
    return id === 'sluice' ? this.sluiceGear !== null : this.gear.has(id);
  }

  /** Take possession of bought gear (the outfitter handles the money). */
  acquire(id: GearId): void {
    if (id === 'sluice') {
      if (!this.sluiceGear) this.sluiceGear = { placedAt: null, sluice: null };
    } else {
      this.gear.add(id);
    }
  }

  /** How much black sand the jar holds, full. */
  get jarCapacity(): number {
    return JAR_CAPACITY * (this.gear.has('bigJar') ? BIG_JAR_MULTIPLE : 1);
  }

  /** Room left in the jar. */
  get jarSpace(): number {
    return Math.max(0, this.jarCapacity - this.jar.blackSand);
  }

  /** Whether `volume` of black sand fits in the jar (with a hair of slack for rounding). */
  fitsInJar(volume: number): boolean {
    return volume <= this.jarSpace + 1e-9;
  }

  /** Whether the revealed pan's black sand can be saved: there is some, it isn't spent, and it fits. */
  get canSaveBlackSand(): boolean {
    const pan = this.pan;
    return pan !== null && pan.phase === 'revealed' && !pan.residueSpent && this.fitsInJar(pan.blackSand);
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
    if (this.takeDownSluice() === 'jarFull') return 'jarFull';
    gear.placedAt = { creekId, spotId: spot.id };
    gear.sluice = new Sluice(this.rng, spot.sluiceSite);
    return 'set';
  }

  /**
   * Take the sluice down and pack it. The moss is lifted and washed into the jar so nothing it
   * caught is lost; gravel still in the header is tipped out, gold and all. Waits (returns
   * 'jarFull') if the jar has no room for the mat.
   */
  takeDownSluice(): Concentrate | 'jarFull' | null {
    const gear = this.sluiceGear;
    if (!gear?.sluice) return null;
    if (!this.fitsInJar(gear.sluice.matVolume)) return 'jarFull';
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
   * Refused (returns false, nothing changes) if it doesn't fit: pan some of the jar down first.
   */
  addConcentrate(concentrate: Concentrate): boolean {
    if (!this.fitsInJar(concentrate.blackSand)) return false;
    this.jar.blackSand += concentrate.blackSand;
    this.jar.gold.push(...concentrate.gold);
    return true;
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

  /**
   * Pick the visible gold into the vial, saving or dumping the black sand. Saving into a jar
   * without room is refused (returns null, the pan stays revealed): nothing is ever lost to a full jar.
   */
  collect(saveBlackSand: boolean): GoldPiece[] | null {
    if (!this.pan) return [];
    if (saveBlackSand && !this.pan.residueSpent && !this.fitsInJar(this.pan.blackSand)) return null;
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
