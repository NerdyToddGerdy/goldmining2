import { rollShovelful, totalMg, type GoldPiece, type PanLoad, type Rock } from './pan';
import type { Rng } from './rng';
import { Sluice, bareKit, type SluiceKit, type SluiceSnapshot, type SluiceStepEvents } from './sluice';
import { WEAR_TUNING } from './wear';

/**
 * Highbanker (see the gear interaction matrix in the design doc: "Prime, feed, monitor · pump
 * pushes water uphill; hopper vibrates; material moves to sluice · fuel, water, feed rate, clog
 * prevention").
 *
 * A sluice box on a stand up on the bank, fed by a hopper with a grizzly (sloped bars) and a spray
 * bar, all watered by a small engine-driven pump drawing from the creek through a hose. It moves
 * much more gravel than the hand sluice because it doesn't need to sit in the creek: the player
 * shovels into the hopper from the hole, and the spray washes the fines down onto the riffles while
 * rocks roll off the end of the grizzly.
 *
 * The throttle sets the pump: it is the water control for the sluice below (so the familiar
 * underpowered / balanced / overpowered states apply), and it sets how fast fuel burns and how hot
 * the engine runs. What goes wrong is mechanical:
 * - The pump has to be primed before it moves water, and the hose can shift and suck air (more
 *   often at high throttle), losing prime: the spray stops.
 * - An engine run without water, or hard for long, overheats and stalls until it cools.
 * - A rock can jam across the grizzly and stop the hopper until it's cleared.
 * - The tank runs dry.
 * Nothing here needs a screen.
 */

export const HIGHBANKER_TUNING = {
  /** The stand's fixed slope, the flow a primed pump gives the sluice, and how much bigger its box is. */
  slope: 0.5,
  pumpFlow: 0.95,
  boxScale: 1.6,
  /** Most material the hopper holds, and what it passes per second at full throttle. */
  hopperMax: 2.2,
  passRate: 0.9,
  /** Rocks rolling off the grizzly per second, per rock, at full spray. */
  rockRoll: 0.5,
  /** Chance per second per rock on the grizzly of one jamming across the bars, at full throttle. */
  jamPerRock: 0.02,
  /** Seconds of running on a full tank; burn scales with throttle from the idle share. */
  tank: 150,
  idleBurn: 0.25,
  /** Seconds to prime the pump (the game layer makes the player wait). */
  primeSeconds: 2.5,
  /** Chance per second of the hose sucking air, at full throttle. */
  losePrime: 0.012,
  /** Heat per second: working with water (by throttle squared), running dry, and cooling. */
  heatWorking: 0.018,
  heatDry: 0.12,
  cool: 0.05,
  /** At full heat the engine stalls; it won't restart until it has cooled below this. */
  restartBelow: 0.5,
} as const;

export type EngineEvent = 'lostPrime' | 'overheated' | 'outOfFuel' | 'jammed' | 'seized' | null;

export interface HighbankerStepEvents {
  readonly sluice: SluiceStepEvents;
  /** Water is moving: the engine is running with the pump primed. */
  readonly spraying: boolean;
  /** Material passed from the hopper to the sluice this step. */
  readonly passed: number;
  /** Rocks rolled off the grizzly this step. */
  readonly rocksOff: number;
  readonly event: EngineEvent;
}

interface Hopper {
  light: number;
  black: number;
  clay: number;
  rocks: Rock[];
  gold: GoldPiece[];
}

export interface HighbankerSnapshot {
  readonly sluice: SluiceSnapshot;
  readonly hopper: Hopper;
  readonly fuel: number;
  readonly heat: number;
  readonly primed: boolean;
  readonly running: boolean;
  readonly jammed: boolean;
  readonly rinsing: boolean;
  readonly fedMg: number;
  /** Engine hours worn in, 0 new .. 1 seized. Absent means new. */
  readonly engineWear?: number;
}

export type StartResult = 'started' | 'noFuel' | 'tooHot' | 'running' | 'seized';

