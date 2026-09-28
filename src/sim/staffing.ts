import type { Creek } from './creek';
import {
  CREW_POLICIES,
  CREW_TUNING,
  DIGGING_JOBS,
  POLICY_TUNING,
  SiteCrew,
  crewDaysLeft,
  emptyReport,
  hasMachine,
  installMachine,
  jobFits,
  machineFor,
  removeMachine,
  runJob,
  type CrewMachine,
  type CrewPolicy,
  type JobContext,
  type JobIdle,
  type JobKind,
  type SiteCrewSnapshot,
  type SiteReport,
} from './crewJobs';
import { ECONOMY_TUNING, payDebt, type Economy } from './economy';
import { estimateAround, type Estimate } from './estimate';
import { MARKET } from './market';
import type { GoldPiece } from './pan';
import type { PanningSession } from './panningSession';
import type { Region } from './region';
import type { Rng } from './rng';
import { traitsOf } from './sites';

/**
 * The crew (see "Staffing System" in the design doc): general hands the player hires, sends out to
 * their stretches, and sets to work with a site-level job list, not per-worker orders.
 *
 * Each site takes as many hands as the ground has room and work for (none at the Home Creek). The
 * site's hands fill its jobs in the order the player switched them on: running the sluice or the
 * highbanker (the player's own if it's set up there, else a crew unit), rocking, drywashing,
 * panning, screening loads through a classifier, hauling (which speeds everyone else up),
 * prospecting the gullies and country around for leads, and finishing the crew's concentrate.
 *
 * Machines the crew runs are crew units, bought separately at the outfitter and held as spares
 * until a job needs one. Wages run by the game day whether there is work or not, paid in town with
 * the claim fees. Crews work only while the player is somewhere else; the player is always the
 * better operator. Nothing here needs a screen.
 */

export type Role = 'hand' | 'operator';

/** Only operators run the powered and precision machines; hands do the rest. */
export const OPERATOR_JOBS: readonly JobKind[] = ['sluice', 'highbanker', 'drywasher'];

export const STAFF_TUNING = {
  /** Dollars per game day, by role. The first day is paid up front at hiring. */
  wage: { hand: 12, operator: 25 } as Record<Role, number>,
  /** Days of the crew's total wages owed before a hand walks off. */
  quitDays: 2,
  /** What a crew unit of each machine costs at the outfitter. */
  machinePrice: { sluice: 40, highbanker: 90, rocker: 20, drywasher: 45, classifier: 15 } as Record<CrewMachine, number>,
  /** Share of fed gold a hand keeps, for estimates only. */
  estimatedRecovery: 0.65,
} as const;

const NAMES = ['Abe', 'Clem', 'Dutch', 'Ezra', 'Hattie', 'Jonas', 'Lottie', 'Mose', 'Nell', 'Ruth', 'Silas', 'Tillie', 'Wes', 'Ada', 'Cyrus', 'Etta', 'Gus', 'Ida', 'Otis', 'Pearl'];

export interface Worker {
  readonly id: number;
  readonly name: string;
  /** A general hand, or an operator who can also run the machines. */
  readonly role: Role;
  readonly wage: number;
  /** The stretch they're working, or null waiting in town. */
  siteId: number | null;
}

export interface CrewSnapshot {
  readonly workers: readonly Worker[];
  readonly sites: readonly SiteCrewSnapshot[];
  readonly spares: Record<CrewMachine, number>;
  /** Negative while wages are paid ahead. */
  readonly wagesOwed: number;
  /** Concentrate and gold brought back to town from sites a crew left. */
  readonly returned: { readonly blackSand: number; readonly gold: readonly GoldPiece[] };
  readonly nextWorkerId: number;
}

/** Why a site's crew isn't working at all. */
export type SiteStop = 'playerHere' | 'claimLapsed';

/** What the crew needs from the game each time it works a site. */
export interface CrewWorld {
  readonly session: PanningSession;
  readonly region: Region;
  readonly economy: Economy;
  /** The stretch the player is at (their crew stands back while they work it), or null. */
  readonly playerAt: number | null;
}

