import type { Creek, DigSpot } from './creek';
import { Drywasher, type DrywasherSnapshot } from './drywasher';
import type { Economy } from './economy';
import { Highbanker, type HighbankerSnapshot } from './highbanker';
import { Pan, rollShovelful, type GoldPiece, type PanLoad, type PanSnapshot } from './pan';
import type { PanningSession } from './panningSession';
import type { Region } from './region';
import type { Rng } from './rng';
import { Rocker, type RockerSnapshot } from './rocker';
import { siteAllows, topLayerPays, traitsOf } from './sites';
import { Sluice, bareKit, needsPump, type SluiceSnapshot } from './sluice';

/**
 * What a crew does at one site, job by job (see "Staffing System" in the design doc).
 *
 * Every job drives the same simulation the player does, only slower and less attentive: a hand
 * digs from the nearest ground, tosses topsoil, feeds at a cautious pace, rakes and clears late,
 * cleans out on a fixed schedule, pans with a heavier hand. So the player stays the better
 * operator, and staff buy time, not output. Machine concentrate goes into the site's crew bucket
 * and panned gold into the crew's poke, both waiting for the player to collect. Nothing here needs
 * a screen.
 */

export type JobKind = 'sluice' | 'highbanker' | 'rocker' | 'drywasher' | 'pan' | 'screen' | 'haul' | 'prospect' | 'finish';

export const JOB_KINDS: readonly JobKind[] = ['sluice', 'highbanker', 'rocker', 'drywasher', 'pan', 'screen', 'haul', 'prospect', 'finish'];

/** Machines a crew can own: extra units bought for the crew, separate from the player's own. */
export type CrewMachine = 'sluice' | 'highbanker' | 'rocker' | 'drywasher' | 'classifier';

/** Why a job isn't getting done. */
export type JobIdle = 'noMachine' | 'noSite' | 'noWater' | 'workedOut' | 'bucketFull' | 'noFuel' | 'nothingToFinish' | 'groundReady';

/**
 * A site-level crew policy (see "Crew policies" in the design doc): one setting for how the whole
 * crew at a stretch works, never per-worker orders. Each changes how they drive the same machines
 * the player does, so each has a cost:
 *
 * - Steady: the default pace and care.
 * - Careful (conserve the claim): slower feeding, gentler water and a lighter tip, cleanouts and
 *   fixes sooner. Less ground a day, less gold lost from it.
 * - Push hard (extract aggressively): quicker feeding, harder water, a heavier tip, cleanouts and
 *   fixes put off. More ground a day, more gold washed away with it.
 * - Prepare the ground (maintain and prepare): no washing at all. The diggers strip topsoil and
 *   slumped bank, pry boulders and bail holes, so the player comes back to open pay gravel.
 */
export type CrewPolicy = 'steady' | 'careful' | 'push' | 'prepare';

export const CREW_POLICIES: readonly CrewPolicy[] = ['steady', 'careful', 'push', 'prepare'];

export interface PolicyTuning {
  /** Multiplies time per dig, toss, pry and bail. */
  readonly pace: number;
  /** Sluice water power aimed for, highbanker throttle, drywasher air. */
  readonly targetPower: number;
  readonly throttle: number;
  readonly air: number;
  /** Multiplies loads between cleanouts, and how full a rocker apron or drywasher drawer gets. */
  readonly cleanEvery: number;
  /** Multiplies how long trouble (a clog, a jam, dust) goes unseen. */
  readonly fixDelay: number;
  /** Pan tilt while washing, and a multiplier on the rest between pans. */
  readonly panTilt: number;
  readonly panRest: number;
  /** Multiplies the time between rocker strokes. */
  readonly rockerBeat: number;
  /** A rough guess at recovery against steady, for estimates only. */
  readonly recoveryGuess: number;
  /** How far off a hand sets the sluice's water from what they aim for. */
  readonly flowNoise: number;
}

export const POLICY_TUNING: Record<CrewPolicy, PolicyTuning> = {
  steady: { pace: 1, targetPower: 0.45, throttle: 0.6, air: 0.55, cleanEvery: 1, fixDelay: 1, panTilt: 0.42, panRest: 1, rockerBeat: 1, recoveryGuess: 1, flowNoise: 0.08 },
  careful: { pace: 1.35, targetPower: 0.38, throttle: 0.5, air: 0.5, cleanEvery: 0.6, fixDelay: 0.4, panTilt: 0.34, panRest: 1.3, rockerBeat: 1.3, recoveryGuess: 1.15, flowNoise: 0.08 },
  push: { pace: 0.7, targetPower: 0.5, throttle: 0.75, air: 0.62, cleanEvery: 1.15, fixDelay: 1.2, panTilt: 0.48, panRest: 0.5, rockerBeat: 0.8, recoveryGuess: 0.9, flowNoise: 0.08 },
  prepare: { pace: 1, targetPower: 0.45, throttle: 0.6, air: 0.55, cleanEvery: 1, fixDelay: 1, panTilt: 0.42, panRest: 1, rockerBeat: 1, recoveryGuess: 0, flowNoise: 0.08 },
};

