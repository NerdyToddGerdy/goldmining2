import { Classifier, type ClassifierSnapshot } from './classifier';
import { Rocker, type RockerSnapshot } from './rocker';
import { HIGHBANKER_TUNING, Highbanker, type HighbankerSnapshot } from './highbanker';
import type { Milestone } from './milestones';
import { TROMMEL_TUNING, Trommel, type TrommelSnapshot } from './trommel';
import { siteAllows } from './sites';
import { Drywasher, type DrywasherSnapshot } from './drywasher';
import { freshTub, type WashTub } from './washTub';
import type { Creek } from './creek';
import { PAN_VOLUME, Pan, totalMg, type GoldPiece, type PanLoad, type PanSnapshot } from './pan';
import { quoteSale, type SaleQuote } from './market';
import type { DigSpot } from './creek';
import type { GearId } from './outfitter';
import { MAGNET_TUNING, magnetStep, shakeBack, stripOff, type Clump, type MagnetStepEvents } from './magnet';
import { SLUICE_TUNING, Sluice, bareKit, needsPump, type Concentrate, type SluiceKit, type SluiceSnapshot } from './sluice';
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
  /** `magnetite` is how much of the jar's black sand the magnet could still lift. */
  readonly jar: { readonly blackSand: number; readonly magnetite: number; readonly gold: readonly GoldPiece[] };
  /** Sand and gold hanging on the magnet's sleeve, not yet shaken back or stripped off. */
  readonly clump: Clump;
  readonly pansWorked: number;
  readonly pan: PanSnapshot | null;
  readonly cash: number;
  readonly earned: number;
  readonly soldMg: number;
  /** Gear owned other than the sluice and classifier (which have their own state). */
  readonly gear: readonly GearId[];
  /** Null until a classifier is bought. */
  readonly classifier: ClassifierSnapshot | null;
  /** Null until a rocker box is bought. */
  readonly rocker: RockerSnapshot | null;
  /** Null until bought. */
  readonly drywasher: DrywasherSnapshot | null;
  readonly tub: WashTub | null;
  /** Null until a highbanker is bought. */
  readonly highbanker: { readonly placedAt: SluicePlace | null; readonly state: HighbankerSnapshot | null; readonly packedFuel: number } | null;
  /** Null until a sluice is bought. */
  readonly sluice: { readonly placedAt: SluicePlace | null; readonly state: SluiceSnapshot | null } | null;
  /** Seconds of running left in the pump's tank (0 without a pump). */
  readonly pumpFuel: number;
  /** Spare cans of fuel carried. */
  readonly fuelCans: number;
  /** Repair kits carried. Absent means none. */
  readonly repairKits?: number;
  /** First steps of the early game already taken (see milestones.ts). Absent means none. */
  readonly milestones?: readonly string[];
  /** The most gold from one pan of gravel, in mg. Absent means none yet. */
  readonly bestPanMg?: number;
  /** Null (or absent) until a trommel is bought. */
  readonly trommel?: { readonly placedAt: SluicePlace | null; readonly state: TrommelSnapshot | null; readonly packedFuel: number } | null;
}

/** Where a sluice is set up. */
export interface SluicePlace {
  readonly creekId: number;
  readonly spotId: number;
}

export type SetUpResult = 'set' | 'notOwned' | 'noSite' | 'needsPump' | 'jarFull' | 'occupied';
export type HighbankerSetUpResult = 'set' | 'notOwned' | 'noRoom' | 'gully' | 'occupied' | 'jarFull';

/**
 * The player's panning: the pan (empty until a shovelful goes in), the vial of recovered gold,
 * and the concentrate jar of saved black sand.
 */
