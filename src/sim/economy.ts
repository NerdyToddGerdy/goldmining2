import type { CreekProfile } from './creek';
import type { PanningSession } from './panningSession';
import type { Region } from './region';

/**
 * The cost side of the game (see "Economy, Depletion, and Recovery" in the design doc): a game
 * clock, claims on found stretches, and the holding fees they run up.
 *
 * Game time passes only while the player is actually playing (the game layer stops feeding it
 * when there's no input) and when they travel. It is not wall-clock time, so a closed tab
 * neither earns nor owes.
 *
 * Every found stretch is staked when found and owes a small fee per day while held. Fees are
 * paid in town. A claim more than a few days behind lapses and can't be worked until it's paid
 * up; releasing a claim clears its debt. Being behind restricts expansion (no new gear, leads, or
 * hires) but never takes anything away. The Home Creek is never a claim and never costs a thing.
 */

export const ECONOMY_TUNING = {
  /** Seconds of active play in a game day. */
  daySeconds: 600,
  /** Holding fee per day: a plain stretch, and one with ground for a sluice. */
  fee: { stretch: 1, sluiceGround: 2 },
  /** A claim this many days' fees behind lapses. */
  graceDays: 3,
  /** Re-staking a released claim: the recording fee. */
  restakeFee: 5,
  /** Game seconds spent getting somewhere. */
  travel: { town: 60, creek: 90, lead: 120 },
} as const;

export type ClaimStatus = 'held' | 'released';

export interface Claim {
  readonly creekId: number;
  status: ClaimStatus;
  /** Dollars per game day while held. */
  readonly fee: number;
  /** Unpaid fees, in dollars. */
  owed: number;
}

export interface EconomySnapshot {
  readonly clock: number;
  readonly claims: readonly Claim[];
}

/** The daily holding fee for a stretch: more where the ground can take a sluice. */
export function feeFor(profile: Pick<CreekProfile, 'sluiceSites' | 'pumpSites'>): number {
  return profile.sluiceSites + profile.pumpSites > 0 ? ECONOMY_TUNING.fee.sluiceGround : ECONOMY_TUNING.fee.stretch;
}

export type ReleaseResult = 'released' | 'notHeld' | 'sluiceThere';
export type RestakeResult = 'staked' | 'notReleased' | 'restricted' | 'cantAfford';

export class Economy {
  /** Game seconds since the start. */
  clock = 0;
  private readonly claims = new Map<number, Claim>();

  constructor(saved?: EconomySnapshot) {
    if (!saved) return;
    this.clock = saved.clock;
    for (const claim of saved.claims) this.claims.set(claim.creekId, { ...claim });
  }

  snapshot(): EconomySnapshot {
    return structuredClone({ clock: this.clock, claims: [...this.claims.values()] });
  }

  /** Whole game days gone, counting from day 1. */
  get day(): number {
    return Math.floor(this.clock / ECONOMY_TUNING.daySeconds) + 1;
  }

  /** Stake a newly found stretch. Idempotent. */
  stake(creekId: number, profile: Pick<CreekProfile, 'sluiceSites' | 'pumpSites'>): Claim {
    const existing = this.claims.get(creekId);
    if (existing) return existing;
    const claim: Claim = { creekId, status: 'held', fee: feeFor(profile), owed: 0 };
    this.claims.set(creekId, claim);
    return claim;
  }

  /** Stake every found stretch that has no claim yet (the Home Creek is never one). */
  stakeFound(region: Region): Claim[] {
    const staked: Claim[] = [];
    for (const creek of region.creeks) {
      if (creek === region.home || this.claims.has(creek.id)) continue;
      staked.push(this.stake(creek.id, creek.profile));
    }
    return staked;
  }

  claim(creekId: number): Claim | null {
    return this.claims.get(creekId) ?? null;
  }

  get allClaims(): Claim[] {
    return [...this.claims.values()];
  }

  /** Let game time pass: held claims run up their fees. */
  advance(seconds: number): void {
    if (seconds <= 0) return;
    this.clock += seconds;
    const days = seconds / ECONOMY_TUNING.daySeconds;
    for (const claim of this.claims.values()) if (claim.status === 'held') claim.owed += claim.fee * days;
  }

  isLapsed(claim: Claim): boolean {
    return claim.status === 'held' && claim.owed > claim.fee * ECONOMY_TUNING.graceDays + 1e-9;
  }

  /**
   * Whether a creek can be worked: the Home Creek (never a claim) always can; a stretch only
   * while held and paid up within the grace period.
   */
  canWork(creekId: number): boolean {
    const claim = this.claims.get(creekId);
    if (!claim) return true;
    return claim.status === 'held' && !this.isLapsed(claim);
  }

  get feesOwed(): number {
    let owed = 0;
    for (const claim of this.claims.values()) owed += claim.owed;
    return owed;
  }

  /** Any claim lapsed: no new gear, leads, or hires until it's paid or released. */
  get anyLapsed(): boolean {
    return [...this.claims.values()].some((c) => this.isLapsed(c));
  }

  /** Pay fees from cash, as far as it goes, most-behind claim first. Returns dollars paid. */
  payFees(session: PanningSession): number {
    let paid = 0;
    const claims = [...this.claims.values()].filter((c) => c.owed > 0).sort((a, b) => b.owed / b.fee - a.owed / a.fee);
    for (const claim of claims) {
      const amount = Math.min(claim.owed, session.cash);
      if (amount < 0.005) continue;
      const cents = Math.floor(amount * 100) / 100;
      session.cash = Math.round((session.cash - cents) * 100) / 100;
      claim.owed = Math.max(0, claim.owed - cents);
      if (claim.owed < 0.005) claim.owed = 0;
      paid += cents;
    }
    return Math.round(paid * 100) / 100;
  }

  /** Give up a claim. Its debt goes with it. The sluice has to come down first. */
  release(creekId: number, session: PanningSession): ReleaseResult {
    const claim = this.claims.get(creekId);
    if (!claim || claim.status !== 'held') return 'notHeld';
    if (session.sluicePlace?.creekId === creekId) return 'sluiceThere';
    claim.status = 'released';
    claim.owed = 0;
    return 'released';
  }

  /** Stake a released claim again, paying the recording fee. */
  restake(creekId: number, session: PanningSession, restricted: boolean): RestakeResult {
    const claim = this.claims.get(creekId);
    if (!claim || claim.status !== 'released') return 'notReleased';
    if (restricted) return 'restricted';
    if (session.cash < ECONOMY_TUNING.restakeFee) return 'cantAfford';
    session.cash = Math.round((session.cash - ECONOMY_TUNING.restakeFee) * 100) / 100;
    claim.status = 'held';
    return 'staked';
  }
}