export const CREW_TUNING = {
  /** Seconds to dig, carry and feed a load, plus hauling per creek length. */
  feedTime: 5,
  haulPerLength: 8,
  tossTime: 5,
  pryTime: 4,
  bailTime: 3,
  /** A hauler on site makes every carry and fetch take this share of the time. */
  haulBoost: 0.7,
  rakeDelay: 3,
  cleanoutEvery: 8,
  rinse: 4,
  /** Sluice: the water power a hand aims for, and how far off they set it. */
  targetPower: 0.45,
  flowNoise: 0.08,
  /** Highbanker: a steady throttle, and how long a hand takes to notice and fix trouble. */
  throttle: 0.6,
  primeTime: 3,
  jamDelay: 4,
  /** Rocker: a hand's beat, and the water they keep in the box. */
  rockerBeat: 1.1,
  rockerWater: 0.35,
  fetchSlowdown: 1.3,
  /** Drywasher: air gate, and how late the dust and the screen get seen to. */
  air: 0.55,
  dustAt: 0.25,
  clogAt: 0.5,
  /** Panning: a heavier tip than a careful player, a rest between pans. */
  panTilt: 0.42,
  panRest: 20,
  finishTilt: 0.3,
  finishPour: 0.25,
  panGiveUp: 150,
  /** Prospecting: a gully test pan, and how often wandering turns up something. */
  testPan: 60,
  leadEvery: 400,
  leadChance: 0.5,
  /** The crew bucket holds about five mats. */
  bucketCapacity: 4,
  step: 0.05,
} as const;

export interface SiteReport {
  seconds: number;
  shovelfuls: number;
  pans: number;
  cleanouts: number;
  leads: string[];
}

/** Everything a job remembers between steps. Plain data, so it saves. */
export interface JobState {
  timer: number;
  sinceClean: number;
  rinsing: number | null;
  clogTime: number;
  flow: number;
  fetching: number | null;
  pan: PanSnapshot | null;
  rest: number;
  wander: number;
  target: number | null;
}

function freshState(): JobState {
  return { timer: 0, sinceClean: 0, rinsing: null, clogTime: 0, flow: 0.7, fetching: null, pan: null, rest: 0, wander: 0, target: null };
}

export interface SiteCrewSnapshot {
  readonly creekId: number;
  readonly jobs: readonly JobKind[];
  readonly policy: CrewPolicy;
  readonly bucket: { readonly blackSand: number; readonly gold: readonly GoldPiece[] };
  readonly poke: readonly GoldPiece[];
  readonly report: SiteReport;
  readonly prospected: readonly number[];
  readonly states: Partial<Record<JobKind, JobState>>;
  readonly idle: Partial<Record<JobKind, JobIdle | null>>;
  readonly machines: {
    readonly sluice: { readonly spotId: number; readonly state: SluiceSnapshot } | null;
    readonly highbanker: { readonly spotId: number; readonly state: HighbankerSnapshot } | null;
    readonly rocker: RockerSnapshot | null;
    readonly drywasher: DrywasherSnapshot | null;
    readonly classifier: boolean;
  };
}

export function emptyReport(): SiteReport {
  return { seconds: 0, shovelfuls: 0, pans: 0, cleanouts: 0, leads: [] };
}

/** One site's crew operation: its job list, the crew's own machines there, and what they've produced. */
export class SiteCrew {
  readonly creekId: number;
  jobs: JobKind[] = [];
  policy: CrewPolicy = 'steady';
  readonly bucket: { blackSand: number; gold: GoldPiece[] } = { blackSand: 0, gold: [] };
  poke: GoldPiece[] = [];
  report: SiteReport = emptyReport();
  prospected: number[] = [];
  readonly states: Partial<Record<JobKind, JobState>> = {};
  readonly idle: Partial<Record<JobKind, JobIdle | null>> = {};
  crewSluice: { spotId: number; sluice: Sluice } | null = null;
  crewHighbanker: { spotId: number; machine: Highbanker } | null = null;
  rocker: Rocker | null = null;
  drywasher: Drywasher | null = null;
  classifier = false;
  /** Pans a hand has on the go, rebuilt from the saved state as needed. */
  private readonly pans = new Map<JobKind, Pan>();

  constructor(
    private readonly rng: Rng,
    creekId: number,
    saved?: SiteCrewSnapshot,
  ) {
    this.creekId = creekId;
    if (!saved) return;
    const copy = structuredClone(saved) as SiteCrewSnapshot;
    this.jobs = [...copy.jobs];
    this.policy = CREW_POLICIES.includes(copy.policy) ? copy.policy : 'steady';
    this.bucket.blackSand = copy.bucket.blackSand;
    this.bucket.gold.push(...copy.bucket.gold);
    this.poke = [...copy.poke];
    this.report = { ...copy.report, leads: [...copy.report.leads] };
    this.prospected = [...copy.prospected];
    Object.assign(this.states, copy.states);
    Object.assign(this.idle, copy.idle);
    const m = copy.machines;
    if (m.sluice) this.crewSluice = { spotId: m.sluice.spotId, sluice: new Sluice(rng, m.sluice.state.site, m.sluice.state, bareKit()) };
    if (m.highbanker) this.crewHighbanker = { spotId: m.highbanker.spotId, machine: new Highbanker(rng, m.highbanker.state) };
    if (m.rocker) this.rocker = new Rocker(rng, m.rocker);
    if (m.drywasher) this.drywasher = new Drywasher(rng, m.drywasher);
    this.classifier = m.classifier;
  }

