import { rollShovelful, totalMg, type GoldPiece, type GoldSize, type PanLoad, type Rock } from './pan';
import type { Rng } from './rng';

/**
 * Hand sluice (see "Sluice UX Specification" in the design doc).
 *
 * Shovelfuls land in the header box at the top. Water carries material out of the header and
 * down over the riffles and miner's moss; dense concentrate (black sand, gold) is caught in the
 * moss, and everything else leaves as tailings. The site fixes the slope and how much water the
 * creek offers; the player sets how much of it to let in, how fast to shovel, and when to clean out.
 *
 * - Underpowered: too little water for the feed. The header backs up, riffles pack with sand,
 *   and rocks jam the intake until raked clear.
 * - Balanced: steady throughput and strong recovery.
 * - Overpowered: fast, but fine gold and black sand are swept past the riffles and scoured out of the moss.
 *
 * The moss catches less as it loads up, so late cleanouts cost recovery. Nothing here needs a
 * screen: a crew could run it off-site.
 */

/** Fixed by where the sluice was set up. */
export interface SluiceSite {
  /** 0 = barely any drop, 1 = steep. */
  readonly slope: number;
  /** How much water the creek offers here, 0..1. */
  readonly flow: number;
}

export interface SluiceControls {
  /** Share of the creek's offered flow let in at the intake, 0..1. */
  readonly flow: number;
}

export type SluiceState = 'underpowered' | 'balanced' | 'overpowered';

/** What visibly happened during one step, for the renderer. */
export interface SluiceStepEvents {
  readonly state: SluiceState;
  /** 0..1 water power over the riffles. */
  readonly power: number;
  /** Material carried out of the header onto the riffles this step. */
  readonly released: number;
  readonly goldLost: number;
  readonly blackLost: number;
  readonly glints: number;
  readonly jammed: boolean;
}

/** What comes off the mat at cleanout, to be panned. */
export interface Concentrate {
  /** Black sand plus whatever light material the moss held, in pan-volume units. */
  readonly blackSand: number;
  readonly gold: readonly GoldPiece[];
}

export const SLUICE_TUNING = {
  /** Power = let-in flow × site flow × (base + perSlope × slope). */
  slopeBase: 0.4,
  slopePerSlope: 0.6,
  /** Volume carried out of the header per second at full power. */
  carryRate: 0.8,
  /** The header holds about a shovelful and a bit before it backs up and starts to jam... */
  headerCapacity: 1,
  /** ...and takes no more once it is brim full. */
  headerMax: 2,
  underpowered: 0.3,
  overpowered: 0.62,
  /** Chance a piece is caught at ideal flow with fresh moss. */
  capture: { fine: 0.88, flake: 0.97, picker: 0.995 } as Record<GoldSize, number>,
  /** How much of that chance full overpower takes away. */
  overpowerLoss: { fine: 0.8, flake: 0.4, picker: 0.05 } as Record<GoldSize, number>,
  blackCapture: 0.8,
  /** Share of light sand that stays in the moss. */
  lightTrap: 0.03,
  /** Moss volume; loading is (black + light held) / capacity. */
  mossCapacity: 0.5,
  /** An overloaded mat holds at most this multiple of its capacity; past that, sand washes straight through. */
  mossOverfill: 1.2,
  /** Above this loading the moss starts letting material through... */
  mossFullFrom: 0.6,
  /** ...until, full, it misses this share of what it would have caught. */
  mossFullLoss: 0.6,
  /** Capture lost when an underpowered sluice's riffles pack with sand. */
  packedLoss: 0.3,
  clogGrowth: 0.6,
  /** Clog added per rock tumbling off the header, less in strong water. */
  rockClog: 0.04,
  /** Strong water slowly clears a partial clog on its own. */
  clogClear: 0.05,
  rakeClear: 0.35,
  /** Each rake also drags this much backed-up material down onto the riffles. */
  rakePull: 0.3,
  /** Raking out a jam stirs the moss: share of each kind lost per rake. */
  rakeMossLoss: { fine: 0.025, flake: 0.01, picker: 0 } as Record<GoldSize, number>,
  rakeBlackLoss: 0.06,
  /** Moss fines scoured out per second at full overpower... */
  scour: 0.03,
  /** ...and per second per unit power by clean water over an empty mat (rinsing too long). */
  rinseScour: 0.004,
  /** Share of the gold in a clay ball's share of the flow that rolls out with it. */
  clayGoldCarry: 0.6,
  /** How fast water clears material off the riffles. */
  bedClear: 1.5,
  /** Most gravel the riffles can hold; lifting the mat brings up this share of what's there. */
  bedHold: 0.5,
  bedLift: 0.3,
  glintRate: 0.6,
} as const;

