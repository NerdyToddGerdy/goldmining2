import { describe, expect, it } from 'vitest';
import type { Creek } from './creek';
import { ECONOMY_TUNING, Economy } from './economy';
import { claimOverview, costOverview } from './overview';
import { PanningSession } from './panningSession';
import { Region } from './region';
import { createRng } from './rng';
import type { SiteKind } from './sites';
import { Crew } from './staffing';

const DAY = ECONOMY_TUNING.daySeconds;

function setup(seed: number, site: SiteKind = 'creekBend') {
  const region = new Region(createRng(seed));
  let creek: Creek | null = null;
  while (!creek) {
    const lead = region.clueFound();
    (lead as { truth: unknown }).truth = { real: true, richness: 1.3, site };
    const r = region.follow(lead.id);
    if (r.found) creek = r.creek;
  }
  const session = new PanningSession(createRng(seed));
  session.cash = 500;
  const economy = new Economy();
  economy.stakeFound(region);
  const crew = new Crew(createRng(seed));
  const view = (playerAt: number | null = null) => claimOverview(creek!, economy.claim(creek!.id)!, { crew, economy, session, playerAt });
  return { region, creek, session, economy, crew, view };
}

describe('claim overview', () => {
  it('shows a claim with no crew as just that, with its ground and fee', () => {
    const s = setup(1);
    const v = s.view();
    expect(v.status).toBe('noCrew');
    expect(v.groundLeft).toBe(1);
    expect(v.feePerDay).toBe(2);
    expect(v.wagesPerDay).toBe(0);
  });

  it('is steady with a working crew on known-good ground', () => {
    const s = setup(2);
    for (let i = 0; i < 3; i++) s.creek.recordPan(s.creek.creekSpots[0]!.id, 8, 'payStreak');
    s.crew.hire(s.session, false, 'hand');
    s.crew.send(s.creek, s.economy, s.region.home.id);
    s.crew.toggleJob(s.creek, 'pan');
    s.crew.work(60, { session: s.session, region: s.region, economy: s.economy, playerAt: null });
    const v = s.view();
    expect(v.jobs).toEqual([{ job: 'pan', state: 'working' }]);
    expect(v.wagesPerDay).toBe(12);
    expect(v.take).not.toBeNull();
    expect(v.status).toBe('steady');
  });

  it('warns when a job needs an operator, and a crew standing back while the player is there is fine', () => {
    const s = setup(3);
    s.crew.hire(s.session, false, 'hand');
    s.crew.send(s.creek, s.economy, s.region.home.id);
    s.crew.toggleJob(s.creek, 'sluice');
    s.crew.toggleJob(s.creek, 'pan');
    const v = s.view();
    expect(v.jobs.find((j) => j.job === 'sluice')!.state).toBe('needsOperator');
    expect(v.warnings.some((w) => /operator/.test(w))).toBe(true);
    const there = s.view(s.creek.id);
    expect(there.jobs.find((j) => j.job === 'pan')!.state).toBe('standingBack');
    expect(there.warnings.some((w) => /idle/.test(w))).toBe(false);
  });

  it('is critical when the claim lapses, or the crew is paid to stand idle', () => {
    const s = setup(4);
    s.crew.hire(s.session, false, 'operator');
    s.crew.send(s.creek, s.economy, s.region.home.id);
    s.crew.toggleJob(s.creek, 'sluice'); // No crew sluice bought: it can't run.
    s.crew.work(30, { session: s.session, region: s.region, economy: s.economy, playerAt: null });
    expect(s.view().status).toBe('critical');
    expect(s.view().warnings[0]).toMatch(/idle/);
    const t = setup(5);
    t.crew.hire(t.session, false, 'hand');
    t.crew.send(t.creek, t.economy, t.region.home.id);
    t.economy.advance(DAY * (ECONOMY_TUNING.graceDays + 1));
    expect(t.view().status).toBe('critical');
    expect(t.view().warnings[0]).toMatch(/lapsed/);
  });

  it('flags a crew that likely costs more than it brings in, from the player’s own notes', () => {
    const s = setup(6);
    for (let i = 0; i < 6; i++) s.creek.recordPan(s.creek.creekSpots[0]!.id, 0.05, 'gravel');
    for (let i = 0; i < 2; i++) {
      s.crew.hire(s.session, false, 'operator');
      s.crew.send(s.creek, s.economy, s.region.home.id);
    }
    s.crew.toggleJob(s.creek, 'pan');
    s.crew.toggleJob(s.creek, 'haul');
    s.crew.work(30, { session: s.session, region: s.region, economy: s.economy, playerAt: null });
    expect(s.view().warnings.some((w) => /costs more/.test(w))).toBe(true);
  });

  it('knows when a job burns fuel', () => {
    const s = setup(7);
    s.crew.buyMachine(s.session, 'highbanker', false);
    s.crew.hire(s.session, false, 'operator');
    s.crew.send(s.creek, s.economy, s.region.home.id);
    s.crew.toggleJob(s.creek, 'highbanker');
    expect(s.view().burnsFuel).toBe(true);
  });
});

describe('cost overview', () => {
  it('adds up daily fees and wages and what is owed', () => {
    const s = setup(8);
    s.crew.hire(s.session, false, 'hand');
    s.crew.hire(s.session, false, 'operator');
    s.economy.advance(DAY);
    const c = costOverview(s);
    expect(c.feesPerDay).toBe(2);
    expect(c.wagesPerDay).toBe(37);
    expect(c.feesOwed).toBeCloseTo(2);
    expect(c.wagesOwed).toBe(0); // Paid a day ahead at hiring.
  });
});