  snapshot(): SiteCrewSnapshot {
    for (const [kind, pan] of this.pans) this.state(kind).pan = pan.snapshot();
    return structuredClone({
      creekId: this.creekId,
      jobs: this.jobs,
      policy: this.policy,
      bucket: this.bucket,
      poke: this.poke,
      report: this.report,
      prospected: this.prospected,
      states: this.states,
      idle: this.idle,
      machines: {
        sluice: this.crewSluice ? { spotId: this.crewSluice.spotId, state: this.crewSluice.sluice.snapshot() } : null,
        highbanker: this.crewHighbanker ? { spotId: this.crewHighbanker.spotId, state: this.crewHighbanker.machine.snapshot() } : null,
        rocker: this.rocker?.snapshot() ?? null,
        drywasher: this.drywasher?.snapshot() ?? null,
        classifier: this.classifier,
      },
    });
  }

  state(kind: JobKind): JobState {
    return (this.states[kind] ??= freshState());
  }

  /** The pan a hand has going for a job, if any. */
  panFor(kind: JobKind): Pan | null {
    const existing = this.pans.get(kind);
    if (existing) return existing;
    const saved = this.state(kind).pan;
    if (!saved) return null;
    const pan = Pan.restore(this.rng, saved);
    this.pans.set(kind, pan);
    return pan;
  }

  setPan(kind: JobKind, pan: Pan | null): void {
    if (pan) this.pans.set(kind, pan);
    else this.pans.delete(kind);
    this.state(kind).pan = pan ? pan.snapshot() : null;
  }

  /** Put concentrate in the crew bucket. Refused (false) if it won't fit. */
  addToBucket(blackSand: number, gold: readonly GoldPiece[]): boolean {
    if (this.bucket.blackSand + blackSand > CREW_TUNING.bucketCapacity + 1e-9) return false;
    this.bucket.blackSand += blackSand;
    this.bucket.gold.push(...gold);
    return true;
  }

  get bucketFull(): boolean {
    return this.bucket.blackSand >= CREW_TUNING.bucketCapacity - 0.05;
  }

  takeReport(): SiteReport {
    const report = this.report;
    this.report = emptyReport();
    return report;
  }
}

/** What a job needs to run at one site. */
export interface JobContext {
  readonly rng: Rng;
  readonly creek: Creek;
  readonly site: SiteCrew;
  readonly session: PanningSession;
  readonly region: Region;
  readonly economy: Economy;
  /** Multiplier on carry and fetch times: less than 1 with a hauler on site. */
  readonly boost: number;
  /** A hand on the classifier screens every load: no rocks reach the machines. */
  readonly screened: boolean;
  /** How the site's policy has them work. */
  readonly policy: PolicyTuning;
  /** Prepare the ground instead of washing it. */
  readonly preparing: boolean;
  /** A foreman on site digs where the player's field notes say the gold is. */
  readonly byNotes: boolean;
}

/** The crew machine a job needs, if the player's own isn't set up here. */
export function machineFor(job: JobKind): CrewMachine | null {
  if (job === 'sluice' || job === 'highbanker' || job === 'rocker' || job === 'drywasher') return job;
  if (job === 'screen') return 'classifier';
  return null;
}

/** Whether the ground can host a job at all. */
export function jobFits(job: JobKind, creek: Creek): boolean {
  const site = creek.profile.site;
  switch (job) {
    case 'sluice':
      return creek.sluiceSpots.some((s) => !needsPump(s.sluiceSite!));
    case 'highbanker':
      return siteAllows(site, 'highbanker');
    case 'rocker':
      return siteAllows(site, 'rocker');
    case 'drywasher':
      return siteAllows(site, 'drywasher');
    case 'screen':
      return siteAllows(site, 'classifier');
    case 'pan':
    case 'finish':
      return siteAllows(site, 'pan');
    case 'haul':
    case 'prospect':
      return true;
  }
}

/** The sluice a crew can run here: the player's if it's set up at this stretch, else the crew's own. */
export function sluiceFor(ctx: JobContext): { sluice: Sluice; spot: DigSpot } | null {
  const place = ctx.session.sluicePlace;
  if (place?.creekId === ctx.creek.id) {
    const sluice = ctx.session.sluiceAt(place.creekId, place.spotId);
    if (sluice) return { sluice, spot: ctx.creek.spot(place.spotId) };
  }
  const own = ctx.site.crewSluice;
  return own ? { sluice: own.sluice, spot: ctx.creek.spot(own.spotId) } : null;
}

export function highbankerFor(ctx: JobContext): { machine: Highbanker; spot: DigSpot } | null {
  const place = ctx.session.highbankerPlace;
  if (place?.creekId === ctx.creek.id) {
    const machine = ctx.session.highbankerAt(place.creekId, place.spotId);
    if (machine) return { machine, spot: ctx.creek.spot(place.spotId) };
  }
  const own = ctx.site.crewHighbanker;
  return own ? { machine: own.machine, spot: ctx.creek.spot(own.spotId) } : null;
}

