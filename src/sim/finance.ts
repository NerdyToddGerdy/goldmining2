import { ECONOMY_TUNING, type Economy } from './economy';
import type { PanningSession } from './panningSession';
import type { Region } from './region';
import { STAFF_TUNING, type Crew, type Worker } from './staffing';

/**
 * Financial decline and recovery (see "Economy, Depletion, and Recovery" and the anti-death-spiral
 * rules in the design doc). Failure downsizes; it never ends the run.
 *
 * - Healthy: cash covers what's owed.
 * - Strained: owing more than cash on hand, nothing overdue yet. No hiring and no big purchases;
 *   the existing operation carries on. (Having the money but not having been to town to pay is
 *   also only strained: fees and wages are paid there automatically.)
 * - Insolvent: behind (a claim lapsed or wages overdue) and unable to cover it. The crew downs
 *   tools and walks off, wages still owed. Only fuel can be bought. If it lasts, shutdown follows.
 * - Shutdown (a moment, not a state): every claim is released and its fees written off; the
 *   player's sluice and highbanker are taken down and packed, kept; crew machines are sold for
 *   scrap toward the wages owed; each lost claim leaves a little salvage, and the player comes away
 *   with a lead. The player is back at the Home Creek with the shovel, pan and portable gear.
 * - Recovering: after a shutdown, until what's still owed is paid off. Buying stays restricted,
 *   with nothing more taken.
 *
 * Never touched, in any state: the shovel and pan, the Home Creek, portable gear, field notes, leads.
 */

export type FinancialState = 'healthy' | 'strained' | 'insolvent' | 'recovering';

export const FINANCE_TUNING = {
  /** Game days insolvent before the operation is shut down. */
  shutdownAfterDays: 2,
  /** Share of a crew machine's price its scrap fetches. */
  scrapShare: 0.5,
  /** Salvage from a lost claim's camp: tools, timber, a tarp. */
  claimSalvage: 2,
  /** Big purchases (blocked while strained) cost at least this. */
  bigPurchase: 20,
} as const;

export type Purchase = 'hire' | 'crewGear' | 'gear' | 'lead' | 'restake' | 'fuel';

export interface FinanceSnapshot {
  /** Game clock when the player became insolvent, or null. */
  readonly insolventSince: number | null;
  /** A shutdown has happened and what's owed isn't paid off yet. */
  readonly recovering: boolean;
  readonly shutdowns: number;
}

export type FinanceEvent =
  | { readonly kind: 'strained' }
  | { readonly kind: 'insolvent'; readonly walkedOff: readonly Worker[] }
  | {
      readonly kind: 'shutdown';
      readonly claimsLost: readonly string[];
      readonly scrap: number;
      readonly salvage: number;
      readonly lead: string | null;
      readonly carried: boolean;
    }
  | { readonly kind: 'recovered' }
  | { readonly kind: 'healthy' };

/** Everything the finances look at and act on. */
export interface FinanceWorld {
  readonly session: PanningSession;
  readonly economy: Economy;
  readonly crew: Crew;
  readonly region: Region;
}

export class Finance {
  insolventSince: number | null = null;
  recovering = false;
  shutdowns = 0;
  private last: FinancialState = 'healthy';

  constructor(saved?: FinanceSnapshot) {
    if (!saved) return;
    this.insolventSince = saved.insolventSince;
    this.recovering = saved.recovering;
    this.shutdowns = saved.shutdowns;
  }

  snapshot(): FinanceSnapshot {
    return { insolventSince: this.insolventSince, recovering: this.recovering, shutdowns: this.shutdowns };
  }

  /** What's owed right now: claim fees and wages. */
  static owed(world: Pick<FinanceWorld, 'economy' | 'crew'>): number {
    return world.economy.feesOwed + Math.max(0, world.crew.wagesOwed);
  }

  /** Behind: a claim has lapsed, or wages are more than a day overdue. */
  static behind(world: Pick<FinanceWorld, 'economy' | 'crew'>): boolean {
    return world.economy.anyLapsed || world.crew.wagesOverdue;
  }