export type HireResult = 'hired' | 'restricted' | 'cantAfford';
export type SendResult = 'sent' | 'noneFree' | 'homeCreek' | 'full' | 'claimLapsed';
export type JobToggle = 'on' | 'off' | 'doesntFit';

function noSpares(): Record<CrewMachine, number> {
  return { sluice: 0, highbanker: 0, rocker: 0, drywasher: 0, classifier: 0 };
}

export class Crew {
  workers: Worker[] = [];
  readonly sites: SiteCrew[] = [];
  spares: Record<CrewMachine, number> = noSpares();
  wagesOwed = 0;
  readonly returned: { blackSand: number; gold: GoldPiece[] } = { blackSand: 0, gold: [] };
  private nextWorkerId = 1;

  constructor(
    private readonly rng: Rng,
    saved?: CrewSnapshot,
  ) {
    if (!saved) return;
    const copy = structuredClone(saved) as CrewSnapshot;
    // Hands hired before roles were all paid an operator's wage: they are operators.
    this.workers = copy.workers.map((w) => ({ ...w, role: w.role ?? 'operator' }));
    for (const site of copy.sites) this.sites.push(new SiteCrew(rng, site.creekId, site));
    this.spares = { ...noSpares(), ...copy.spares };
    this.wagesOwed = copy.wagesOwed;
    this.returned.blackSand = copy.returned.blackSand;
    this.returned.gold.push(...copy.returned.gold);
    this.nextWorkerId = copy.nextWorkerId;
  }

  snapshot(): CrewSnapshot {
    return structuredClone({
      workers: this.workers,
      sites: this.sites.map((s) => s.snapshot()),
      spares: this.spares,
      wagesOwed: this.wagesOwed,
      returned: this.returned,
      nextWorkerId: this.nextWorkerId,
    });
  }

  /** Total wages a day for the whole crew. */
  get dailyWages(): number {
    return this.workers.reduce((n, w) => n + w.wage, 0);
  }

  /** More than a day's wages behind (or any owed with no crew left): expansion is restricted. */
  get wagesOverdue(): boolean {
    return this.wagesOwed > this.dailyWages;
  }

  workersAt(creekId: number): Worker[] {
    return this.workers.filter((w) => w.siteId === creekId);
  }

  get idleWorkers(): Worker[] {
    return this.workers.filter((w) => w.siteId === null);
  }

  idleOf(role: Role): Worker[] {
    return this.idleWorkers.filter((w) => w.role === role);
  }

  /** The crew operation at a stretch, set up the first time it's needed. */
  site(creekId: number): SiteCrew {
    let site = this.sites.find((s) => s.creekId === creekId);
    if (!site) {
      site = new SiteCrew(this.rng, creekId);
      this.sites.push(site);
    }
    return site;
  }

  findSite(creekId: number): SiteCrew | null {
    return this.sites.find((s) => s.creekId === creekId) ?? null;
  }

  /** Hire a hand or an operator, first day's wage up front. They wait in town until sent somewhere. */
  hire(session: PanningSession, restricted: boolean, role: Role = 'hand'): HireResult {
    if (restricted) return 'restricted';
    const wage = STAFF_TUNING.wage[role];
    if (session.cash < wage) return 'cantAfford';
    session.cash = Math.round((session.cash - wage) * 100) / 100;
    this.wagesOwed -= wage;
    const taken = new Set(this.workers.map((w) => w.name));
    const free = NAMES.filter((n) => !taken.has(n));
    const name = free.length > 0 ? free[this.rng.int(0, free.length - 1)]! : `${NAMES[this.rng.int(0, NAMES.length - 1)]} ${this.nextWorkerId}`;
    this.workers.push({ id: this.nextWorkerId++, name, role, wage, siteId: null });
    return 'hired';
  }

  /** Let a hand go. Wages already owed are still owed. */
  dismiss(workerId: number): Worker | null {
    const worker = this.workers.find((w) => w.id === workerId);
    if (!worker) return null;
    this.workers = this.workers.filter((w) => w !== worker);
    return worker;
  }