export class Highbanker {
  readonly sluice: Sluice;
  private hopper: Hopper = emptyHopper();
  /** Seconds of running left in the tank. */
  fuel = 0;
  /** 0 cold, 1 stalls. */
  heat = 0;
  primed = false;
  running = false;
  /** A rock is jammed across the grizzly: nothing passes until it's cleared. */
  jammed = false;
  /** A cleanout is under way: the hopper holds back while clean water rinses the riffles. */
  rinsing = false;
  /** Gold shovelled into the hopper so far (including pickers in rocks), for recovery figures. */
  fedMg = 0;
  /** The engine's running hours, 0 new .. 1 seized (see wear.ts). */
  engineWear = 0;

  constructor(
    private readonly rng: Rng,
    saved?: HighbankerSnapshot,
    kit: SluiceKit = bareKit(),
  ) {
    const site = { slope: HIGHBANKER_TUNING.slope, flow: HIGHBANKER_TUNING.pumpFlow, scale: HIGHBANKER_TUNING.boxScale };
    this.sluice = new Sluice(rng, site, saved?.sluice, kit);
    if (!saved) return;
    const copy = structuredClone(saved.hopper) as Hopper;
    this.hopper = copy;
    this.fuel = saved.fuel;
    this.heat = saved.heat;
    this.primed = saved.primed;
    this.running = saved.running;
    this.jammed = saved.jammed;
    this.rinsing = saved.rinsing;
    this.fedMg = saved.fedMg;
    this.engineWear = saved.engineWear ?? 0;
  }

  snapshot(): HighbankerSnapshot {
    return {
      sluice: this.sluice.snapshot(),
      hopper: structuredClone(this.hopper),
      fuel: this.fuel,
      heat: this.heat,
      primed: this.primed,
      running: this.running,
      jammed: this.jammed,
      rinsing: this.rinsing,
      fedMg: this.fedMg,
      ...(this.engineWear > 0 ? { engineWear: this.engineWear } : {}),
    };
  }

  /** The engine has worn out and seized: it won't turn over until it's serviced. */
  get seized(): boolean {
    return this.engineWear >= 1;
  }

  /** Service the engine and pump, and fit the box with fresh moss: back to new. */
  service(): void {
    this.engineWear = 0;
    this.sluice.service();
  }

  get hopperVolume(): number {
    return this.hopper.light + this.hopper.black + this.hopper.clay;
  }

  get hopperRocks(): number {
    return this.hopper.rocks.length;
  }

  get hopperFull(): boolean {
    return this.hopperVolume >= HIGHBANKER_TUNING.hopperMax;
  }

  get hopperRoom(): number {
    return Math.max(0, HIGHBANKER_TUNING.hopperMax - this.hopperVolume);
  }

  /** Too hot to start until it cools. */
  get tooHot(): boolean {
    return !this.running && this.heat > HIGHBANKER_TUNING.restartBelow;
  }

  /** Shovel a load into the hopper. Refused while it's heaped full. */
  feed(load: PanLoad): boolean {
    if (this.hopperFull) return false;
    const s = rollShovelful(this.rng, load);
    this.addToHopper(s.lightSand, s.blackSand, s.clay, s.rocks, s.gold);
    return true;
  }

  /** Pour screened material (the classifier's bucket) into the hopper: no rocks. */
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

  /** The pump is primed (the game layer makes the player wait out HIGHBANKER_TUNING.primeSeconds). */
  prime(): void {
    this.primed = true;
  }

  start(): StartResult {
    if (this.running) return 'running';
    if (this.seized) return 'seized';
    if (this.fuel <= 0) return 'noFuel';
    if (this.heat > HIGHBANKER_TUNING.restartBelow) return 'tooHot';
    this.running = true;
    return 'started';
  }

  stop(): void {
    this.running = false;
  }

  /** Pour a can into the tank. */
  refuel(): void {
    this.fuel = HIGHBANKER_TUNING.tank;
  }

  /**
   * Pull the jammed rock and anything else stuck on the grizzly off the end. Pickers wedged in
   * them go too, unannounced. Returns how many rocks came off.
   */
  clearGrizzly(): number {
    const rocks = this.hopper.rocks.length;
    for (const rock of this.hopper.rocks) if (rock.stuckPicker) this.sluice.lost.push(rock.stuckPicker);
    this.hopper.rocks = [];
    this.jammed = false;
    return rocks;
  }

