import { describe, expect, it } from 'vitest';
import type { Creek } from './creek';
import { HIGHBANKER_TUNING } from './highbanker';
import { buyFuel, buyGear } from './outfitter';
import { PanningSession } from './panningSession';
import { Region } from './region';
import { createRng } from './rng';
import { createSave, loadSave } from './save';
import type { SiteKind } from './sites';

function found(region: Region, site: SiteKind): Creek {
  for (;;) {
    const lead = region.clueFound();
    (lead as { truth: unknown }).truth = { real: true, richness: 1.3, site };
    const result = region.follow(lead.id);
    if (result.found) return result.creek;
  }
}

function owner(seed: number): PanningSession {
  const session = new PanningSession(createRng(seed));
  session.cash = 500;
  buyGear(session, 'highbanker');
  return session;
}

describe('setting up the highbanker', () => {
  it('needs strong water and room: bends, bars and ravines, never stretches, dry washes or the Home Creek', () => {
    const region = new Region(createRng(1));
    const session = owner(1);
    for (const site of ['creekBend', 'gravelBar', 'ravine'] as const) {
      const creek = found(region, site);
      expect(session.setUpHighbanker(creek, creek.creekSpots[0]!)).toBe('set');
    }
    for (const site of ['creekStretch', 'dryWash'] as const) {
      const creek = found(region, site);
      expect(session.setUpHighbanker(creek, creek.creekSpots[0]!)).toBe('noRoom');
    }
    expect(session.setUpHighbanker(region.home, region.home.creekSpots[0]!)).toBe('noRoom');
    expect(new PanningSession(createRng(2)).setUpHighbanker(found(region, 'creekBend'), region.home.creekSpots[0]!)).toBe('notOwned');
  });

  it("can't share a spot with the hand sluice", () => {
    const region = new Region(createRng(3));
    const session = owner(3);
    buyGear(session, 'sluice');
    const bend = found(region, 'creekBend');
    const spot = bend.sluiceSpots[0]!;
    expect(session.setUpSluice(bend.id, spot)).toBe('set');
    expect(session.setUpHighbanker(bend, spot)).toBe('occupied');
    session.takeDownSluice();
    expect(session.setUpHighbanker(bend, spot)).toBe('set');
    expect(session.setUpSluice(bend.id, spot)).toBe('occupied');
  });

  it('runs on the same fuel cans as the pump, and keeps its tank when moved', () => {
    const region = new Region(createRng(4));
    const session = owner(4);
    expect(buyFuel(session)).toBe('bought');
    expect(session.refuelHighbanker()).toBe('notSetUp');
    const bar = found(region, 'gravelBar');
    session.setUpHighbanker(bar, bar.creekSpots[0]!);
    expect(session.refuelHighbanker()).toBe('refuelled');
    expect(session.fuelCans).toBe(0);
    const machine = session.highbankerAt(bar.id, bar.creekSpots[0]!.id)!;
    machine.fuel = 42;
    session.setUpHighbanker(bar, bar.creekSpots[1]!);
    expect(session.highbankerAt(bar.id, bar.creekSpots[1]!.id)!.fuel).toBe(42);
    expect(HIGHBANKER_TUNING.tank).toBeGreaterThan(42);
  });

  it('washes its mat into the jar when taken down', () => {
    const region = new Region(createRng(5));
    const session = owner(5);
    const bend = found(region, 'creekBend');
    session.setUpHighbanker(bend, bend.creekSpots[0]!);
    const hb = session.highbankerAt(bend.id, bend.creekSpots[0]!.id)!;
    hb.refuel();
    hb.prime();
    hb.start();
    for (let i = 0; i < 6; i++) {
      hb.feed({ richness: 8, clayiness: 0.2, rockiness: 0.3 });
      for (let t = 0; t < 3; t += 0.05) hb.step(0.05, 0.65);
    }
    const held = hb.sluice.mossGoldCount;
    expect(held).toBeGreaterThan(0);
    session.takeDownHighbanker();
    expect(session.jar.gold).toHaveLength(held);
    expect(session.highbankerPlace).toBeNull();
    expect(session.owns('highbanker')).toBe(true);
  });

  it('survives a save mid-run, packed fuel and all, and nobody has one in a version 12 save', () => {
    const region = new Region(createRng(6));
    const session = owner(6);
    const ravine = found(region, 'ravine');
    session.setUpHighbanker(ravine, ravine.creekSpots[0]!);
    const hb = session.highbankerAt(ravine.id, ravine.creekSpots[0]!.id)!;
    hb.refuel();
    hb.prime();
    hb.start();
    hb.feed({ richness: 8, clayiness: 0.2, rockiness: 0.3 });
    hb.step(1, 0.6);
    const save = JSON.parse(JSON.stringify(createSave(region, session, { screen: 'highbanker', creekId: ravine.id, spotId: ravine.creekSpots[0]!.id }, 0)));
    const loaded = loadSave(save, createRng(7))!;
    expect(loaded.session.snapshot()).toEqual(session.snapshot());
    expect(loaded.place.screen).toBe('highbanker');
    delete save.session.highbanker;
    const old = loadSave({ ...save, version: 12 }, createRng(8))!;
    expect(old.session.owns('highbanker')).toBe(false);
  });
});