  /** Send someone waiting in town (of a role, if given) to a stretch, if it has room and can be worked. */
  send(creek: Creek, economy: Economy, homeCreekId: number, role?: Role): SendResult {
    if (creek.id === homeCreekId || creek.profile.site === 'homeCreek') return 'homeCreek';
    if (!economy.canWork(creek.id)) return 'claimLapsed';
    if (this.workersAt(creek.id).length >= traitsOf(creek.profile.site).crewMax) return 'full';
    const worker = role ? this.idleOf(role)[0] : this.idleWorkers[0];
    if (!worker) return 'noneFree';
    worker.siteId = creek.id;
    this.site(creek.id);
    return 'sent';
  }

  /** Bring the most recently sent hand at a stretch back to town. */
  recall(creekId: number): Worker | null {
    const here = this.workersAt(creekId);
    const worker = here[here.length - 1];
    if (!worker) return null;
    worker.siteId = null;
    return worker;
  }

  /**
   * Switch a job on or off at a stretch. Switching on puts it at the end of the list (the site's
   * hands fill jobs in order); switching off sends its crew machine back to spare, washing what
   * it held into the crew bucket.
   */
  toggleJob(creek: Creek, job: JobKind): JobToggle {
    const site = this.site(creek.id);
    if (site.jobs.includes(job)) {
      site.jobs = site.jobs.filter((j) => j !== job);
      delete site.idle[job];
      const machine = machineFor(job);
      if (machine && removeMachine(site, machine)) this.spares[machine] += 1;
      return 'off';
    }
    if (!jobFits(job, creek)) return 'doesntFit';
    site.jobs.push(job);
    return 'on';
  }

  /**
   * Pull the crew off a stretch (the claim is being given up): hands back to town, crew machines
   * back to spare, and the bucket and poke carried back to town for the player.
   */
  /** Set how the crew at a stretch works (see CrewPolicy). */
  setPolicy(creekId: number, policy: CrewPolicy): void {
    if (!CREW_POLICIES.includes(policy)) return;
    this.site(creekId).policy = policy;
  }

  /** The policy at a stretch: steady until the player says otherwise. */
  policyAt(creekId: number): CrewPolicy {
    return this.findSite(creekId)?.policy ?? 'steady';
  }

  closeSite(creekId: number): void {
    for (const worker of this.workersAt(creekId)) worker.siteId = null;
    const index = this.sites.findIndex((s) => s.creekId === creekId);
    if (index < 0) return;
    const site = this.sites[index]!;
    for (const machine of ['sluice', 'highbanker', 'rocker', 'drywasher', 'classifier'] as const) {
      if (removeMachine(site, machine)) this.spares[machine] += 1;
    }
    this.returned.blackSand += site.bucket.blackSand;
    this.returned.gold.push(...site.bucket.gold, ...site.poke);
    this.sites.splice(index, 1);
  }

  /**
   * Jobs at a stretch that have someone on them, in list order. Operator jobs take an operator;
   * other jobs take a hand first, and a spare operator if no hand is free.
   */
  staffedJobs(creekId: number): JobKind[] {
    const site = this.findSite(creekId);
    if (!site) return [];
    let hands = this.workersAt(creekId).filter((w) => w.role === 'hand').length;
    let operators = this.workersAt(creekId).length - hands;
    const staffed: JobKind[] = [];
    for (const job of site.jobs) {
      if (OPERATOR_JOBS.includes(job)) {
        if (operators > 0) (operators--, staffed.push(job));
      } else if (hands > 0) (hands--, staffed.push(job));
      else if (operators > 0) (operators--, staffed.push(job));
    }
    return staffed;
  }

  /** Buy a crew unit of a machine. It waits as a spare until a job needs it. */
  buyMachine(session: PanningSession, machine: CrewMachine, restricted: boolean): 'bought' | 'restricted' | 'cantAfford' {
    if (restricted) return 'restricted';
    const price = STAFF_TUNING.machinePrice[machine];
    if (session.cash < price) return 'cantAfford';
    session.cash = Math.round((session.cash - price) * 100) / 100;
    this.spares[machine] += 1;
    return 'bought';
  }

