import { describe, expect, it } from 'vitest';
import { Creek, HOME_CREEK_PROFILE } from './creek';
import { PanningSession } from './panningSession';
import { LEAD_SOURCES, Region, REGION_TUNING, type Lead, type LeadSource } from './region';
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

  it('appear on creek bends found by following a lead, one or two of them', () => {
    const region = new Region(createRng(2));
    let bends = 0;
    let narrows = 0;
    for (let i = 0; i < 200; i++) {
      const result = region.follow(region.clueFound().id);
      if (!result.found) continue;
      const sites = result.creek.sluiceSpots;
      if (result.lead.truth.bend) {
        bends++;
        expect(sites.length).toBeGreaterThanOrEqual(1);
        expect(sites.length).toBeLessThanOrEqual(2);
        for (const spot of sites) {
          expect(spot.gully).toBeNull();
          expect(spot.sluiceSite!.slope).toBeGreaterThan(0);
          expect(spot.sluiceSite!.flow).toBeGreaterThan(0.5);
        }
      } else {
        narrows++;
        expect(sites).toHaveLength(0);
      }
    }
    expect(bends).toBeGreaterThan(20);
    expect(narrows).toBeGreaterThan(bends);
  });

  it('are hinted at by leads: better sources mention real bars more and invent them less', () => {
    const stats = (source: LeadSource) => {
      const region = new Region(createRng(3));
      let bends = 0;
      let bendsMentioned = 0;
      let narrows = 0;
      let narrowsMentioned = 0;
      for (let i = 0; i < 2000; i++) {
        const lead = makeLead(region, source);
        if (lead.truth.bend) {
          bends++;
          if (lead.hint) bendsMentioned++;
        } else {
          narrows++;
          if (lead.hint) narrowsMentioned++;
        }
      }
      return { found: bendsMentioned / bends, invented: narrowsMentioned / narrows, bendShare: bends / 2000 };
    };
    const rumour = stats('rumour');
    const map = stats('mapFragment');
    expect(map.found).toBeGreaterThan(rumour.found);
    expect(map.invented).toBeLessThan(rumour.invented);
    // Hints stay fallible: rumours invent bars, and even maps miss some real ones.
    expect(rumour.invented).toBeGreaterThan(0.1);
    expect(map.found).toBeLessThan(1);
    expect(rumour.bendShare).toBeCloseTo(REGION_TUNING.bendChance, 1);
    expect(LEAD_SOURCES.mapFragment.reliability).toBeGreaterThan(LEAD_SOURCES.rumour.reliability);
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
    // What version 3 wrote: no sluice fields anywhere.
    for (const creek of v4.region.creeks) {
      delete creek.profile.sluiceSites;
      for (const spot of creek.spots) delete spot.sluiceSite;
    }
    for (const lead of [...v4.region.leads, ...v4.region.offers.map((o: { lead: unknown }) => o.lead)]) {
      delete lead.hint;
      delete lead.truth.bend;
    }
    const loaded = loadSave({ ...v4, version: 3 }, createRng(7));
    expect(loaded).not.toBeNull();
    for (const creek of loaded!.region.creeks) {
      expect(creek.profile.sluiceSites).toBe(0);
      expect(creek.sluiceSpots).toHaveLength(0);
    }
    for (const lead of loaded!.region.leads) {
      expect(lead.hint).toBeNull();
      expect(lead.truth.bend).toBe(false);
    }
  });
});