/**
 * Set a crew machine up at the site, from a spare. Returns false if there's nowhere to put it
 * (no free sluice site, no room for a highbanker).
 */
export function installMachine(site: SiteCrew, machine: CrewMachine, creek: Creek, session: PanningSession, rng: Rng): boolean {
  const taken = new Set<number>();
  const sp = session.sluicePlace;
  const hp = session.highbankerPlace;
  if (sp?.creekId === creek.id) taken.add(sp.spotId);
  if (hp?.creekId === creek.id) taken.add(hp.spotId);
  if (site.crewSluice) taken.add(site.crewSluice.spotId);
  if (site.crewHighbanker) taken.add(site.crewHighbanker.spotId);
  switch (machine) {
    case 'sluice': {
      const spot = creek.sluiceSpots.find((s) => !needsPump(s.sluiceSite!) && !taken.has(s.id));
      if (!spot) return false;
      site.crewSluice = { spotId: spot.id, sluice: new Sluice(rng, spot.sluiceSite!, undefined, bareKit()) };
      return true;
    }
    case 'highbanker': {
      const spot = creek.creekSpots.find((s) => !taken.has(s.id));
      if (!spot) return false;
      site.crewHighbanker = { spotId: spot.id, machine: new Highbanker(rng) };
      return true;
    }
    case 'rocker':
      site.rocker = new Rocker(rng);
      return true;
    case 'drywasher':
      site.drywasher = new Drywasher(rng);
      return true;
    case 'classifier':
      site.classifier = true;
      return true;
  }
}

/** Take a crew machine back to spare, washing what it held into the crew bucket. */
export function removeMachine(site: SiteCrew, machine: CrewMachine): boolean {
  switch (machine) {
    case 'sluice': {
      const own = site.crewSluice;
      if (!own) return false;
      own.sluice.emptyHeader();
      const mat = own.sluice.liftMat();
      site.bucket.blackSand += mat.blackSand;
      site.bucket.gold.push(...mat.gold);
      site.crewSluice = null;
      return true;
    }
    case 'highbanker': {
      const own = site.crewHighbanker;
      if (!own) return false;
      own.machine.emptyHopper();
      own.machine.sluice.emptyHeader();
      const mat = own.machine.sluice.liftMat();
      site.bucket.blackSand += mat.blackSand;
      site.bucket.gold.push(...mat.gold);
      site.crewHighbanker = null;
      return true;
    }
    case 'rocker': {
      if (!site.rocker) return false;
      site.rocker.tipOff();
      const c = site.rocker.cleanUp();
      site.bucket.blackSand += c.blackSand;
      site.bucket.gold.push(...c.gold);
      site.rocker = null;
      return true;
    }
    case 'drywasher': {
      if (!site.drywasher) return false;
      site.drywasher.tipOff();
      const c = site.drywasher.pullDrawer();
      site.bucket.blackSand += c.blackSand;
      site.bucket.gold.push(...c.gold);
      site.drywasher = null;
      return true;
    }
    case 'classifier':
      if (!site.classifier) return false;
      site.classifier = false;
      return true;
  }
}

/** Whether the machine a job needs is at the site (the player's own counts for the sluice and highbanker). */
export function hasMachine(ctx: JobContext, job: JobKind): boolean {
  switch (job) {
    case 'sluice':
      return sluiceFor(ctx) !== null;
    case 'highbanker':
      return highbankerFor(ctx) !== null;
    case 'rocker':
      return ctx.site.rocker !== null;
    case 'drywasher':
      return ctx.site.drywasher !== null;
    case 'screen':
      return ctx.site.classifier;
    default:
      return true;
  }
}

// ---- digging, shared by every job that moves gravel ----

type Dug = { readonly load: PanLoad | null; readonly time: number };

/**
 * One action at the nearest spot along the stretch with ground left, starting near `near` (0..1
 * along the creek): pry a boulder, bail a flooded hole, toss topsoil or slumped bank, or dig a load
 * of gravel. Returns null when the stretch is worked out.
 */
function dig(ctx: JobContext, near: number): Dug | null {
  const T = CREW_TUNING;
  const { creek } = ctx;
  const open = creek.creekSpots.filter((s) => !creek.isWorkedOut(s));
  // A foreman sends them where the player's notes say the colour is (unnoted ground counts as
  // average); without one they dig whatever's nearest.
  const spot = ctx.byNotes ? byNotes(open, near) : open.sort((a, b) => Math.abs(a.position - near) - Math.abs(b.position - near))[0];
  if (!spot) return null;
  const blocked = creek.blockedBy(spot);
  const pace = ctx.boost * ctx.policy.pace;
  if (blocked === 'boulder') {
    creek.pry(spot.id);
    return { load: null, time: T.pryTime * pace };
  }
  if (blocked === 'flooded') {
    creek.bail(spot.id);
    return { load: null, time: T.bailTime * pace };
  }
  if (needsClearing(creek, spot)) {
    const tossed = creek.shovel(spot.id, 'spoil');
    if (tossed.ok && tossed.clue) clue(ctx);
    return { load: null, time: T.tossTime * pace };
  }
  const result = creek.shovel(spot.id, 'pan');
  if (!result.ok || !result.load) return { load: null, time: 1 };
  if (result.clue) clue(ctx);
  ctx.site.report.shovelfuls += 1;
  return { load: result.load, time: (T.feedTime + T.haulPerLength * Math.abs(spot.position - near)) * pace };
}