  /**
   * Wages run by the game day, working or not. If they go too long unpaid, the last hand hired
   * walks off; whatever is owed stays owed. Returns who quit, if anyone.
   */
  accrue(seconds: number): Worker | null {
    if (this.workers.length === 0 || seconds <= 0) return null;
    this.wagesOwed += (this.dailyWages * seconds) / ECONOMY_TUNING.daySeconds;
    const limit = this.dailyWages * STAFF_TUNING.quitDays;
    if (this.wagesOwed <= limit) return null;
    this.wagesOwed = limit;
    return this.workers.pop() ?? null;
  }

  /** Pay wages from cash, as far as it goes. Returns dollars paid. */
  payWages(session: PanningSession): number {
    const { paid, left } = payDebt(this.wagesOwed, session.cash);
    if (paid <= 0) return 0;
    session.cash = Math.round((session.cash - paid) * 100) / 100;
    this.wagesOwed = left;
    return paid;
  }

  /** Work every crewed stretch for `seconds` of game time. */
  work(seconds: number, world: CrewWorld): void {
    for (const site of this.sites) {
      const workers = this.workersAt(site.creekId);
      if (workers.length === 0) continue;
      const creek = world.region.creeks.find((c) => c.id === site.creekId);
      if (!creek) continue;
      this.fitMachines(site, creek, world.session);
      const staffed = this.staffedJobs(site.creekId);
      if (this.stopAt(site.creekId, world)) {
        for (const job of staffed) site.idle[job] = null;
        continue;
      }
      const ctx: JobContext = {
        rng: this.rng,
        creek,
        site,
        session: world.session,
        region: world.region,
        economy: world.economy,
        boost: staffed.includes('haul') ? CREW_TUNING.haulBoost : 1,
        screened: staffed.includes('screen') && site.classifier,
        policy: POLICY_TUNING[site.policy],
        preparing: site.policy === 'prepare',
      };
      let left = seconds;
      while (left > 1e-9) {
        const dt = Math.min(CREW_TUNING.step, left);
        left -= dt;
        let working = false;
        for (const job of staffed) {
          const idle = runJob(job, dt, ctx);
          site.idle[job] = idle;
          if (!idle) working = true;
        }
        if (working) site.report.seconds += dt;
      }
    }
  }

  /** Why a site's crew isn't working at all right now, if it isn't. */
  stopAt(creekId: number, world: Pick<CrewWorld, 'economy' | 'playerAt'>): SiteStop | null {
    if (world.playerAt === creekId) return 'playerHere';
    if (!world.economy.canWork(creekId)) return 'claimLapsed';
    return null;
  }

  /** Give a site's switched-on jobs the crew machines they need, from spares, where there's room. */
  private fitMachines(site: SiteCrew, creek: Creek, session: PanningSession): void {
    for (const job of site.jobs) {
      const machine = machineFor(job);
      if (!machine || this.spares[machine] <= 0) continue;
      if (hasMachine(machineContext(creek, site, session), job)) continue;
      if (installMachine(site, machine, creek, session, this.rng)) this.spares[machine] -= 1;
    }
  }

  /** Whether a switched-on job has the machine it needs here (a crew unit, or the player's own). */
  jobReady(creek: Creek, job: JobKind, session: PanningSession): boolean {
    const site = this.findSite(creek.id);
    if (!site) return false;
    if (!machineFor(job)) return true;
    return hasMachine(machineContext(creek, site, session), job) || this.spares[machineFor(job)!] > 0;
  }

  /**
   * Collect from a stretch's crew: the poke of gold into the vial, and as much of the bucket's
   * concentrate as the jar will take. Returns what moved.
   */
  collect(creekId: number, session: PanningSession): { gold: number; sand: number; sandLeft: number } {
    const site = this.findSite(creekId);
    if (!site) return { gold: 0, sand: 0, sandLeft: 0 };
    const gold = site.poke.length;
    session.vial.push(...site.poke);
    site.poke = [];
    const sand = this.pourInto(site.bucket, session);
    return { gold, sand, sandLeft: site.bucket.blackSand };
  }

  /** Wash concentrate a crew brought back to town into the jar, as far as it fits. */
  washReturned(session: PanningSession): number {
    return this.pourInto(this.returned, session);
  }

