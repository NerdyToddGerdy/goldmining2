import { describe, expect, it } from 'vitest';
import { Creek, HOME_CREEK_PROFILE } from './creek';
import { PanningSession } from './panningSession';
import { needsPump } from './sluice';
import { SITE_ODDS, SITE_TRAITS } from './sites';
import { LEAD_SOURCES, Region, type Lead, type LeadSource } from './region';
import { createRng } from './rng';
import { createSave, loadSave } from './save';

/** Reach into the region to roll leads directly, for statistics. */
const makeLead = (region: Region, source: LeadSource): Lead =>
  (region as unknown as { makeLead(s: LeadSource): Lead }).makeLead(source);

describe('sluice sites', () => {
  it('never appear on the Home Creek, even if its profile asked for them', () => {
    for (let seed = 1; seed <= 50; seed++) {
      expect(new Creek(createRng(seed)).sluiceSpots).toHaveLength(0);
      const greedy = new Creek(createRng(seed), undefined, { ...HOME_CREEK_PROFILE, sluiceSites: 3 });
      expect(greedy.sluiceSpots).toHaveLength(0);
    }
  });

  it('appear where the ground has room and water: bends, bars and ravines, and thin benches on stretches', () => {
    const region = new Region(createRng(2));
    const counts: Record<string, number> = {};
    let thin = 0;
    for (let i = 0; i < 600; i++) {
      const result = region.follow(region.clueFound().id);
      if (!result.found) continue;
      const site = result.lead.truth.site;
      counts[site] = (counts[site] ?? 0) + 1;
      const sites = result.creek.sluiceSpots;
      const [min, max] = SITE_TRAITS[site].sluiceSites;
      for (const spot of sites) expect(spot.gully).toBeNull();
      if (site === 'creekStretch') {
        // At most a thin-water bench, which needs a pump.
        expect(sites.length).toBeLessThanOrEqual(1);
        for (const spot of sites) expect(needsPump(spot.sluiceSite!)).toBe(true);
        if (sites.length) thin++;
      } else {
        expect(sites.length).toBeGreaterThanOrEqual(min);
        expect(sites.length).toBeLessThanOrEqual(max);
        for (const spot of sites) expect(needsPump(spot.sluiceSite!)).toBe(false);
      }
      if (site === 'dryWash') expect(sites).toHaveLength(0);
      if (site === 'ravine') for (const spot of sites) expect(spot.sluiceSite!.slope).toBeGreaterThanOrEqual(0.7);
    }
    expect(counts.creekBend).toBeGreaterThan(40);
    for (const [kind] of SITE_ODDS) expect(counts[kind]).toBeGreaterThan(20);
    expect(thin / counts.creekStretch!).toBeCloseTo(SITE_TRAITS.creekStretch.pumpSiteChance, 1);
  });

  it('are read by every lead, more surely by better sources, never for certain', () => {
    const stats = (source: LeadSource) => {
      const region = new Region(createRng(3));
      let right = 0;
      let named = 0;
      let bends = 0;
      let benches = 0;
      let benchesMentioned = 0;
      let benchesInvented = 0;
      let noBench = 0;
      for (let i = 0; i < 3000; i++) {
        const lead = makeLead(region, source);
        const ground = lead.ground!;
        named += ground.kinds.length;
        if (ground.kinds.includes(lead.truth.site)) right++;
        if (lead.truth.site === 'creekBend') bends++;
        if (lead.truth.bench) {
          benches++;
          if (ground.bench) benchesMentioned++;
        } else {
          noBench++;
          if (ground.bench) benchesInvented++;
        }
      }
      return { right: right / 3000, perLead: named / 3000, bendShare: bends / 3000, benchFound: benchesMentioned / benches, benchInvented: benchesInvented / noBench };
    };
    const rumour = stats('rumour');
    const record = stats('claimRecord');
    const map = stats('mapFragment');
    // Vague sources name two possibilities; firm ones name one, and are right more often.
    expect(rumour.perLead).toBe(2);
    expect(map.perLead).toBe(1);
    expect(map.right).toBeGreaterThan(record.right);
    expect(record.right).toBeGreaterThan(rumour.right - 0.05);
    expect(rumour.right).toBeCloseTo(LEAD_SOURCES.rumour.groundAccuracy, 1);
    // Uncertainty is reduced, never eliminated.
    expect(map.right).toBeLessThan(1);
    // Thin-water benches are mentioned now, more often by better sources, and invented less.
    expect(map.benchInvented).toBeLessThan(rumour.benchInvented + 1e-9);
    expect(map.benchFound).toBeGreaterThan(0.5);
    expect(rumour.bendShare).toBeCloseTo(SITE_ODDS.find(([k]) => k === 'creekBend')![1], 1);
  });

  it('decide the bench before the lead is followed, so the reading and the stretch agree', () => {
    const region = new Region(createRng(9));
    for (let i = 0; i < 300; i++) {
      const lead = region.clueFound();
      (lead as { truth: { real: boolean } }).truth = { ...lead.truth, real: true };
      const result = region.follow(lead.id);
      if (!result.found) continue;
      const hasBench = result.creek.sluiceSpots.some((s) => s.sluiceSite!.flow < 0.4);
      expect(hasBench).toBe(Boolean(lead.truth.bench));
    }
  });

  it('survive a save', () => {
    const rng = createRng(4);
    const region = new Region(rng);
    let creek: Creek | null = null;
    for (let i = 0; i < 100 && !creek; i++) {
      const result = region.follow(region.clueFound().id);
      if (result.found && result.creek.sluiceSpots.length > 0) creek = result.creek;
    }
    const session = new PanningSession(rng);
    const save = JSON.parse(JSON.stringify(createSave(region, session, { screen: 'creek', creekId: creek!.id, spotId: null }, 0)));
    const loaded = loadSave(save, createRng(5))!;
    const restored = loaded.region.creek(creek!.id);
    expect(restored.sluiceSpots.map((s) => s.sluiceSite)).toEqual(creek!.sluiceSpots.map((s) => s.sluiceSite));
    expect(restored.profile.sluiceSites).toBe(creek!.profile.sluiceSites);
  });

  it('are absent from creeks and leads in a version 3 save', () => {
    const rng = createRng(6);
    const region = new Region(rng);
    region.follow(region.clueFound().id);
    region.restockOffers(0);
    const session = new PanningSession(rng);
    const v4 = JSON.parse(JSON.stringify(createSave(region, session, { screen: 'creek', creekId: region.home.id, spotId: null }, 0)));
    delete v4.session.pumpFuel;
    delete v4.session.fuelCans;
    // What version 3 wrote: no sluice fields anywhere.
    for (const creek of v4.region.creeks) {
      delete creek.profile.sluiceSites;
      delete creek.profile.pumpSites;
      for (const spot of creek.spots) delete spot.sluiceSite;
    }
    for (const lead of [...v4.region.leads, ...v4.region.offers.map((o: { lead: unknown }) => o.lead)]) {
      delete lead.hint;
      delete lead.truth.site;
    }
    const loaded = loadSave({ ...v4, version: 3 }, createRng(7));
    expect(loaded).not.toBeNull();
    for (const creek of loaded!.region.creeks) {
      expect(creek.profile.sluiceSites).toBe(0);
      expect(creek.sluiceSpots).toHaveLength(0);
    }
    for (const lead of loaded!.region.leads) {
      expect(lead.ground).toBeNull();
      expect(lead.truth.site).toBe('creekStretch');
    }
  });
});
