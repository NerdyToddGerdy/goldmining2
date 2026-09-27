import { describe, expect, it } from 'vitest';
import type { Creek } from './creek';
import { ECONOMY_TUNING } from './economy';
import { buyGear } from './outfitter';
import { PanningSession } from './panningSession';
import { Region } from './region';
import { createRng } from './rng';
import { createSave, loadSave } from './save';
import { SITE_TRAITS, siteAllows, type SiteKind } from './sites';

/** Found stretches of one kind, by forcing the truth of fresh leads. */
function stretches(seed: number, site: SiteKind, count: number): { region: Region; creeks: Creek[] } {
  const region = new Region(createRng(seed));
  const creeks: Creek[] = [];
  while (creeks.length < count) {
    const lead = region.clueFound();
    (lead as { truth: unknown }).truth = { real: true, richness: 1.3, site };
    const result = region.follow(lead.id);
    if (result.found) creeks.push(result.creek);
  }
  return { region, creeks };
}

const loads = (creek: Creek, kind: string): number =>
  creek.creekSpots.reduce((n, s) => n + s.layers.filter((l) => l.kind === kind).reduce((m, l) => m + l.initialLoads, 0), 0) / creek.creekSpots.length;

const richness = (creek: Creek, kind: string): number => {
  const layers = creek.creekSpots.flatMap((s) => s.layers.filter((l) => l.kind === kind));
  return layers.reduce((n, l) => n + l.richness, 0) / layers.length;
};

describe('site kinds', () => {
  it('gate gear by the ground: no rocker in a ravine, no panning in a dry wash, nothing but the pan at home', () => {
    const { region, creeks } = stretches(1, 'ravine', 1);
    expect(region.allows(creeks[0]!, 'rocker')).toBe(false);
    expect(region.allows(creeks[0]!, 'classifier')).toBe(true);
    expect(siteAllows('dryWash', 'pan')).toBe(false);
    expect(siteAllows('dryWash', 'rocker')).toBe(true);
    expect(siteAllows('gravelBar', 'rocker')).toBe(true);
    for (const gear of ['classifier', 'rocker', 'magnet'] as const) expect(region.allows(region.home, gear)).toBe(false);
    expect(region.allows(region.home, 'pan')).toBe(true);
  });

  it('give a gravel bar more spots, thin overburden and several steady sluice sites', () => {
    const bars = stretches(2, 'gravelBar', 20).creeks;
    const plain = stretches(2, 'creekStretch', 20).creeks;
    const mean = (cs: Creek[], f: (c: Creek) => number): number => cs.reduce((n, c) => n + f(c), 0) / cs.length;
    expect(mean(bars, (c) => c.creekSpots.length)).toBeGreaterThan(mean(plain, (c) => c.creekSpots.length) + 2);
    expect(mean(bars, (c) => loads(c, 'overburden'))).toBeLessThan(mean(plain, (c) => loads(c, 'overburden')) * 0.7);
    for (const bar of bars) expect(bar.sluiceSpots.length).toBeGreaterThanOrEqual(2);
  });

  it('give a ravine few spots, rich bedrock pockets, and shaky walls', () => {
    const ravines = stretches(3, 'ravine', 20).creeks;
    const plain = stretches(3, 'creekStretch', 20).creeks;
    const mean = (cs: Creek[], f: (c: Creek) => number): number => cs.reduce((n, c) => n + f(c), 0) / cs.length;
    expect(mean(ravines, (c) => c.creekSpots.length)).toBeLessThan(3.1);
    expect(mean(ravines, (c) => richness(c, 'bedrock'))).toBeGreaterThan(mean(plain, (c) => richness(c, 'bedrock')) * 1.5);
    const instability = (c: Creek): number => c.creekSpots.reduce((n, spot) => n + spot.instability, 0) / c.creekSpots.length;
    expect(mean(ravines, instability)).toBeGreaterThan(mean(plain, instability));
  });

  it('give a dry wash no sluice sites and no water seeping into holes', () => {
    for (const wash of stretches(4, 'dryWash', 10).creeks) {
      expect(wash.sluiceSpots).toHaveLength(0);
      for (const spot of wash.creekSpots) expect(spot.waterTable).toBe(0);
    }
  });

  it('flood gravel bars now and then: holes buried, worked-out ground refreshed, a sluice there stripped', () => {
    const { region, creeks } = stretches(5, 'gravelBar', 1);
    const bar = creeks[0]!;
    const session = new PanningSession(createRng(5));
    session.cash = 40;
    buyGear(session, 'sluice');
    const site = bar.sluiceSpots[0]!;
    session.setUpSluice(bar.id, site);
    const sluice = session.sluiceAt(bar.id, site.id)!;
    for (let i = 0; i < 6; i++) {
      sluice.feed({ richness: 6, clayiness: 0.2, rockiness: 0.3 });
      for (let t = 0; t < 2.5; t += 1 / 30) sluice.step(1 / 30, { flow: 0.75 });
    }
    const held = sluice.mossGoldCount;
    // Work one spot out and start another.
    const [done, started] = bar.creekSpots;
    while (!bar.isWorkedOut(done!)) (done!.boulder = null, (done!.water = 0), bar.shovel(done!.id, 'spoil'));
    started!.boulder = null;
    bar.shovel(started!.id, 'spoil');
    const slumpedBefore = started!.slumped;
    let days = 0;
    while (region.weather(ECONOMY_TUNING.daySeconds, session).length === 0) days++;
    expect(days).toBeLessThan(60);
    expect(bar.isWorkedOut(done!)).toBe(false);
    expect(started!.slumped).toBeGreaterThan(slumpedBefore);
    expect(sluice.mossGoldCount).toBeLessThan(held);
    expect(sluice.jammed).toBe(true);
    // Only gravel bars flood.
    const { region: other } = stretches(6, 'creekBend', 3);
    for (let d = 0; d < 200; d++) expect(other.weather(ECONOMY_TUNING.daySeconds, session)).toHaveLength(0);
  });

  it('floods about as often as the bar says', () => {
    const { region } = stretches(7, 'gravelBar', 1);
    const session = new PanningSession(createRng(7));
    let floods = 0;
    for (let d = 0; d < 1000; d++) floods += region.weather(ECONOMY_TUNING.daySeconds, session).length;
    expect(floods / 1000).toBeCloseTo(SITE_TRAITS.gravelBar.floodPerDay, 1);
  });

  it('come into a version 11 save as the Home Creek, plain stretches, and bends', () => {
    const { region } = stretches(8, 'creekBend', 1);
    region.follow(region.clueFound().id);
    const session = new PanningSession(createRng(8));
    const save = JSON.parse(JSON.stringify(createSave(region, session, { screen: 'creek', creekId: region.home.id, spotId: null }, 0)));
    for (const creek of save.region.creeks) delete creek.profile.site;
    for (const lead of save.region.leads) {
      lead.truth.bend = lead.truth.site === 'creekBend';
      delete lead.truth.site;
    }
    const loaded = loadSave({ ...save, version: 11 }, createRng(9))!;
    expect(loaded).not.toBeNull();
    expect(loaded.region.home.profile.site).toBe('homeCreek');
    for (const creek of loaded.region.creeks.slice(1)) {
      expect(creek.profile.site).toBe(creek.profile.sluiceSites > 0 ? 'creekBend' : 'creekStretch');
    }
    for (const lead of loaded.region.leads) expect(['creekBend', 'creekStretch']).toContain(lead.truth.site);
  });
});