export class PanningSession {
  pan: Pan | null = null;
  readonly vial: GoldPiece[] = [];
  readonly jar: { blackSand: number; magnetite: number; gold: GoldPiece[] } = { blackSand: 0, magnetite: 0, gold: [] };
  /** What the magnet is holding up over the tray. */
  readonly clump: Clump = { sand: 0, gold: [] };
  /** Pans of creek gravel worked; re-panned concentrate is not counted. */
  pansWorked = 0;
  /** Dollars on hand. */
  cash = 0;
  /** Lifetime dollars from gold sales, and milligrams sold. */
  earned = 0;
  soldMg = 0;
  /** The most gold picked from one pan of gravel, in mg: for the record on the tablet. */
  bestPanMg = 0;
  /** The sluice, once owned: packed (placedAt null) or set up and running at a sluice site. */
  private sluiceGear: { placedAt: SluicePlace | null; sluice: Sluice | null } | null = null;
  /** The drywasher and wash tub travel with the player, like the rocker. */
  drywasher: Drywasher | null = null;
  tub: WashTub | null = null;
  /** The highbanker, once owned: packed, or set up on the bank at a spot. */
  private highbankerGear: { placedAt: SluicePlace | null; machine: Highbanker | null } | null = null;
  /** The trommel, once owned: packed, or set up on a gravel bar beside a spot. */
  private trommelGear: { placedAt: SluicePlace | null; machine: Trommel | null } | null = null;
  private packedTrommelFuel = 0;
  /** Simple owned gear, such as the big jar. */
  private readonly gear = new Set<GearId>();
  /** The hand classifier, once bought: its screen, what's on it, and its bucket travel with the player. */
  classifier: Classifier | null = null;
  /** The rocker box, once bought: it travels with the player, hopper, apron, bucket and all. */
  rocker: Rocker | null = null;
  /** Upgrades for the sluice, shared with it while it is set up. */
  readonly sluiceKit: SluiceKit = bareKit();
  /** Magnetite share of the last jar pour, so what goes back keeps it. */
  private pourMagnetiteShare: number = MAGNET_TUNING.share;
  fuelCans = 0;
  /** Repair kits carried, for servicing worn machines (see wear.ts). */
  repairKits = 0;
  /** First steps of the early game already taken, for the getting-started checklist. */
  readonly milestones = new Set<Milestone>();

  /** A fresh start, or with `saved`, the vial, jar, and any pan in progress as they were left. */
  constructor(
    private readonly rng: Rng,
    saved?: SessionSnapshot,
  ) {
    if (!saved) return;
    this.vial.push(...saved.vial);
    this.jar.blackSand = saved.jar.blackSand;
    this.jar.magnetite = saved.jar.magnetite;
    this.jar.gold.push(...saved.jar.gold);
    this.clump.sand = saved.clump.sand;
    this.clump.gold.push(...saved.clump.gold);
    this.pansWorked = saved.pansWorked;
    this.cash = saved.cash;
    this.earned = saved.earned;
    this.soldMg = saved.soldMg;
    this.bestPanMg = saved.bestPanMg ?? 0;
    this.pan = saved.pan ? Pan.restore(rng, saved.pan) : null;
    for (const id of saved.gear) this.gear.add(id);
    this.fitKit();
    if (this.sluiceKit.pump) this.sluiceKit.pump.fuel = saved.pumpFuel;
    this.fuelCans = saved.fuelCans;
    this.repairKits = saved.repairKits ?? 0;
    for (const m of saved.milestones ?? []) this.milestones.add(m as Milestone);
    if (saved.trommel) {
      const state = saved.trommel.state;
      this.trommelGear = { placedAt: saved.trommel.placedAt, machine: state ? new Trommel(rng, state, this.sluiceKit) : null };
      this.packedTrommelFuel = saved.trommel.packedFuel;
    }
    if (saved.classifier) this.classifier = new Classifier(rng, saved.classifier);
    if (saved.rocker) this.rocker = new Rocker(rng, saved.rocker);
    if (saved.drywasher) this.drywasher = new Drywasher(rng, saved.drywasher);
    if (saved.tub) this.tub = { ...saved.tub };
    if (saved.highbanker) {
      const state = saved.highbanker.state;
      this.highbankerGear = { placedAt: saved.highbanker.placedAt, machine: state ? new Highbanker(rng, state, this.sluiceKit) : null };
      this.packedHighbankerFuel = saved.highbanker.packedFuel;
    }
    if (saved.sluice) {
      const state = saved.sluice.state;
      this.sluiceGear = { placedAt: saved.sluice.placedAt, sluice: state ? new Sluice(rng, state.site, state, this.sluiceKit) : null };
    }
  }