interface Hold {
  light: number;
  black: number;
  clay: number;
  rocks: Rock[];
  gold: GoldPiece[];
}

export interface SluiceSnapshot {
  readonly site: SluiceSite;
  readonly header: Hold;
  readonly moss: { readonly black: number; readonly light: number; readonly gold: readonly GoldPiece[] };
  readonly bedLoad: number;
  readonly clog: number;
  readonly lost: readonly GoldPiece[];
  readonly lostBlack: number;
  readonly fedMg: number;
  readonly shovelfulsFed: number;
  readonly elapsed: number;
}

export class Sluice {
  readonly site: SluiceSite;
  private header: Hold = { light: 0, black: 0, clay: 0, rocks: [], gold: [] };
  private moss: { black: number; light: number; gold: GoldPiece[] } = { black: 0, light: 0, gold: [] };
  /** Material on the riffles right now: what a short rinse leaves behind. */
  bedLoad = 0;
  /** 0 = clear, 1 = jammed solid. */
  clog = 0;
  readonly lost: GoldPiece[] = [];
  lostBlack = 0;
  /** Gold shovelled in so far (including pickers stuck in rocks), for recovery figures. */
  fedMg = 0;
  shovelfulsFed = 0;
  elapsed = 0;
  /** Water power at the last step, for actions taken between steps (raking). */
  private lastPower = 0;

  constructor(
    private readonly rng: Rng,
    site: SluiceSite,
    saved?: SluiceSnapshot,
  ) {
    this.site = site;
    if (!saved) return;
    const copy = structuredClone(saved) as SluiceSnapshot & { header: Hold; moss: { black: number; light: number; gold: GoldPiece[] } };
    this.header = copy.header;
    this.moss = copy.moss;
    this.bedLoad = copy.bedLoad;
    this.clog = copy.clog;
    this.lost.push(...copy.lost);
    this.lostBlack = copy.lostBlack;
    this.fedMg = copy.fedMg;
    this.shovelfulsFed = copy.shovelfulsFed;
    this.elapsed = copy.elapsed;
  }

  snapshot(): SluiceSnapshot {
    return structuredClone({
      site: this.site,
      header: this.header,
      moss: this.moss,
      bedLoad: this.bedLoad,
      clog: this.clog,
      lost: this.lost,
      lostBlack: this.lostBlack,
      fedMg: this.fedMg,
      shovelfulsFed: this.shovelfulsFed,
      elapsed: this.elapsed,
    });
  }

  get jammed(): boolean {
    return this.clog >= 1;
  }

  /** Material waiting in the header box. */
  get headerVolume(): number {
    return this.header.light + this.header.black + this.header.clay;
  }

  get headerRocks(): number {
    return this.header.rocks.length;
  }

  /** 0 = fresh moss, 1 = full. The true value; any readout of it should stay approximate. */
  get mossLoading(): number {
    return Math.min(1, (this.moss.black + this.moss.light) / SLUICE_TUNING.mossCapacity);
  }

  /** Gold pieces in the moss, for glints; never shown as a number before cleanout. */
  get mossGoldCount(): number {
    return this.moss.gold.length;
  }

  power(controls: SluiceControls): number {
    const T = SLUICE_TUNING;
    return clamp01(controls.flow) * clamp01(this.site.flow) * (T.slopeBase + T.slopePerSlope * clamp01(this.site.slope));
  }

  classify(power: number): SluiceState {
    if (power > SLUICE_TUNING.overpowered) return 'overpowered';
    if (power < SLUICE_TUNING.underpowered || this.headerVolume >= SLUICE_TUNING.headerCapacity) return 'underpowered';
    return 'balanced';
  }