  /** The state as things stand. */
  state(world: Pick<FinanceWorld, 'session' | 'economy' | 'crew'>): FinancialState {
    const owed = Finance.owed(world);
    const covered = world.session.cash + 1e-9 >= owed;
    if (this.recovering && owed > 0.005) return 'recovering';
    if (Finance.behind(world) && !covered) return 'insolvent';
    if (!covered || Finance.behind(world)) return 'strained';
    return 'healthy';
  }

  /** Whether a purchase is allowed in the current state. */
  allows(purchase: Purchase, world: Pick<FinanceWorld, 'session' | 'economy' | 'crew'>, price = 0): boolean {
    if (purchase === 'fuel') return true;
    const state = this.state(world);
    if (state === 'healthy') return true;
    if (state === 'strained') return purchase !== 'hire' && purchase !== 'crewGear' && !(purchase === 'gear' && price >= FINANCE_TUNING.bigPurchase);
    return false;
  }

  /** Game days left before shutdown, while insolvent. */
  daysToShutdown(economy: Economy): number | null {
    if (this.insolventSince === null) return null;
    return Math.max(0, FINANCE_TUNING.shutdownAfterDays - (economy.clock - this.insolventSince) / ECONOMY_TUNING.daySeconds);
  }

  /**
   * Check the books after time passes or money moves. Applies whatever the new state brings and
   * returns what happened, for the game to tell the player.
   */
  update(world: FinanceWorld): FinanceEvent[] {
    const events: FinanceEvent[] = [];
    let state = this.state(world);
    if (state === 'insolvent') {
      if (this.insolventSince === null) {
        this.insolventSince = world.economy.clock;
        // No money for payroll: the crew downs tools and walks off. What's owed stays owed.
        const walkedOff = [...world.crew.workers];
        for (const site of [...world.crew.sites]) world.crew.closeSite(site.creekId);
        world.crew.workers = [];
        events.push({ kind: 'insolvent', walkedOff });
      }
      if ((this.daysToShutdown(world.economy) ?? 1) <= 0) {
        events.push(this.shutdown(world));
        state = this.state(world);
      }
    } else if (!this.recovering) {
      this.insolventSince = null;
    }
    if (this.recovering && Finance.owed(world) <= 0.005) {
      this.recovering = false;
      this.insolventSince = null;
      events.push({ kind: 'recovered' });
      state = this.state(world);
    }
    if (state !== this.last) {
      if (state === 'strained' && this.last === 'healthy') events.push({ kind: 'strained' });
      if (state === 'healthy' && this.last !== 'recovering' && !events.some((e) => e.kind === 'recovered')) events.push({ kind: 'healthy' });
    }
    this.last = state;
    return events;
  }

  /** Shut the operation down to the Home Creek. See the class comment for what goes and what stays. */
  private shutdown(world: FinanceWorld): FinanceEvent {
    const { session, economy, crew, region } = world;
    this.shutdowns += 1;
    this.recovering = true;
    this.insolventSince = null;

    // The player's own machines come down and are packed; mats that won't fit the jar are carried home.
    const overflow = session.packUp();
    const carried = overflow.length > 0;
    for (const mat of overflow) {
      crew.returned.blackSand += mat.blackSand;
      crew.returned.gold.push(...mat.gold);
    }

    // Crew sites close (their buckets and pokes come back to town), and crew machines go for scrap.
    for (const site of [...crew.sites]) crew.closeSite(site.creekId);
    crew.workers = [];
    let scrap = 0;
    for (const [machine, count] of Object.entries(crew.spares) as [keyof typeof crew.spares, number][]) {
      scrap += count * STAFF_TUNING.machinePrice[machine] * FINANCE_TUNING.scrapShare;
      crew.spares[machine] = 0;
    }

    // Every claim is given up, its fees written off. Each camp leaves a little salvage.
    const claimsLost: string[] = [];
    for (const claim of economy.allClaims) {
      if (claim.status !== 'held') continue;
      economy.release(claim.creekId, session);
      claimsLost.push(region.creek(claim.creekId).profile.name);
    }
    const salvage = claimsLost.length * FINANCE_TUNING.claimSalvage;
    session.cash = Math.round((session.cash + scrap + salvage) * 100) / 100;
    crew.payWages(session);

    // A failed operation still leaves something to go on: a lead from the people you worked alongside.
    const lead = claimsLost.length > 0 ? region.clueFound().name : null;
    return { kind: 'shutdown', claimsLost, scrap, salvage, lead, carried };
  }
}