  snapshot(): SessionSnapshot {
    return structuredClone({
      vial: this.vial,
      jar: this.jar,
      clump: this.clump,
      pansWorked: this.pansWorked,
      pan: this.pan?.snapshot() ?? null,
      cash: this.cash,
      earned: this.earned,
      soldMg: this.soldMg,
      bestPanMg: this.bestPanMg,
      gear: [...this.gear],
      classifier: this.classifier?.snapshot() ?? null,
      rocker: this.rocker?.snapshot() ?? null,
      drywasher: this.drywasher?.snapshot() ?? null,
      tub: this.tub ? { ...this.tub } : null,
      highbanker: this.highbankerGear
        ? { placedAt: this.highbankerGear.placedAt, state: this.highbankerGear.machine?.snapshot() ?? null, packedFuel: this.packedHighbankerFuel }
        : null,
      sluice: this.sluiceGear
        ? { placedAt: this.sluiceGear.placedAt, state: this.sluiceGear.sluice?.snapshot() ?? null }
        : null,
      pumpFuel: this.sluiceKit.pump?.fuel ?? 0,
      fuelCans: this.fuelCans,
      repairKits: this.repairKits,
      milestones: [...this.milestones],
      trommel: this.trommelGear
        ? { placedAt: this.trommelGear.placedAt, state: this.trommelGear.machine?.snapshot() ?? null, packedFuel: this.packedTrommelFuel }
        : null,
    });
  }

  /**
   * Service a worn machine with one of the repair kits carried: it's back to new. Refused (false)
   * with no kit to hand.
   */
  service(machine: { service(): void }): boolean {
    if (this.repairKits <= 0) return false;
    this.repairKits -= 1;
    machine.service();
    return true;
  }

  /** Bring the sluice kit in line with the gear owned. */
  private fitKit(): void {
    const kit = this.sluiceKit;
    kit.improvedMat = this.gear.has('riffleMat');
    kit.legs = this.gear.has('legs');
    if (this.gear.has('pump') && !kit.pump) kit.pump = { fuel: 0 };
  }

  /**
   * Empty a can of fuel into the pump's tank. Refused with no pump, no cans, or a tank already
   * nearly full (a can is a tankful, so topping up early wastes most of it).
   */
  refuelPump(): 'refuelled' | 'noPump' | 'noCans' | 'full' {
    const pump = this.sluiceKit.pump;
    if (!pump) return 'noPump';
    if (pump.fuel > SLUICE_TUNING.pumpTank * 0.75) return 'full';
    if (this.fuelCans <= 0) return 'noCans';
    this.fuelCans -= 1;
    pump.fuel = SLUICE_TUNING.pumpTank;
    return 'refuelled';
  }

  owns(id: GearId): boolean {
    if (id === 'sluice') return this.sluiceGear !== null;
    if (id === 'classifier') return this.classifier !== null;
    if (id === 'rocker') return this.rocker !== null;
    if (id === 'highbanker') return this.highbankerGear !== null;
    if (id === 'trommel') return this.trommelGear !== null;
    if (id === 'drywasher') return this.drywasher !== null;
    if (id === 'washTub') return this.tub !== null;
    return this.gear.has(id);
  }

