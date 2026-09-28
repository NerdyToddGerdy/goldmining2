import type { Creek } from './creek';
import { DIGGING_JOBS, type CrewPolicy, type JobIdle, type JobKind } from './crewJobs';
import type { Claim, Economy } from './economy';
import type { Estimate } from './estimate';
import { needsPump } from './sluice';
import { OPERATOR_JOBS, crewGroundLeft, estimateHandTake, type Crew, type Pace, type Role, type Skill } from './staffing';
import type { PanningSession } from './panningSession';

/**
 * A claim at a glance, for the field tablet: everything the game already knows about how a stretch
 * and its crew are doing, reduced to a status and plain-language warnings. It reads only; nothing
 * here changes the game. Estimates stay estimates: gold is never stated, only the player's own rough
 * figures from their field notes.
 */

export type ClaimHealth = 'steady' | 'warn' | 'critical' | 'noCrew';

export interface JobLine {
  readonly job: JobKind;
  /** Working, idle for a reason, waiting for someone who can do it, or stopped because the player is there. */
  readonly state: 'working' | 'noOne' | 'needsOperator' | 'standingBack' | JobIdle;
}

export interface ClaimOverview {
  readonly creekId: number;
  readonly claim: Claim;
  /** How the crew here works. */
  readonly policy: CrewPolicy;
  readonly crew: readonly { readonly name: string; readonly role: Role; readonly skill: Skill; readonly pace: Pace }[];
  /** How much a foreman here lifts the crew (0 with none, or with no notes to go on). */
  readonly foremanLift: number;
  readonly hasForeman: boolean;
  readonly jobs: readonly JobLine[];
  readonly wagesPerDay: number;
  readonly feePerDay: number;
  /** A job here burns the player's fuel cans (a highbanker, or a sluice on a pump). */
  readonly burnsFuel: boolean;
  /** Share of the ground left to dig, 0..1. */
  readonly groundLeft: number;
  /** Game days of ground left at the crew's pace (Infinity with nobody digging). */
  readonly daysLeft: number;
  /** A rough daily take per digging hand, from the player's field notes; null without notes. */
  readonly take: Estimate | null;
  /** What's waiting to be collected: concentrate in the crew bucket, and pieces of gold in the poke. */
  readonly waiting: { readonly sand: number; readonly gold: number };
  readonly status: ClaimHealth;
  /** Plain-language warnings, most serious first. */
  readonly warnings: readonly string[];
}

/** How full the crew bucket counts as nearly full. */
const BUCKET_WARN = 3.2;