  private pourInto(bucket: { blackSand: number; gold: GoldPiece[] }, session: PanningSession): number {
    if (bucket.blackSand <= 0) {
      // Gold with no sand left to carry it still goes in.
      if (bucket.gold.length > 0) session.addConcentrate({ blackSand: 0, gold: bucket.gold.splice(0) });
      return 0;
    }
    const amount = Math.min(bucket.blackSand, session.jarSpace);
    if (amount <= 0) return 0;
    const share = amount / bucket.blackSand;
    const moved: GoldPiece[] = [];
    const kept: GoldPiece[] = [];
    for (const piece of bucket.gold) (share >= 1 || this.rng.next() < share ? moved : kept).push(piece);
    session.addConcentrate({ blackSand: amount, gold: moved });
    bucket.blackSand -= amount;
    if (bucket.blackSand < 1e-9) bucket.blackSand = 0;
    bucket.gold = kept;
    return amount;
  }

  takeReport(creekId: number): SiteReport {
    return this.findSite(creekId)?.takeReport() ?? emptyReport();
  }
}

/** Just enough context to ask whether a job has its machine. */
function machineContext(creek: Creek, site: SiteCrew, session: PanningSession): JobContext {
  return { creek, site, session } as JobContext;
}

/** Roughly how many game days of digging a crewed stretch has left at their pace. */
export function crewGroundLeft(crew: Crew, creek: Creek): number {
  const diggers = crew.staffedJobs(creek.id).filter((j) => DIGGING_JOBS.includes(j));
  return crewDaysLeft(creek, diggers, ECONOMY_TUNING.daySeconds, crew.policyAt(creek.id));
}

/**
 * A rough daily take for one hand digging a stretch, built only from the player's own field
 * notes there: no notes, no estimate. Wide, because notes are few and a hand's recovery varies.
 */
export function estimateHandTake(creek: Creek, policy: CrewPolicy = 'steady'): Estimate | null {
  const p = POLICY_TUNING[policy];
  if (p.recoveryGuess <= 0) return null;
  let pans = 0;
  let mg = 0;
  for (const spot of creek.creekSpots) {
    if (!spot.notes) continue;
    pans += spot.notes.pans;
    mg += spot.notes.mg;
  }
  if (pans === 0) return null;
  const loadsPerDay = ECONOMY_TUNING.daySeconds / ((CREW_TUNING.feedTime + CREW_TUNING.haulPerLength * 0.25) * p.pace);
  const dollars = (mg / pans) * loadsPerDay * STAFF_TUNING.estimatedRecovery * p.recoveryGuess * MARKET.spotPerMg * 0.8;
  return estimateAround(dollars, pans < 5 ? 1.2 : 0.7);
}

/** The one-hand crew of saves before version 15, as a crew: the hand on the sluice job where it was. */
export function crewFromV14(old: {
  hand: { name: string; wage: number } | null;
  wagesOwed: number;
  bucket: { blackSand: number; gold: GoldPiece[] };
  sluiceCreekId: number | null;
}): CrewSnapshot {
  const atSite = old.hand !== null && old.sluiceCreekId !== null;
  const workers: Worker[] = old.hand ? [{ id: 1, name: old.hand.name, role: 'operator', wage: old.hand.wage, siteId: atSite ? old.sluiceCreekId : null }] : [];
  const sites: SiteCrewSnapshot[] = atSite
    ? [
        {
          creekId: old.sluiceCreekId!,
          jobs: ['sluice'],
          policy: 'steady',
          bucket: old.bucket,
          poke: [],
          report: emptyReport(),
          prospected: [],
          states: {},
          idle: {},
          machines: { sluice: null, highbanker: null, rocker: null, drywasher: null, classifier: false },
        },
      ]
    : [];
  return {
    workers,
    sites,
    spares: noSpares(),
    wagesOwed: old.wagesOwed,
    returned: atSite ? { blackSand: 0, gold: [] } : old.bucket,
    nextWorkerId: 2,
  };
}

export type { CrewMachine, CrewPolicy, JobIdle, JobKind, SiteReport };