  /** Why a shovelful can't go in right now, if it can't. */
  get feedBlocked(): 'jammed' | 'full' | null {
    if (this.jammed) return 'jammed';
    if (this.headerVolume >= SLUICE_TUNING.headerMax) return 'full';
    return null;
  }

  /** Shovel a load into the header. Refused while the intake is jammed or the header is brim full. */
  feed(load: PanLoad): boolean {
    if (this.feedBlocked) return false;
    const shovelful = rollShovelful(this.rng, load);
    this.addToHeader(shovelful.lightSand, shovelful.blackSand, shovelful.clay, shovelful.rocks, shovelful.gold);
    this.shovelfulsFed += 1;
    return true;
  }

  /**
   * Pour screened material from the classifier's bucket into the header: no rocks to jam the
   * intake or carry pickers off the end. Refused while jammed or brim full.
   */
  feedScreened(material: { light: number; black: number; clay: number; gold: readonly GoldPiece[] }): boolean {
    if (this.feedBlocked) return false;
    this.addToHeader(material.light, material.black, material.clay, [], material.gold);
    return true;
  }

  /** Room left in the header before it is brim full. */
  get headerRoom(): number {
    return Math.max(0, SLUICE_TUNING.headerMax - this.headerVolume);
  }

  private addToHeader(light: number, black: number, clay: number, rocks: readonly Rock[], gold: readonly GoldPiece[]): void {
    this.header.light += light;
    this.header.black += black;
    this.header.clay += clay;
    this.header.rocks.push(...rocks);
    this.header.gold.push(...gold);
    this.fedMg += totalMg(gold) + totalMg(rocks.flatMap((r) => (r.stuckPicker ? [r.stuckPicker] : [])));
  }

  step(dt: number, controls: SluiceControls): SluiceStepEvents {
    const T = SLUICE_TUNING;
    const rng = this.rng;
    this.elapsed += dt;
    const power = this.power(controls);
    const state = this.classify(power);
    const over = Math.max(0, (power - T.overpowered) / (1 - T.overpowered));
    this.lastPower = power;

    // Water carries material out of the header, as fast as the power allows and the clog lets it.
    const carried = this.release(power * T.carryRate * dt * (1 - Math.min(1, this.clog)));
    const released = carried.volume;
    let goldLost = carried.goldLost;
    let blackLost = carried.blackLost;
    this.bedLoad -= this.bedLoad * Math.min(1, power * T.bedClear * dt);

    // A backed-up header jams; strong water slowly works a partial clog loose.
    const backlog = this.headerVolume - T.headerCapacity;
    if (backlog > 0) this.clog += backlog * T.clogGrowth * dt;
    else this.clog = Math.max(0, this.clog - power * T.clogClear * dt);
    this.clog = Math.min(1, this.clog);

    // Scour: overpowered water, or clean water over a clear mat, lifts fines back out of the moss.
    const scour = over * T.scour + (this.bedLoad < 0.02 ? power * T.rinseScour : 0);
    if (scour > 0) {
      goldLost += this.loseFromMoss((size) => (size === 'fine' ? scour : size === 'flake' ? scour * 0.3 : 0) * dt);
      const scoured = this.moss.black * scour * 0.5 * dt;
      this.moss.black -= scoured;
      this.lostBlack += scoured;
      blackLost += scoured;
    }
    const glints = rng.next() < Math.min(1, this.moss.gold.length * 0.05) * power * T.glintRate * dt ? 1 : 0;
    return { state, power, released, goldLost, blackLost, glints, jammed: this.jammed };
  }

  /**
   * Rake at the intake to clear a clog. Raking out a full jam churns the moss and costs some of
   * what it held. Returns true once the jam is broken.
   */
  rake(): boolean {
    if (this.clog <= 0) return false;
    const T = SLUICE_TUNING;
    const wasJammed = this.jammed;
    this.clog = Math.max(0, this.clog - T.rakeClear);
    this.release(T.rakePull);
    if (wasJammed) {
      this.loseFromMoss((size) => T.rakeMossLoss[size]);
      const churned = this.moss.black * T.rakeBlackLoss;
      this.moss.black -= churned;
      this.lostBlack += churned;
    }
    return wasJammed && !this.jammed;
  }