/** The spot with the best colour per pan in the player's notes, nearest first among equals. */
function byNotes(spots: DigSpot[], near: number): DigSpot | undefined {
  const noted = spots.filter((s) => s.notes && s.notes.pans > 0);
  if (noted.length === 0) return spots.sort((a, b) => Math.abs(a.position - near) - Math.abs(b.position - near))[0];
  const average = noted.reduce((n, s) => n + s.notes!.mg / s.notes!.pans, 0) / noted.length;
  const score = (s: DigSpot): number => (s.notes && s.notes.pans > 0 ? s.notes.mg / s.notes.pans : average) - Math.abs(s.position - near) * 0.01;
  return spots.sort((a, b) => score(b) - score(a))[0];
}

/** Slumped bank or topsoil in the way: tossed aside, not washed (old tailings, though, are washed). */
function needsClearing(creek: Creek, spot: DigSpot): boolean {
  return spot.slumped > 0 || (creek.currentLayer(spot)?.kind === 'overburden' && !topLayerPays(creek.profile.site));
}

/**
 * Preparing the ground: one piece of clearing work at the next spot that needs it (a boulder, a
 * flooded hole, slumped bank or topsoil), so the pay gravel lies open. Null when it all does.
 */
function prepare(ctx: JobContext): number | null {
  const T = CREW_TUNING;
  const { creek } = ctx;
  const pace = ctx.boost * ctx.policy.pace;
  const spot = creek.creekSpots.find((s) => !creek.isWorkedOut(s) && (creek.blockedBy(s) !== null || needsClearing(creek, s)));
  if (!spot) return null;
  const blocked = creek.blockedBy(spot);
  if (blocked === 'boulder') {
    creek.pry(spot.id);
    return T.pryTime * pace;
  }
  if (blocked === 'flooded') {
    creek.bail(spot.id);
    return T.bailTime * pace;
  }
  const tossed = creek.shovel(spot.id, 'spoil');
  if (tossed.ok && tossed.clue) clue(ctx);
  return T.tossTime * pace;
}

function runPrepare(job: JobKind, dt: number, ctx: JobContext): JobIdle | null {
  const st = ctx.site.state(job);
  st.timer -= dt;
  if (st.timer > 0) return null;
  const time = prepare(ctx);
  if (time === null) return 'groundReady';
  st.timer = time;
  return null;
}

function clue(ctx: JobContext): void {
  ctx.site.report.leads.push(ctx.region.clueFound().name);
}

/**
 * A load ready for a machine: straight, or screened by a hand on the classifier, who picks any
 * picker out of the rocks into the crew's poke.
 */
function screen(ctx: JobContext, load: PanLoad): { light: number; black: number; clay: number; gold: GoldPiece[] } | null {
  if (!ctx.screened) return null;
  const s = rollShovelful(ctx.rng, load);
  for (const rock of s.rocks) if (rock.stuckPicker) ctx.site.poke.push(rock.stuckPicker);
  return { light: s.lightSand, black: s.blackSand, clay: s.clay, gold: s.gold };
}

// ---- the jobs ----

/** Run one staffed job for a slice of time. Returns why it's idle, or null while it works. */
export function runJob(job: JobKind, dt: number, ctx: JobContext): JobIdle | null {
  if (ctx.preparing && DIGGING_JOBS.includes(job)) return runPrepare(job, dt, ctx);
  switch (job) {
    case 'sluice':
      return runSluice(dt, ctx);
    case 'highbanker':
      return runHighbanker(dt, ctx);
    case 'rocker':
      return runRocker(dt, ctx);
    case 'drywasher':
      return runDrywasher(dt, ctx);
    case 'pan':
      return runPan(dt, ctx);
    case 'finish':
      return runFinish(dt, ctx);
    case 'prospect':
      return runProspect(dt, ctx);
    case 'screen':
      return ctx.site.classifier ? null : 'noMachine';
    case 'haul':
      return null;
  }
}

