import { describe, expect, it } from 'vitest';
import type { Creek } from './creek';
import { ECONOMY_TUNING, Economy } from './economy';
import { FINANCE_TUNING, Finance, type FinanceWorld } from './finance';
import { buyGear } from './outfitter';
import { PanningSession } from './panningSession';
import { Region } from './region';
import { createRng } from './rng';
import { createSave, loadSave } from './save';
import { Crew, STAFF_TUNING } from './staffing';

const DAY = ECONOMY_TUNING.daySeconds;

interface Setup extends FinanceWorld {
  finance: Finance;
  bend: Creek;
}

/** A player with a creek bend and a plain stretch staked, some cash, and an empty crew. */
function setup(seed: number): Setup {
  const region = new Region(createRng(seed));
  let bend: Creek | null = null;
  for (const site of ['creekBend', 'creekStretch'] as const) {
    for (;;) {
      const lead = region.clueFound();
      (lead as { truth: unknown }).truth = { real: true, richness: 1.3, site };
      const r = region.follow(lead.id);
      if (!r.found) continue;
      if (site === 'creekBend') bend = r.creek;
      break;
    }
  }
  const session = new PanningSession(createRng(seed));
  session.cash = 300;
  const economy = new Economy();
  economy.stakeFound(region);
  return { region, session, economy, crew: new Crew(createRng(seed)), finance: new Finance(), bend: bend! };
}

/** Let game time pass with nothing paid, checking the books as the game does. */
function passDays(s: Setup, days: number): ReturnType<Finance['update']> {
  const events = [];
  for (let t = 0; t < days * DAY; t += 30) {
    s.economy.advance(30);
    s.crew.accrue(30);
    events.push(...s.finance.update(s));
  }
  return events;
}

describe('financial state', () => {
  it('is healthy while cash covers what is owed, and strained when it doesn’t', () => {
    const s = setup(1);
    expect(s.finance.state(s)).toBe('healthy');
    s.economy.advance(DAY);
    expect(s.finance.state(s)).toBe('healthy'); // A few dollars owed, plenty of cash.
    s.session.cash = 0;
    expect(s.finance.state(s)).toBe('strained');
  });

  it('is only strained when behind with the cash to pay: the player just hasn’t been to town', () => {
    const s = setup(2);
    s.economy.advance(DAY * (ECONOMY_TUNING.graceDays + 1));
    expect(s.economy.anyLapsed).toBe(true);
    expect(s.finance.state(s)).toBe('strained');
    const events = passDays(s, 5);
    expect(events.some((e) => e.kind === 'shutdown')).toBe(false);
  });

  it('blocks hiring and big purchases while strained, and everything but fuel while insolvent', () => {
    const s = setup(3);
    s.session.cash = 0;
    s.economy.advance(DAY);
    expect(s.finance.state(s)).toBe('strained');
    expect(s.finance.allows('hire', s)).toBe(false);
    expect(s.finance.allows('crewGear', s)).toBe(false);
    expect(s.finance.allows('gear', s, FINANCE_TUNING.bigPurchase)).toBe(false);
    expect(s.finance.allows('gear', s, 8)).toBe(true);
    expect(s.finance.allows('lead', s)).toBe(true);
    s.economy.advance(DAY * ECONOMY_TUNING.graceDays);
    expect(s.finance.state(s)).toBe('insolvent');
    expect(s.finance.allows('lead', s)).toBe(false);
    expect(s.finance.allows('gear', s, 8)).toBe(false);
    expect(s.finance.allows('fuel', s)).toBe(true);
  });
});

