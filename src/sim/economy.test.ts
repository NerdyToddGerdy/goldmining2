import { describe, expect, it } from 'vitest';
import { ECONOMY_TUNING, Economy, feeFor, payDebt } from './economy';
import { Crew } from './staffing';
import { buyGear } from './outfitter';
import { PanningSession } from './panningSession';
import { Region } from './region';
import { createRng } from './rng';
import { createSave, loadSave } from './save';

const DAY = ECONOMY_TUNING.daySeconds;

function withStretches(seed: number, count: number): { region: Region; economy: Economy; session: PanningSession } {
  const region = new Region(createRng(seed));
  while (region.creeks.length < count + 1) region.follow(region.clueFound().id);
  const economy = new Economy();
  economy.stakeFound(region);
  return { region, economy, session: new PanningSession(createRng(seed)) };
}

describe('claims and fees', () => {
  it('stake every found stretch but never the Home Creek, which is always workable and free', () => {
    const { region, economy } = withStretches(1, 3);
    expect(economy.claim(region.home.id)).toBeNull();
    expect(economy.allClaims).toHaveLength(3);
    economy.advance(DAY * 50);
    expect(economy.canWork(region.home.id)).toBe(true);
  });

  it('charge by the ground: more where a sluice fits, most for a gravel bar, nothing for the Home Creek', () => {
    const plain = feeFor({ site: 'creekStretch', sluiceSites: 0, pumpSites: 0 });
    const bend = feeFor({ site: 'creekBend', sluiceSites: 1, pumpSites: 0 });
    expect(bend).toBeGreaterThan(plain);
    expect(feeFor({ site: 'creekStretch', sluiceSites: 0, pumpSites: 1 })).toBe(bend);
    expect(feeFor({ site: 'gravelBar', sluiceSites: 2, pumpSites: 0 })).toBeGreaterThan(bend);
    expect(feeFor({ site: 'homeCreek', sluiceSites: 0, pumpSites: 0 })).toBe(0);
  });

  it('run up fees by the game day, and lapse past the grace period', () => {
    const { region, economy } = withStretches(2, 1);
    const claim = economy.claim(region.creeks[1]!.id)!;
    economy.advance(DAY * 2);
    expect(claim.owed).toBeCloseTo(claim.fee * 2);
    expect(economy.canWork(claim.creekId)).toBe(true);
    expect(economy.day).toBe(3);
    economy.advance(DAY * (ECONOMY_TUNING.graceDays - 1) + 1);
    expect(economy.isLapsed(claim)).toBe(true);
    expect(economy.canWork(claim.creekId)).toBe(false);
    expect(economy.anyLapsed).toBe(true);
  });

  it('are paid from cash as far as it goes, and paying up makes a lapsed claim workable again', () => {
    const { region, economy, session } = withStretches(3, 2);
    economy.advance(DAY * 5);
    const owed = economy.feesOwed;
    session.cash = 3;
    expect(economy.payFees(session)).toBeCloseTo(3);
    expect(session.cash).toBe(0);
    expect(economy.feesOwed).toBeCloseTo(owed - 3);
    session.cash = 100;
    economy.payFees(session);
    expect(economy.feesOwed).toBe(0);
    expect(session.cash).toBeCloseTo(100 - (owed - 3));
    for (const creek of region.creeks.slice(1)) expect(economy.canWork(creek.id)).toBe(true);
  });

  it('clear their debt when released, but not while the sluice is there; re-staking costs the recording fee', () => {
    const { region, economy, session } = withStretches(4, 2);
    let bend = region.creeks.find((c) => c.sluiceSpots.some((s) => s.sluiceSite!.flow >= 0.4));
    for (let i = 0; !bend && i < 300; i++) {
      const r = region.follow(region.clueFound().id);
      if (r.found && r.lead.truth.site === 'creekBend') bend = r.creek;
    }
    economy.stakeFound(region);
    session.cash = 40;
    buyGear(session, 'sluice');
    session.setUpSluice(bend!.id, bend!.sluiceSpots.find((s) => s.sluiceSite!.flow >= 0.4)!);
    economy.advance(DAY * 10);
    expect(economy.release(bend!.id, session)).toBe('sluiceThere');
    session.takeDownSluice();
    expect(economy.release(bend!.id, session)).toBe('released');
    const claim = economy.claim(bend!.id)!;
    expect(claim.owed).toBe(0);
    expect(economy.canWork(bend!.id)).toBe(false);
    economy.advance(DAY * 10);
    expect(claim.owed).toBe(0); // Released claims owe nothing.
    session.cash = 4;
    expect(economy.restake(bend!.id, session, false)).toBe('cantAfford');
    session.cash = 20;
    expect(economy.restake(bend!.id, session, true)).toBe('restricted');
    expect(economy.restake(bend!.id, session, false)).toBe('staked');
    expect(session.cash).toBe(20 - ECONOMY_TUNING.restakeFee);
    expect(economy.canWork(bend!.id)).toBe(true);
  });

  it('come into a version 8 save as staked, paid-up claims at the start of the clock', () => {
    const { region, session } = withStretches(5, 3);
    const v9 = JSON.parse(JSON.stringify(createSave(region, session, { screen: 'creek', creekId: region.home.id, spotId: null }, 0)));
    delete v9.economy;
    delete v9.crew;
    const loaded = loadSave({ ...v9, version: 8 }, createRng(6))!;
    expect(loaded).not.toBeNull();
    expect(loaded.economy.clock).toBe(0);
    expect(loaded.economy.allClaims.map((c) => c.creekId).sort()).toEqual(region.creeks.slice(1).map((c) => c.id).sort());
    expect(loaded.economy.feesOwed).toBe(0);
    expect(loaded.crew.hand).toBeNull();
  });
});

describe('paying what is owed', () => {
  it('never strands a fraction of a cent: paying in full clears it to zero', () => {
    for (const owed of [0.001, 0.004, 0.005, 0.006, 0.0099, 1.234, 7.1, 12.009]) {
      const { paid, left } = payDebt(owed, 100);
      expect(left).toBe(0);
      expect(paid).toBeGreaterThanOrEqual(owed);
      expect(paid - owed).toBeLessThan(0.01);
      expect(Math.round(paid * 100)).toBeCloseTo(paid * 100, 6);
    }
  });

  it('pays what cash allows in whole cents, and leaves the rest owed', () => {
    expect(payDebt(5, 3.456)).toEqual({ paid: 3.45, left: 5 - 3.45 });
    expect(payDebt(0.006, 0)).toEqual({ paid: 0, left: 0.006 });
    expect(payDebt(0, 10)).toEqual({ paid: 0, left: 0 });
  });

  it('clears a sub-cent claim fee and a sub-cent wage balance for good', () => {
    const { region, economy, session } = withStretches(7, 1);
    const claim = economy.claim(region.creeks[1]!.id)!;
    claim.owed = 0.006;
    session.cash = 5;
    expect(economy.payFees(session)).toBe(0.01);
    expect(claim.owed).toBe(0);
    expect(session.cash).toBe(4.99);
    const crew = new Crew(createRng(7));
    crew.wagesOwed = 0.006;
    expect(crew.wagesOverdue).toBe(true);
    expect(crew.payWages(session)).toBe(0.01);
    expect(crew.wagesOwed).toBe(0);
    expect(crew.wagesOverdue).toBe(false);
  });
});