function runSluice(dt: number, ctx: JobContext): JobIdle | null {
  const T = CREW_TUNING;
  const found = sluiceFor(ctx);
  if (!found) return 'noMachine';
  const { sluice, spot } = found;
  const st = ctx.site.state('sluice');

  // Keep a pumped sluice fuelled from the player's cans.
  const pump = sluice.usesPump ? sluice.kit.pump : null;
  if (pump && pump.fuel <= 0) {
    if (ctx.session.fuelCans <= 0) return 'noFuel';
    ctx.session.refuelPump();
    st.timer = Math.max(st.timer, 4);
  }
  if (st.timer <= 0 && st.rinsing === null) {
    const full = sluice.power({ flow: 1 });
    if (full > 0) st.flow = Math.min(1, Math.max(0.1, ctx.policy.targetPower / full + (ctx.rng.next() * 2 - 1) * ctx.policy.flowNoise));
  }
  sluice.step(dt, { flow: st.flow });
  st.clogTime = sluice.clog > 0.5 ? st.clogTime + dt : 0;
  if (st.clogTime >= T.rakeDelay * ctx.policy.fixDelay) {
    sluice.rake();
    st.clogTime = 0;
  }
  if (st.rinsing !== null) {
    st.rinsing -= dt;
    if (st.rinsing > 0) return null;
    if (!ctx.site.addToBucket(sluice.matVolume, [])) {
      st.rinsing = 0;
      return 'bucketFull';
    }
    // The volume went in above; now the gold that was in the mat.
    ctx.site.bucket.gold.push(...sluice.liftMat().gold);
    st.rinsing = null;
    st.sinceClean = 0;
    ctx.site.report.cleanouts += 1;
    return null;
  }
  st.timer -= dt;
  if (st.timer > 0) return null;
  const headerClear = sluice.headerVolume < 0.05;
  const due = st.sinceClean >= T.cleanoutEvery * ctx.policy.cleanEvery;
  if (headerClear && st.sinceClean > 0 && due) {
    st.rinsing = T.rinse;
    return null;
  }
  if (sluice.feedBlocked) {
    st.timer = 1;
    return null;
  }
  const dug = dig(ctx, spot.position);
  if (!dug) {
    if (headerClear && st.sinceClean > 0) {
      st.rinsing = T.rinse;
      return null;
    }
    return headerClear ? 'workedOut' : null;
  }
  st.timer = dug.time;
  if (dug.load) {
    const screened = screen(ctx, dug.load);
    if (screened) sluice.feedScreened(screened);
    else sluice.feed(dug.load);
    st.sinceClean += 1;
  }
  return null;
}

function runHighbanker(dt: number, ctx: JobContext): JobIdle | null {
  const T = CREW_TUNING;
  const found = highbankerFor(ctx);
  if (!found) return 'noMachine';
  const { machine: hb, spot } = found;
  const st = ctx.site.state('highbanker');

  if (hb.fuel <= 0 && !hb.running) {
    if (ctx.session.fuelCans <= 0) return 'noFuel';
    ctx.session.fuelCans -= 1;
    hb.refuel();
    st.timer = Math.max(st.timer, 4);
  }
  // Prime when it's lost prime; start it when it's cool enough; clear jams and clogs, late.
  if (!hb.primed) {
    st.clogTime += dt;
    if (st.clogTime >= T.primeTime * ctx.policy.fixDelay) {
      hb.prime();
      st.clogTime = 0;
    }
  } else if (hb.jammed || hb.sluice.clog > 0.5) {
    st.clogTime += dt;
    if (st.clogTime >= T.jamDelay * ctx.policy.fixDelay) {
      if (hb.jammed) hb.clearGrizzly();
      else hb.sluice.rake();
      st.clogTime = 0;
    }
  } else {
    st.clogTime = 0;
  }
  if (!hb.running && !hb.tooHot && hb.fuel > 0) hb.start();
  hb.step(dt, ctx.policy.throttle);

  if (st.rinsing !== null) {
    hb.rinsing = true;
    st.rinsing -= dt;
    if (st.rinsing > 0) return null;
    const mat = hb.sluice.matVolume;
    if (!ctx.site.addToBucket(mat, hb.sluice.liftMat().gold)) {
      st.rinsing = 0;
      return 'bucketFull';
    }
    hb.rinsing = false;
    st.rinsing = null;
    st.sinceClean = 0;
    ctx.site.report.cleanouts += 1;
    return null;
  }
  st.timer -= dt;
  if (st.timer > 0) return null;
  const idle = hb.hopperVolume < 0.01 && hb.sluice.headerVolume < 0.05;
  if (idle && st.sinceClean >= (T.cleanoutEvery + 2) * ctx.policy.cleanEvery) {
    st.rinsing = T.rinse;
    return null;
  }
  if (hb.hopperVolume > 1 || hb.rinsing) {
    st.timer = 0.5;
    return null;
  }
  const dug = dig(ctx, spot.position);
  if (!dug) {
    if (idle && st.sinceClean > 0) {
      st.rinsing = T.rinse;
      return null;
    }
    if (idle) {
      hb.stop();
      return 'workedOut';
    }
    return null;
  }
  st.timer = dug.time;
  if (dug.load) {
    const screened = screen(ctx, dug.load);
    if (screened) hb.feedScreened(screened);
    else hb.feed(dug.load);
    st.sinceClean += 1;
  }
  return null;
}