export function claimOverview(
  creek: Creek,
  claim: Claim,
  world: { readonly crew: Crew; readonly economy: Economy; readonly session: PanningSession; readonly playerAt: number | null },
): ClaimOverview {
  const { crew, economy, session } = world;
  const workers = crew.workersAt(creek.id);
  const site = crew.findSite(creek.id);
  const staffed = crew.staffedJobs(creek.id);
  const here = world.playerAt === creek.id;
  const operators = workers.filter((w) => w.role === 'operator').length;

  const jobs: JobLine[] = (site?.jobs ?? []).map((job) => {
    if (!staffed.includes(job)) return { job, state: OPERATOR_JOBS.includes(job) && operators === 0 ? 'needsOperator' : 'noOne' };
    if (here) return { job, state: 'standingBack' };
    const idle = site?.idle[job];
    return { job, state: idle ?? 'working' };
  });

  const wagesPerDay = workers.reduce((n, w) => n + w.wage, 0);
  const pumped = session.sluicePlace?.creekId === creek.id && creek.sluiceSpots.some((s) => s.id === session.sluicePlace!.spotId && needsPump(s.sluiceSite!));
  const burnsFuel = staffed.includes('highbanker') || (staffed.includes('sluice') && pumped);
  const daysLeft = crewGroundLeft(crew, creek);
  const policy = crew.policyAt(creek.id);
  const take = estimateHandTake(creek, policy);
  // Gold in the bucket stays hidden in the concentrate until it's panned: only the poke is counted.
  const waiting = { sand: site?.bucket.blackSand ?? 0, gold: site?.poke.length ?? 0 };

  // Warnings, most serious first, and the status they add up to.
  const critical: string[] = [];
  const warn: string[] = [];
  const name = creek.profile.name;
  if (claim.status === 'held' && economy.isLapsed(claim)) critical.push(`The claim has lapsed for unpaid fees: nobody can work ${name} until it's paid.`);
  const working = jobs.filter((j) => j.state === 'working');
  const diggers = staffed.filter((j) => DIGGING_JOBS.includes(j)).length;
  // Preparing the ground runs out of work once the pay gravel is open everywhere.
  const prepared = jobs.length > 0 && jobs.every((j) => j.state === 'groundReady' || !DIGGING_JOBS.includes(j.job));
  if (workers.length > 0 && !here && working.length === 0 && jobs.length > 0 && !prepared) critical.push(`The crew at ${name} is standing idle while you pay them.`);
  if (workers.length > 0 && jobs.length === 0) critical.push(`The crew at ${name} has no jobs switched on.`);
  if (workers.length > 0 && take && diggers > 0 && take.high * diggers < wagesPerDay + claim.fee) {
    critical.push('From your notes, this crew likely costs more than it brings in.');
  }
  if (jobs.some((j) => j.state === 'bucketFull') || waiting.sand >= BUCKET_WARN) warn.push('The crew bucket is (nearly) full: collect it, or the machines stop.');
  if (jobs.some((j) => j.state === 'groundReady')) warn.push('The ground is prepared: set the crew back to washing, or come and work it.');
  if (jobs.some((j) => j.state === 'noFuel')) warn.push('Out of fuel cans for the engines.');
  if (jobs.some((j) => j.state === 'noMachine')) warn.push('A job is waiting for a crew machine from the outfitter.');
  if (jobs.some((j) => j.state === 'needsOperator')) warn.push('A job needs an operator.');
  if (claim.owed > 0 && !economy.isLapsed(claim)) warn.push(`Owes $${(Math.ceil(claim.owed * 100 - 1e-6) / 100).toFixed(2)} in fees.`);
  if (creek.groundLeft <= 0) warn.push('The ground is worked out: release the claim, or move the crew.');
  else if (diggers > 0 && daysLeft < 1) {
    warn.push(daysLeft < 0.5 ? `At this pace, ${name} will be worked out within half a day.` : `At this pace, ${name} will be worked out in about a day.`);
  }
  const hasForeman = crew.foremanAt(creek.id) !== null;
  const foremanLift = crew.foremanLift(creek);
  if (hasForeman && foremanLift === 0) warn.push('The foreman has no field notes to work from here: pan a few spots yourself.');
  if (workers.length > 0 && diggers > 0 && !take && policy !== 'prepare') warn.push('No field notes here yet: pan it yourself to judge whether the crew pays.');

  const status: ClaimHealth = workers.length === 0 ? 'noCrew' : critical.length > 0 ? 'critical' : warn.length > 0 ? 'warn' : 'steady';
  return {
    creekId: creek.id,
    claim,
    policy,
    crew: workers.map((w) => ({ name: w.name, role: w.role, skill: w.skill, pace: w.pace })),
    foremanLift,
    hasForeman,
    jobs,
    wagesPerDay,
    feePerDay: claim.fee,
    burnsFuel,
    groundLeft: creek.groundLeft,
    daysLeft,
    take,
    waiting,
    status,
    warnings: [...critical, ...warn],
  };
}

/** The whole operation's daily costs and what's owed, for the tablet's cost tab. */
export function costOverview(world: { readonly crew: Crew; readonly economy: Economy }): {
  readonly feesPerDay: number;
  readonly wagesPerDay: number;
  readonly feesOwed: number;
  readonly wagesOwed: number;
} {
  const held = world.economy.allClaims.filter((c) => c.status === 'held');
  return {
    feesPerDay: held.reduce((n, c) => n + c.fee, 0),
    wagesPerDay: world.crew.dailyWages,
    feesOwed: world.economy.feesOwed,
    wagesOwed: Math.max(0, world.crew.wagesOwed),
  };
}

/** Claims most in need of attention first. */
export const STATUS_ORDER: Record<ClaimHealth, number> = { critical: 0, warn: 1, steady: 2, noCrew: 3 };