  /**
   * Tip everything out of the hopper, as when the highbanker comes down. Its gold goes with it.
   * Returns how many pieces were lost.
   */
  emptyHopper(): number {
    const pickers = this.hopper.rocks.flatMap((r) => (r.stuckPicker ? [r.stuckPicker] : []));
    const gold = [...this.hopper.gold, ...pickers];
    this.sluice.lost.push(...gold);
    this.hopper = emptyHopper();
    this.jammed = false;
    return gold.length;
  }

  /** High water on a gravel bar: the hopper is swept, the box stripped, and the pump loses prime. */
  floodHit(): void {
    this.emptyHopper();
    this.sluice.floodHit();
    this.primed = false;
  }

  step(dt: number, throttle: number): HighbankerStepEvents {
    const T = HIGHBANKER_TUNING;
    const rng = this.rng;
    const t = Math.min(1, Math.max(0, throttle));
    let event: EngineEvent = null;

    if (this.running) {
      this.fuel = Math.max(0, this.fuel - dt * (T.idleBurn + (1 - T.idleBurn) * t));
      if (this.fuel <= 0) {
        this.running = false;
        event = 'outOfFuel';
      }
    }
    const spraying = this.running && this.primed;

    // Heat: water through the pump carries it away; running dry, it climbs fast.
    if (this.running) this.heat += (spraying ? T.heatWorking * t * t * 2 - T.cool * (1 - t) : T.heatDry) * dt;
    else this.heat -= T.cool * dt;
    this.heat = Math.min(1, Math.max(0, this.heat));
    if (this.running && this.heat >= 1) {
      this.running = false;
      event = 'overheated';
    }
    // Running hours wear the engine, much faster run hot; worn out, it seizes.
    if (this.running) {
      this.engineWear += dt * WEAR_TUNING.enginePerSecond * (0.4 + 0.6 * t) * (1 + WEAR_TUNING.hotStress * this.heat);
      if (this.seized) {
        this.running = false;
        event = 'seized';
      }
    }

    // The hose shifts and sucks air, more often pumping hard.
    if (spraying && rng.next() < T.losePrime * (0.3 + 0.7 * t) * dt) {
      this.primed = false;
      event = 'lostPrime';
    }

    // The spray washes the hopper down the grizzly: fines through to the sluice, rocks off the end.
    let passed = 0;
    let rocksOff = 0;
    if (spraying && !this.jammed && !this.rinsing) {
      const held = this.hopperVolume;
      // The hopper meters the feed: it only passes what the header can take without backing up.
      const room = this.sluice.feedBlocked ? 0 : Math.max(0, this.sluice.headerCapacity * 0.8 - this.sluice.headerVolume);
      const amount = Math.min(held, T.passRate * t * dt, room);
      if (amount > 0 && held > 0) {
        const share = amount / held;
        const moved = {
          light: this.hopper.light * share,
          black: this.hopper.black * share,
          clay: this.hopper.clay * share,
          gold: [] as GoldPiece[],
        };
        this.hopper.light -= moved.light;
        this.hopper.black -= moved.black;
        this.hopper.clay -= moved.clay;
        this.hopper.gold = this.hopper.gold.filter((piece) => {
          if (share < 1 && rng.next() >= share) return true;
          moved.gold.push(piece);
          return false;
        });
        this.sluice.feedScreened(moved);
        passed = amount;
      }
      this.hopper.rocks = this.hopper.rocks.filter((rock) => {
        if (rng.next() >= T.rockRoll * t * dt) return true;
        if (rock.stuckPicker) this.sluice.lost.push(rock.stuckPicker);
        rocksOff += 1;
        return false;
      });
      if (this.hopper.rocks.length > 0 && rng.next() < T.jamPerRock * this.hopper.rocks.length * t * dt) {
        this.jammed = true;
        event = 'jammed';
      }
    }

    const sluice = this.sluice.step(dt, { flow: spraying ? t : 0 });
    return { sluice, spraying, passed, rocksOff, event };
  }
}

function emptyHopper(): Hopper {
  return { light: 0, black: 0, clay: 0, rocks: [], gold: [] };
}