function runRocker(dt: number, ctx: JobContext): JobIdle | null {
  const T = CREW_TUNING;
  const rocker = ctx.site.rocker;
  if (!rocker) return 'noMachine';
  const st = ctx.site.state('rocker');
  rocker.step(dt);
  if (st.fetching !== null) {
    st.fetching -= dt;
    if (st.fetching > 0) return null;
    st.fetching = null;
    rocker.fillBucket();
  }
  if (rocker.apronLoading > Math.min(0.9, 0.6 * ctx.policy.cleanEvery)) {
    const volume = rocker.apronVolume;
    if (!ctx.site.addToBucket(volume, [])) return 'bucketFull';
    ctx.site.bucket.gold.push(...rocker.cleanUp().gold);
    ctx.site.report.cleanouts += 1;
  }
  if (rocker.water < T.rockerWater && rocker.hasLoad) {
    if (!rocker.ladle()) {
      st.fetching = traitsOf(ctx.creek.profile.site).fetchSeconds * T.fetchSlowdown * ctx.boost;
      return null;
    }
  }
  st.rest -= dt;
  if (st.rest <= 0 && rocker.hopperVolume > 0.01) {
    rocker.rock();
    st.rest = T.rockerBeat * ctx.policy.rockerBeat;
  }
  st.timer -= dt;
  if (st.timer > 0) return null;
  if (rocker.screened) rocker.tipOff();
  if (rocker.hopperVolume > 0.15) return null;
  const dug = dig(ctx, 0.5);
  if (!dug) {
    if (rocker.hasLoad) return null;
    if (rocker.apronVolume > 0.001 && ctx.site.addToBucket(rocker.apronVolume, [])) {
      ctx.site.bucket.gold.push(...rocker.cleanUp().gold);
      ctx.site.report.cleanouts += 1;
    }
    return 'workedOut';
  }
  st.timer = dug.time;
  if (dug.load) {
    const screened = screen(ctx, dug.load);
    if (screened) rocker.feedScreened(screened);
    else rocker.feed(dug.load);
  }
  return null;
}

function runDrywasher(dt: number, ctx: JobContext): JobIdle | null {
  const T = CREW_TUNING;
  const dw = ctx.site.drywasher;
  if (!dw) return 'noMachine';
  const st = ctx.site.state('drywasher');
  dw.step(dt, dw.hopperVolume > 0.005, ctx.policy.air);
  // Dust and a blinded screen get seen to a little late.
  st.clogTime = dw.dust > T.dustAt || dw.screenClog > T.clogAt ? st.clogTime + dt : 0;
  if (st.clogTime > 3 * ctx.policy.fixDelay) {
    if (dw.dust > T.dustAt) dw.shakeOutDust();
    if (dw.screenClog > T.clogAt) dw.knockScreen();
    st.clogTime = 0;
  }
  if (dw.drawerLoading > Math.min(0.9, 0.6 * ctx.policy.cleanEvery)) {
    const volume = dw.drawerVolume;
    if (!ctx.site.addToBucket(volume, [])) return 'bucketFull';
    ctx.site.bucket.gold.push(...dw.pullDrawer().gold);
    ctx.site.report.cleanouts += 1;
  }
  st.timer -= dt;
  if (st.timer > 0) return null;
  if (dw.screened) dw.tipOff();
  if (dw.hopperVolume > 0.2) return null;
  const dug = dig(ctx, 0.5);
  if (!dug) {
    if (dw.hasLoad) return null;
    if (dw.drawerVolume > 0.001 && ctx.site.addToBucket(dw.drawerVolume, [])) {
      ctx.site.bucket.gold.push(...dw.pullDrawer().gold);
      ctx.site.report.cleanouts += 1;
    }
    return 'workedOut';
  }
  st.timer = dug.time;
  if (dug.load) {
    const screened = screen(ctx, dug.load);
    if (screened) dw.feedScreened(screened);
    else dw.feed(dug.load);
  }
  return null;
}

/**
 * A hand working a pan: settle it level, then wash with a heavier tip than a careful player, going
 * back to level whenever it gets too mixed. Returns true once it's done (worked down, or given up on).
 */
function workPan(pan: Pan, dt: number, tilt: number): boolean {
  const settled = pan.clay <= 0 && pan.stratification > 0.6;
  const mixed = pan.stratification < 0.45;
  pan.step(dt, { tilt: settled || (!mixed && pan.clay <= 0 && pan.elapsed > 3) ? tilt : 0, shake: 1 });
  return pan.workedDown || pan.siftedOut || pan.elapsed > CREW_TUNING.panGiveUp;
}

function runPan(dt: number, ctx: JobContext): JobIdle | null {
  const T = CREW_TUNING;
  if (!siteAllows(ctx.creek.profile.site, 'pan')) return 'noWater';
  const st = ctx.site.state('pan');
  let pan = ctx.site.panFor('pan');
  if (st.rest > 0) {
    st.rest -= dt;
    return null;
  }
  if (!pan) {
    st.timer -= dt;
    if (st.timer > 0) return null;
    const dug = dig(ctx, 0.5);
    if (!dug) return 'workedOut';
    st.timer = dug.time;
    if (!dug.load) return null;
    const screened = screen(ctx, dug.load);
    pan = screened ? Pan.fromScreened(ctx.rng, screened) : new Pan(ctx.rng, dug.load);
    ctx.site.setPan('pan', pan);
    return null;
  }
  st.timer -= dt;
  if (st.timer > 0) return null;
  if (!workPan(pan, dt, ctx.policy.panTilt)) return null;
  pan.reveal();
  const keep = !pan.residueSpent && ctx.site.bucket.blackSand + pan.blackSand <= T.bucketCapacity;
  const { collected, toJar, blackSand } = pan.collect(keep);
  ctx.site.poke.push(...collected);
  if (keep) ctx.site.addToBucket(blackSand, toJar);
  ctx.site.setPan('pan', null);
  ctx.site.report.pans += 1;
  st.rest = T.panRest * ctx.policy.panRest * ctx.boost;
  return null;
}