  /** How much the mat would bring up if lifted now: the moss, what it holds, and gravel still on the riffles. */
  get matVolume(): number {
    const T = SLUICE_TUNING;
    return this.moss.black + this.moss.light + Math.min(this.bedLoad, T.bedHold) * T.bedLift;
  }

  /**
   * Lift the moss and wash it into a tub. Whatever is still on the riffles comes with it, so a
   * short rinse means more gravel to pan. The moss goes back in fresh.
   */
  liftMat(): Concentrate {
    const concentrate = { blackSand: this.matVolume, gold: this.moss.gold };
    this.moss = { black: 0, light: 0, gold: [] };
    this.bedLoad = 0;
    return concentrate;
  }

  /**
   * Carry up to `volume` out of the header and over the riffles at the current water power.
   * Gold and black sand are caught in the moss or lost as tailings; rocks tumble off.
   */
  private release(volume: number): { volume: number; goldLost: number; blackLost: number } {
    const T = SLUICE_TUNING;
    const rng = this.rng;
    const power = this.lastPower;
    const over = Math.max(0, (power - T.overpowered) / (1 - T.overpowered));
    const held = this.headerVolume;
    const released = Math.min(held, volume);
    const share = held > 0 ? released / held : 0;
    const light = this.header.light * share;
    const black = this.header.black * share;
    const clay = this.header.clay * share;
    this.header.light -= light;
    this.header.black -= black;
    this.header.clay -= clay;

    // Rocks tumble off the header; in weak water they catch and build the clog. Pickers stuck in them go too.
    let goldLost = 0;
    this.header.rocks = this.header.rocks.filter((rock) => {
      if (rng.next() >= share) return true;
      this.clog = Math.min(1, this.clog + T.rockClog * (1 - power));
      if (rock.stuckPicker) {
        this.lost.push(rock.stuckPicker);
        goldLost += 1;
      }
      return false;
    });

    // Capture over the riffles: worse when the moss is full, the riffles are packed, or clay balls roll through.
    const fullness = clamp01((this.mossLoading - T.mossFullFrom) / (1 - T.mossFullFrom)) * T.mossFullLoss;
    const packing = this.classify(power) === 'underpowered' && held > 0.5 ? Math.min(1, held / T.headerCapacity) : 0;
    const clayShare = released > 0 ? clay / released : 0;
    const keep = (1 - fullness) * (1 - T.packedLoss * packing) * (1 - clayShare * T.clayGoldCarry);
    this.header.gold = this.header.gold.filter((piece) => {
      if (rng.next() >= share) return true;
      const caught = T.capture[piece.size] * (1 - T.overpowerLoss[piece.size] * over) * keep;
      if (rng.next() < caught) this.moss.gold.push(piece);
      else {
        this.lost.push(piece);
        goldLost += 1;
      }
      return false;
    });

    // An overloaded mat can't hold any more sand: the excess washes on through.
    const room = Math.max(0, T.mossCapacity * T.mossOverfill - this.moss.black - this.moss.light);
    const blackCaught = Math.min(room, black * T.blackCapture * (1 - 0.8 * over) * (1 - fullness));
    this.moss.black += blackCaught;
    this.moss.light += Math.min(room - blackCaught, light * T.lightTrap * (1 - fullness));
    this.lostBlack += black - blackCaught;
    this.bedLoad += released;
    return { volume: released, goldLost, blackLost: black - blackCaught };
  }

  /**
   * Tip out whatever gravel is still in the header, as when taking the sluice down. Its gold
   * goes with it. Returns how many pieces were lost.
   */
  emptyHeader(): number {
    const pickers = this.header.rocks.flatMap((r) => (r.stuckPicker ? [r.stuckPicker] : []));
    const gold = [...this.header.gold, ...pickers];
    this.lost.push(...gold);
    this.header = { light: 0, black: 0, clay: 0, rocks: [], gold: [] };
    return gold.length;
  }

  private loseFromMoss(chance: (size: GoldSize) => number): number {
    const before = this.moss.gold.length;
    this.moss.gold = this.moss.gold.filter((piece) => {
      if (this.rng.next() < chance(piece.size)) {
        this.lost.push(piece);
        return false;
      }
      return true;
    });
    return before - this.moss.gold.length;
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
