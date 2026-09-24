import { describe, expect, it } from 'vitest';
import { Creek, HOME_CREEK_PROFILE, type DigSpot } from './creek';
import { width, midpoint } from './estimate';
import { PanningSession } from './panningSession';
import { LEAD_SOURCES, Region, REGION_TUNING, type LeadSource } from './region';
import { createRng } from './rng';

const spotValue = (spot: DigSpot): number => {
  const loads = spot.layers.reduce((n, l) => n + l.initialLoads, 0);
  return spot.layers.reduce((mg, l) => mg + l.richness * l.initialLoads, 0) / loads;
};

describe('colour trail', () => {
  it('makes ground just below a source gully richer than ground above it', () => {
    let below = 0;
    let above = 0;
    let nBelow = 0;
    let nAbove = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const creek = new Creek(createRng(seed), undefined, HOME_CREEK_PROFILE);
      const mouth = creek.gullySpots.find((s) => s.gully?.source)!.position;
      for (const spot of creek.creekSpots) {
        if (spot.position > mouth && spot.position - mouth < 0.1) {
          below += spotValue(spot);
          nBelow++;
        } else if (spot.position < mouth) {
          above += spotValue(spot);
          nAbove++;
        }
      }
    }
    expect(below / nBelow).toBeGreaterThan((above / nAbove) * 1.8);
  });

  it('gives the Home Creek gullies, exactly one of them a source', () => {
    const creek = new Creek(createRng(3));
    expect(creek.gullySpots).toHaveLength(2);
    expect(creek.gullySpots.filter((s) => s.gully?.source)).toHaveLength(1);
    expect(creek.creekSpots).toHaveLength(6);
  });

  it('makes a barren gully pan poor and a source gully pan rich', () => {
    const creek = new Creek(createRng(4));
    const source = creek.gullySpots.find((s) => s.gully?.source)!;
    const barren = creek.gullySpots.find((s) => !s.gully?.source)!;
    expect(spotValue(source)).toBeGreaterThan(spotValue(barren) * 5);
  });
});

describe('Region leads', () => {
  it('turns colour from a source gully into a followed lead and a new creek, once', () => {
    const region = new Region(createRng(5));
    const source = region.home.gullySpots.find((s) => s.gully?.source)!;
    const barren = region.home.gullySpots.find((s) => !s.gully?.source)!;
    expect(region.traceGully(barren)).toBeNull();
    const result = region.traceGully(source)!;
    expect(result.found).toBe(true);
    expect(result.lead.source).toBe('colourTrail');
    expect(region.creeks).toHaveLength(2);
    expect(region.traceGully(source)).toBeNull();
  });

  it('makes found stretches finite: they do not renew with high water', () => {
    const region = new Region(createRng(6));
    const result = region.traceGully(region.home.gullySpots.find((s) => s.gully?.source)!)!;
    if (!result.found) throw new Error('trail leads are always real');
    const creek = result.creek;
    expect(creek.profile.renewing).toBe(false);
    for (let i = 0; i < 500; i++) {
      const spot = creek.creekSpots.find((s) => !creek.isWorkedOut(s));
      if (!spot) break;
      while (spot.boulder) creek.pry(spot.id);
      while (spot.water >= 1) creek.bail(spot.id);
      creek.shovel(spot.id, 'spoil');
    }
    expect(creek.creekSpots.every((s) => creek.isWorkedOut(s))).toBe(true);
    expect(creek.highWaterEvents).toBe(0);
  });

  it('stocks the claims board and restocks only after enough panning', () => {
    const region = new Region(createRng(7));
    expect(region.restockOffers(0)).toBe(true);
    expect(region.offers).toHaveLength(REGION_TUNING.offerCount);
    expect(region.restockOffers(REGION_TUNING.offerRefreshPans - 1)).toBe(false);
    expect(region.restockOffers(REGION_TUNING.offerRefreshPans)).toBe(true);
  });

  it('sells leads for cash, and not on credit', () => {
    const region = new Region(createRng(8));
    region.restockOffers(0);
    const session = new PanningSession(createRng(8));
    const offer = region.offers[0]!;
    session.cash = offer.price - 0.01;
    expect(region.buy(offer.lead.id, session)).toBeNull();
    session.cash = offer.price + 1;
    expect(region.buy(offer.lead.id, session)).toBe(offer.lead);
    expect(session.cash).toBeCloseTo(1);
    expect(region.leads).toContain(offer.lead);
    expect(region.offers).not.toContain(offer);
  });

  it('follows real leads to new creeks and marks duds', () => {
    const region = new Region(createRng(9));
    let found = 0;
    let duds = 0;
    for (let i = 0; i < 60; i++) {
      const lead = region.clueFound();
      const result = region.follow(lead.id);
      if (result.found) {
        found++;
        expect(result.creek.profile.name).toBe(lead.name);
        expect(lead.status).toBe('followed');
      } else {
        duds++;
        expect(lead.status).toBe('dud');
      }
    }
    expect(found).toBeGreaterThan(0);
    expect(duds).toBeGreaterThan(0);
    expect(region.creeks).toHaveLength(1 + found);
  });

  it('gives better sources narrower estimates and fewer duds, and never an exact estimate', () => {
    const stats = (source: LeadSource) => {
      const region = new Region(createRng(10));
      let real = 0;
      let relWidth = 0;
      const n = 400;
      for (let i = 0; i < n; i++) {
        const lead = (region as unknown as { makeLead(s: LeadSource): { truth: { real: boolean }; richness: { low: number; high: number } } }).makeLead(source);
        if (lead.truth.real) real++;
        relWidth += width(lead.richness) / midpoint(lead.richness);
        expect(width(lead.richness)).toBeGreaterThan(0);
      }
      return { real: real / n, relWidth: relWidth / n };
    };
    const rumour = stats('rumour');
    const map = stats('mapFragment');
    expect(map.real).toBeGreaterThan(rumour.real + 0.2);
    expect(map.relWidth).toBeLessThan(rumour.relWidth);
    expect(LEAD_SOURCES.mapFragment.price[0]).toBeGreaterThan(LEAD_SOURCES.rumour.price[1]);
  });
});

describe('clues while digging', () => {
  it('turn up occasionally on the creek, never in a gully', () => {
    const creek = new Creek(createRng(11));
    let clues = 0;
    let digs = 0;
    for (let i = 0; i < 5000; i++) {
      const spot = creek.creekSpots.find((s) => !creek.isWorkedOut(s))!;
      while (spot.boulder) creek.pry(spot.id);
      while (spot.water >= 1) creek.bail(spot.id);
      const r = creek.shovel(spot.id, 'spoil');
      if (r.ok) {
        digs++;
        if (r.clue) clues++;
      }
    }
    expect(clues / digs).toBeGreaterThan(0.004);
    expect(clues / digs).toBeLessThan(0.03);
    const gully = creek.gullySpots[0]!;
    for (let i = 0; i < 20 && !creek.isWorkedOut(gully); i++) {
      while (gully.boulder) creek.pry(gully.id);
      while (gully.water >= 1) creek.bail(gully.id);
      const r = creek.shovel(gully.id, 'spoil');
      if (r.ok) expect(r.clue).toBe(false);
    }
  });
});