function runFinish(dt: number, ctx: JobContext): JobIdle | null {
  const T = CREW_TUNING;
  if (!siteAllows(ctx.creek.profile.site, 'pan')) return 'noWater';
  const st = ctx.site.state('finish');
  let pan = ctx.site.panFor('finish');
  if (st.rest > 0) {
    st.rest -= dt;
    return null;
  }
  if (!pan) {
    const bucket = ctx.site.bucket;
    if (bucket.blackSand < 0.005) return 'nothingToFinish';
    const amount = Math.min(bucket.blackSand, T.finishPour);
    const share = amount / bucket.blackSand;
    const poured: GoldPiece[] = [];
    bucket.gold = bucket.gold.filter((piece) => {
      if (share < 1 && ctx.rng.next() >= share) return true;
      poured.push(piece);
      return false;
    });
    bucket.blackSand -= amount;
    if (bucket.blackSand < 1e-9) bucket.blackSand = 0;
    pan = new Pan(ctx.rng, { richness: 0, clayiness: 0, rockiness: 0 }, { blackSand: amount, gold: poured });
    ctx.site.setPan('finish', pan);
    return null;
  }
  if (!workPan(pan, dt, T.finishTilt)) return null;
  pan.reveal();
  const { collected, toJar, blackSand } = pan.collect(true);
  ctx.site.poke.push(...collected);
  // Unfinished black sand goes back in the bucket, gold still hidden in it.
  if (blackSand > 0 || toJar.length > 0) {
    ctx.site.bucket.blackSand += blackSand;
    ctx.site.bucket.gold.push(...toJar);
  }
  ctx.site.setPan('finish', null);
  ctx.site.report.pans += 1;
  st.rest = T.panRest * 0.5 * ctx.boost;
  return null;
}

function runProspect(dt: number, ctx: JobContext): JobIdle | null {
  const T = CREW_TUNING;
  const st = ctx.site.state('prospect');
  const { creek, site, region, economy } = ctx;
  if (st.target !== null) {
    st.timer -= dt;
    if (st.timer > 0) return null;
    const spot = creek.spots.find((s) => s.id === st.target);
    st.target = null;
    if (!spot) return null;
    site.prospected.push(spot.id);
    if (!creek.isWorkedOut(spot) && creek.blockedBy(spot) === null) creek.shovel(spot.id, 'spoil');
    const traced = region.traceGully(spot);
    if (traced?.found) {
      economy.stakeFound(region);
      site.report.leads.push(traced.creek.profile.name);
    }
    return null;
  }
  // Test-pan the gullies here first (where there's water to pan in), then roam further.
  const canPan = siteAllows(creek.profile.site, 'pan');
  const gully = canPan ? creek.gullySpots.find((s) => !site.prospected.includes(s.id) && !creek.isWorkedOut(s)) : undefined;
  if (gully) {
    st.target = gully.id;
    st.timer = T.testPan * ctx.boost;
    return null;
  }
  st.wander += dt;
  if (st.wander >= T.leadEvery) {
    st.wander = 0;
    if (ctx.rng.next() < T.leadChance) site.report.leads.push(region.clueFound().name);
  }
  return null;
}

/**
 * Roughly how many seconds a hand spends per load of gravel on each digging job: feeding a machine,
 * rocking and fetching water, or panning and resting between pans. Measured from the crew sim.
 */
const SECONDS_PER_LOAD: Partial<Record<JobKind, number>> = { sluice: 8, highbanker: 8, rocker: 25, drywasher: 10, pan: 60 };

/**
 * Roughly how many game days of digging a stretch has left, with these staffed jobs digging it
 * under this policy. Preparing the ground digs none of it away.
 */
export function crewDaysLeft(creek: Creek, jobs: readonly JobKind[], daySeconds: number, policy: CrewPolicy = 'steady'): number {
  const T = CREW_TUNING;
  if (policy === 'prepare') return Infinity;
  const pace = POLICY_TUNING[policy].pace;
  const diggers = jobs.filter((j) => SECONDS_PER_LOAD[j]);
  const loadsPerSecond = diggers.reduce((n, j) => n + 1 / (SECONDS_PER_LOAD[j]! * pace), 0);
  if (loadsPerSecond <= 0) return Infinity;
  const tossTop = !topLayerPays(creek.profile.site);
  let loads = 0;
  let tosses = 0;
  for (const spot of creek.creekSpots) {
    tosses += spot.slumped;
    for (const layer of spot.layers) {
      if (layer.kind === 'overburden' && tossTop) tosses += layer.loads;
      else loads += layer.loads;
    }
  }
  return (loads / loadsPerSecond + (tosses * T.tossTime * pace) / diggers.length) / daySeconds;
}

/** Jobs that dig from the stretch. */
export const DIGGING_JOBS: readonly JobKind[] = ['sluice', 'highbanker', 'rocker', 'drywasher', 'pan'];