  /** Take possession of bought gear (the outfitter handles the money). */
  acquire(id: GearId): void {
    if (id === 'sluice') {
      if (!this.sluiceGear) this.sluiceGear = { placedAt: null, sluice: null };
    } else if (id === 'classifier') {
      if (!this.classifier) this.classifier = new Classifier(this.rng);
    } else if (id === 'rocker') {
      if (!this.rocker) this.rocker = new Rocker(this.rng);
    } else if (id === 'drywasher') {
      if (!this.drywasher) this.drywasher = new Drywasher(this.rng);
    } else if (id === 'washTub') {
      if (!this.tub) this.tub = freshTub();
    } else if (id === 'highbanker') {
      if (!this.highbankerGear) this.highbankerGear = { placedAt: null, machine: null };
    } else if (id === 'trommel') {
      if (!this.trommelGear) this.trommelGear = { placedAt: null, machine: null };
    } else {
      this.gear.add(id);
      this.fitKit();
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
   * Set the sluice up in the creek beside a spot. Only works at a sluice site, and where the
   * creek runs thin, only with a pump. If it is set up somewhere else it is taken down first,
   * which washes its moss into the jar.
   */
  setUpSluice(creekId: number, spot: DigSpot): SetUpResult {
    const gear = this.sluiceGear;
    if (!gear) return 'notOwned';
    if (!spot.sluiceSite) return 'noSite';
    if (needsPump(spot.sluiceSite) && !this.sluiceKit.pump) return 'needsPump';
    if (gear.placedAt?.creekId === creekId && gear.placedAt.spotId === spot.id) return 'set';
    if (this.highbankerAt(creekId, spot.id) || this.trommelAt(creekId, spot.id)) return 'occupied';
    if (this.takeDownSluice() === 'jarFull') return 'jarFull';
    gear.placedAt = { creekId, spotId: spot.id };
    gear.sluice = new Sluice(this.rng, spot.sluiceSite, undefined, this.sluiceKit);
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

  /** Where the highbanker is set up, if it is. */
  get highbankerPlace(): SluicePlace | null {
    return this.highbankerGear?.placedAt ?? null;
  }

  highbankerAt(creekId: number, spotId: number): Highbanker | null {
    const gear = this.highbankerGear;
    return gear?.placedAt?.creekId === creekId && gear.placedAt.spotId === spotId ? gear.machine : null;
  }

  /**
   * Set the highbanker up on the bank beside a spot. It needs strong water to pump from and room
   * for the stand: a creek bend, gravel bar or ravine, never a plain stretch, a dry wash, or the
   * Home Creek. It can't share a spot with the hand sluice. Moving it takes it down first, which
   * washes its moss into the jar. The engine's fuel stays in its tank.
   */
  setUpHighbanker(creek: Creek, spot: DigSpot): HighbankerSetUpResult {
    const gear = this.highbankerGear;
    if (!gear) return 'notOwned';
    if (!siteAllows(creek.profile.site, 'highbanker')) return 'noRoom';
    if (spot.gully) return 'gully';
    if (gear.placedAt?.creekId === creek.id && gear.placedAt.spotId === spot.id) return 'set';
    if (this.sluiceAt(creek.id, spot.id) || this.trommelAt(creek.id, spot.id)) return 'occupied';
    const fuel = gear.machine?.fuel ?? this.packedHighbankerFuel;
    if (this.takeDownHighbanker() === 'jarFull') return 'jarFull';
    gear.placedAt = { creekId: creek.id, spotId: spot.id };
    gear.machine = new Highbanker(this.rng, undefined, this.sluiceKit);
    gear.machine.fuel = fuel;
    return 'set';
  }

  /** Where the trommel is set up, if it is. */
  get trommelPlace(): SluicePlace | null {
    return this.trommelGear?.placedAt ?? null;
  }

  trommelAt(creekId: number, spotId: number): Trommel | null {
    const gear = this.trommelGear;
    return gear?.placedAt?.creekId === creekId && gear.placedAt.spotId === spotId ? gear.machine : null;
  }

  /**
   * Set the trommel up on the bar beside a spot: gravel bars only, never a gully, never sharing a
   * spot with the sluice or highbanker. Moving it takes it down first, washing its deck into the jar.
   */
  setUpTrommel(creek: Creek, spot: DigSpot): HighbankerSetUpResult {
    const gear = this.trommelGear;
    if (!gear) return 'notOwned';
    if (!siteAllows(creek.profile.site, 'trommel')) return 'noRoom';
    if (spot.gully) return 'gully';
    if (gear.placedAt?.creekId === creek.id && gear.placedAt.spotId === spot.id) return 'set';
    if (this.sluiceAt(creek.id, spot.id) || this.highbankerAt(creek.id, spot.id)) return 'occupied';
    const fuel = gear.machine?.fuel ?? this.packedTrommelFuel;
    if (this.takeDownTrommel() === 'jarFull') return 'jarFull';
    gear.placedAt = { creekId: creek.id, spotId: spot.id };
    gear.machine = new Trommel(this.rng, undefined, this.sluiceKit);
    gear.machine.fuel = fuel;
    return 'set';
  }

  /** Take the trommel down: the deck's mat washed into the jar, the hopper and drum tipped out. */
  takeDownTrommel(): Concentrate | 'jarFull' | null {
    const gear = this.trommelGear;
    const machine = gear?.machine;
    if (!gear || !machine) return null;
    if (!this.fitsInJar(machine.deck.matVolume)) return 'jarFull';
    machine.emptyAll();
    machine.deck.emptyHeader();
    const concentrate = machine.deck.liftMat();
    this.addConcentrate(concentrate);
    this.packedTrommelFuel = machine.fuel;
    gear.placedAt = null;
    gear.machine = null;
    return concentrate;
  }

  /** Pour a can into the trommel's tank. */
  refuelTrommel(): 'refuelled' | 'notSetUp' | 'noCans' | 'full' {
    const machine = this.trommelGear?.machine;
    if (!machine) return 'notSetUp';
    if (machine.fuel > TROMMEL_TUNING.tank * 0.75) return 'full';
    if (this.fuelCans <= 0) return 'noCans';
    this.fuelCans -= 1;
    machine.refuel();
    return 'refuelled';
  }

  /** Fuel left in the highbanker's tank while it's packed. */
  private packedHighbankerFuel = 0;

  /**
   * Take the highbanker down: the mat is washed into the jar, the hopper and header tipped out.
   * Waits (returns 'jarFull') if the jar has no room for the mat.
   */
  takeDownHighbanker(): Concentrate | 'jarFull' | null {
    const gear = this.highbankerGear;
    const machine = gear?.machine;
    if (!gear || !machine) return null;
    if (!this.fitsInJar(machine.sluice.matVolume)) return 'jarFull';
    machine.emptyHopper();
    machine.sluice.emptyHeader();
    const concentrate = machine.sluice.liftMat();
    this.addConcentrate(concentrate);
    this.packedHighbankerFuel = machine.fuel;
    gear.placedAt = null;
    gear.machine = null;
    return concentrate;
  }

  /** Pour a can into the highbanker's tank. Refused with it packed, no cans, or a tank still mostly full. */
  refuelHighbanker(): 'refuelled' | 'notSetUp' | 'noCans' | 'full' {
    const machine = this.highbankerGear?.machine;
    if (!machine) return 'notSetUp';
    if (machine.fuel > HIGHBANKER_TUNING.tank * 0.75) return 'full';
    if (this.fuelCans <= 0) return 'noCans';
    this.fuelCans -= 1;
    machine.refuel();
    return 'refuelled';
  }

  /**
   * Take down the sluice and highbanker, wherever they are, whatever the jar holds, as when a
   * shutdown forces it. Both are packed and kept. Mats go into the jar as far as they fit; any
   * that won't fit are handed back to be carried. Gravel in the header and hopper is tipped out.
   */
  packUp(): Concentrate[] {
    const overflow: Concentrate[] = [];
    const keep = (mat: Concentrate): void => {
      if (!this.addConcentrate(mat)) overflow.push(mat);
    };
    const sluice = this.sluiceGear;
    if (sluice?.sluice) {
      sluice.sluice.emptyHeader();
      keep(sluice.sluice.liftMat());
      sluice.placedAt = null;
      sluice.sluice = null;
    }
    const hb = this.highbankerGear;
    if (hb?.machine) {
      hb.machine.emptyHopper();
      hb.machine.sluice.emptyHeader();
      keep(hb.machine.sluice.liftMat());
      this.packedHighbankerFuel = hb.machine.fuel;
      hb.placedAt = null;
      hb.machine = null;
    }
    const tr = this.trommelGear;
    if (tr?.machine) {
      tr.machine.emptyAll();
      tr.machine.deck.emptyHeader();
      keep(tr.machine.deck.liftMat());
      this.packedTrommelFuel = tr.machine.fuel;
      tr.placedAt = null;
      tr.machine = null;
    }
    return overflow;
  }

  /** True when the pan can take a new shovelful: none yet, or the last one is finished. */
  get panIsFree(): boolean {
    return this.pan === null || this.pan.phase === 'emptied';
  }

  /** Fill the pan with a shovelful. `waterMurk`: how muddy the water is (a wash tub), 0 for a creek. */
  startPan(load: PanLoad, waterMurk = 0): Pan {
    if (!this.panIsFree) throw new Error('The pan is still in use');
    this.pan = new Pan(this.rng, load);
    this.pan.waterMurk = waterMurk;
    return this.pan;
  }

  /** Pan a pan-sized share of the classifier's bucket. */
  startScreenedPan(waterMurk = 0): Pan | null {
    if (!this.panIsFree || !this.classifier) return null;
    const material = this.classifier.pour(PAN_VOLUME);
    if (!material) return null;
    this.pan = Pan.fromScreened(this.rng, material);
    this.pan.waterMurk = waterMurk;
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
    this.addToJar(concentrate.blackSand, MAGNET_TUNING.share, concentrate.gold);
    return true;
  }

  /** Black sand into the jar, with the share of it that is magnetite. */
  private addToJar(blackSand: number, magnetiteShare: number, gold: readonly GoldPiece[]): void {
    this.jar.blackSand += blackSand;
    this.jar.magnetite += blackSand * magnetiteShare;
    this.jar.gold.push(...gold);
  }

  /** Share of the jar still magnetite. */
  get jarMagnetiteShare(): number {
    return this.jar.blackSand > 1e-9 ? this.jar.magnetite / this.jar.blackSand : 0;
  }

  /** Pass the magnet over the jar's sand spread in the tray. Needs the magnet. */
  passMagnet(dt: number, closeness: number): MagnetStepEvents {
    if (!this.gear.has('magnet')) return { lifted: 0, goldLifted: 0 };
    return magnetStep(this.rng, this.jar, this.clump, dt, closeness);
  }

  shakeClumpBack(): void {
    shakeBack(this.rng, this.jar, this.clump);
  }

  /** Strip the clump onto the discard pile. Returns the gold that went with it (never shown). */
  stripClump(): GoldPiece[] {
    return stripOff(this.clump);
  }

  /** Put everything on the sleeve back in the tray, as when the magnet is set down mid-job. */
  dropClump(): void {
    this.jar.blackSand += this.clump.sand;
    this.jar.magnetite += this.clump.sand;
    this.jar.gold.push(...this.clump.gold);
    this.clump.sand = 0;
    this.clump.gold = [];
  }

  /**
   * Pour black sand from the jar into the pan to re-pan it. The gold saved in the jar comes with
   * it in proportion to how much of the jar is poured.
   */
  startConcentratePan(waterMurk = 0, finishing = false): Pan {
    if (!this.canPanConcentrate) throw new Error('Nothing to pour, or the pan is in use');
    const amount = Math.min(this.jar.blackSand, CONCENTRATE_POUR);
    const share = amount / this.jar.blackSand;
    const poured: GoldPiece[] = [];
    const kept: GoldPiece[] = [];
    for (const piece of this.jar.gold) (share >= 1 || this.rng.next() < share ? poured : kept).push(piece);
    this.jar.gold = kept;
    this.pourMagnetiteShare = this.jarMagnetiteShare;
    this.jar.magnetite -= this.jar.magnetite * share;
    this.jar.blackSand -= amount;
    this.pan = new Pan(this.rng, { richness: 0, clayiness: 0, rockiness: 0 }, { blackSand: amount, gold: poured });
    this.pan.waterMurk = waterMurk;
    this.pan.finishing = finishing && this.owns('finishingPan');
    return this.pan;
  }

  /** Snuff at a point along the revealed tail, if the snuffer bottle is to hand. */
  snuff(at: number): number {
    if (!this.owns('snuffer') || this.pan?.phase !== 'revealed') return 0;
    return this.pan.snuff(at);
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
    const toSave = this.pan.sandToSave(saveBlackSand);
    if (toSave > 0 && !this.fitsInJar(toSave)) return null;
    const { collected, toJar, blackSand } = this.pan.collect(saveBlackSand);
    this.vial.push(...collected);
    // Black sand from gravel is fresh; a jar pour going back keeps whatever share it came out with.
    this.addToJar(blackSand, this.pan.kind === 'gravel' ? MAGNET_TUNING.share : this.pourMagnetiteShare, toJar);
    if (this.pan.kind === 'gravel') {
      this.pansWorked += 1;
      this.bestPanMg = Math.max(this.bestPanMg, totalMg(collected));
    }
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