describe('going under', () => {
  it('loses the crew when insolvent, wages still owed, and counts down to shutdown', () => {
    const s = setup(4);
    for (let i = 0; i < 2; i++) s.crew.hire(s.session, false, 'operator');
    s.crew.send(s.bend, s.economy, s.region.home.id);
    s.session.cash = 0;
    // Paid a day ahead at hiring; more than a day's wages overdue a little past day two.
    const events = passDays(s, 2.5);
    const insolvent = events.find((e) => e.kind === 'insolvent');
    if (insolvent?.kind !== 'insolvent') throw new Error('never went insolvent');
    expect(insolvent.walkedOff).toHaveLength(2);
    expect(s.crew.workers).toHaveLength(0);
    expect(s.crew.wagesOwed).toBeGreaterThan(0);
    const left = s.finance.daysToShutdown(s.economy)!;
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThanOrEqual(FINANCE_TUNING.shutdownAfterDays);
  });

  it('shuts down to the Home Creek: claims released, machines packed and kept, crew gear scrapped, salvage and a lead', () => {
    const s = setup(5);
    s.session.cash = 200;
    for (const id of ['sluice', 'rocker', 'classifier'] as const) buyGear(s.session, id);
    const site = s.bend.sluiceSpots[0]!;
    s.session.setUpSluice(s.bend.id, site);
    s.session.sluiceAt(s.bend.id, site.id)!.feed({ richness: 6, clayiness: 0.2, rockiness: 0.3 });
    s.crew.buyMachine(s.session, 'rocker', false);
    s.crew.hire(s.session, false, 'operator');
    const cashBefore = s.session.cash;
    s.session.cash = 0;
    const leads = s.region.leads.length;
    const events = passDays(s, ECONOMY_TUNING.graceDays + FINANCE_TUNING.shutdownAfterDays + 2);
    const shutdown = events.find((e) => e.kind === 'shutdown');
    expect(shutdown).toBeDefined();
    if (shutdown?.kind !== 'shutdown') return;
    expect(shutdown.claimsLost).toHaveLength(2);
    for (const claim of s.economy.allClaims) expect(claim.status).toBe('released');
    expect(s.economy.feesOwed).toBe(0);
    // The sluice came down and was packed, not lost; portable gear is untouched.
    expect(s.session.sluicePlace).toBeNull();
    for (const id of ['sluice', 'rocker', 'classifier'] as const) expect(s.session.owns(id)).toBe(true);
    // Crew gear went for scrap, and it and the salvage went toward what was owed.
    expect(shutdown.scrap).toBe(STAFF_TUNING.machinePrice.rocker * FINANCE_TUNING.scrapShare);
    expect(shutdown.salvage).toBe(2 * FINANCE_TUNING.claimSalvage);
    expect(s.crew.spares.rocker).toBe(0);
    expect(s.region.leads.length).toBe(leads + 1);
    // The Home Creek is always there, free, with nothing needed but a shovel and pan.
    expect(s.economy.canWork(s.region.home.id)).toBe(true);
    expect(cashBefore).toBeGreaterThan(0);
  });

  it('recovers once what is still owed is paid off, and shuts down only once', () => {
    const s = setup(6);
    for (let i = 0; i < 3; i++) s.crew.hire(s.session, false, 'operator');
    s.session.cash = 0;
    const events = passDays(s, ECONOMY_TUNING.graceDays + FINANCE_TUNING.shutdownAfterDays + 4);
    expect(events.filter((e) => e.kind === 'shutdown')).toHaveLength(1);
    expect(s.finance.state(s)).toBe('recovering');
    expect(s.finance.allows('lead', s)).toBe(false);
    s.session.cash = 500;
    s.crew.payWages(s.session);
    const after = s.finance.update(s);
    expect(after.some((e) => e.kind === 'recovered')).toBe(true);
    expect(s.finance.state(s)).toBe('healthy');
    expect(s.finance.allows('hire', s)).toBe(true);
  });

  it('keeps its state through a save, and a version 15 save starts healthy', () => {
    const s = setup(7);
    s.session.cash = 0;
    passDays(s, ECONOMY_TUNING.graceDays + 1);
    const save = JSON.parse(JSON.stringify(createSave(s.region, s.session, { screen: 'creek', creekId: s.region.home.id, spotId: null }, 0, s)));
    expect(loadSave(save, createRng(8))!.finance.snapshot()).toEqual(s.finance.snapshot());
    delete save.finance;
    const old = loadSave({ ...save, version: 15 }, createRng(9))!;
    expect(old.finance.snapshot()).toEqual({ insolventSince: null, recovering: false, shutdowns: 0 });
  });
});
