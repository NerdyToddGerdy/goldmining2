import { describe, expect, it } from 'vitest';
import type { Creek } from './creek';
import { OUTFITTER, buyGear } from './outfitter';
import { totalMg } from './pan';
import { PanningSession } from './panningSession';
import { Region } from './region';
import { createRng } from './rng';
import { createSave, loadSave } from './save';

const LOAD = { richness: 6, clayiness: 0.2, rockiness: 0.3 };
const SLUICE_PRICE = OUTFITTER.find((g) => g.id === 'sluice')!.price;

/** A region with the Home Creek plus a creek bend that has at least one sluice site. */
function withBend(seed: number): { region: Region; bend: Creek } {
  const region = new Region(createRng(seed));
  for (let i = 0; i < 300; i++) {
    const result = region.follow(region.clueFound().id);
    if (result.found && result.creek.sluiceSpots.length > 0) return { region, bend: result.creek };
  }
  throw new Error('no bend found');
}

function runSluice(session: PanningSession, creekId: number, spotId: number, loads: number): void {
  const sluice = session.sluiceAt(creekId, spotId)!;
  for (let i = 0; i < loads; i++) {
    sluice.feed(LOAD);
    for (let t = 0; t < 2.5; t += 1 / 30) sluice.step(1 / 30, { flow: 0.75 });
  }
}

describe('the outfitter', () => {
  it('sells a sluice for $40, once, and not on credit', () => {
    expect(SLUICE_PRICE).toBe(40);
    const session = new PanningSession(createRng(1));
    session.cash = 39.99;
    expect(buyGear(session, 'sluice')).toBe('cantAfford');
    expect(session.owns('sluice')).toBe(false);
    session.cash = 45;
    expect(buyGear(session, 'sluice')).toBe('bought');
    expect(session.cash).toBeCloseTo(5);
    expect(session.owns('sluice')).toBe(true);
    expect(buyGear(session, 'sluice')).toBe('alreadyOwned');
    expect(session.cash).toBeCloseTo(5);
  });
});

describe('setting up the sluice', () => {
  it('needs a sluice to set up, and a sluice site to set it at', () => {
    const { region, bend } = withBend(2);
    const session = new PanningSession(createRng(2));
    const site = bend.sluiceSpots[0]!;
    expect(session.setUpSluice(bend.id, site)).toBe('notOwned');
    session.cash = 40;
    buyGear(session, 'sluice');
    // Owning one doesn't make the Home Creek take it: the ground decides.
    for (const spot of region.home.spots) expect(session.setUpSluice(region.home.id, spot)).toBe('noSite');
    const plain = bend.creekSpots.find((s) => !s.sluiceSite);
    if (plain) expect(session.setUpSluice(bend.id, plain)).toBe('noSite');
    expect(session.sluicePlace).toBeNull();
    expect(session.setUpSluice(bend.id, site)).toBe('set');
    expect(session.sluicePlace).toEqual({ creekId: bend.id, spotId: site.id });
    expect(session.sluiceAt(bend.id, site.id)!.site).toEqual(site.sluiceSite);
  });

  it('washes the moss into the jar when taken down, and tips out the header', () => {
    const { bend } = withBend(3);
    const session = new PanningSession(createRng(3));
    session.cash = 40;
    buyGear(session, 'sluice');
    const site = bend.sluiceSpots[0]!;
    session.setUpSluice(bend.id, site);
    runSluice(session, bend.id, site.id, 6);
    const sluice = session.sluiceAt(bend.id, site.id)!;
    sluice.feed(LOAD); // Gravel left in the header when it comes down.
    const inMoss = sluice.mossGoldCount;
    expect(inMoss).toBeGreaterThan(0);
    const concentrate = session.takeDownSluice()!;
    expect(concentrate.gold).toHaveLength(inMoss);
    expect(session.jar.gold).toHaveLength(inMoss);
    expect(session.sluicePlace).toBeNull();
    expect(session.owns('sluice')).toBe(true);
    expect(totalMg(sluice.lost)).toBeGreaterThan(0);
  });

  it('moves between sites, bringing the moss along in the jar', () => {
    const { region, bend } = withBend(4);
    const session = new PanningSession(createRng(4));
    session.cash = 40;
    buyGear(session, 'sluice');
    const first = bend.sluiceSpots[0]!;
    session.setUpSluice(bend.id, first);
    runSluice(session, bend.id, first.id, 4);
    const caught = session.sluiceAt(bend.id, first.id)!.mossGoldCount;
    // Find a second site, on this bend or another.
    let second = bend.sluiceSpots[1];
    let secondCreek = bend;
    for (let i = 0; !second && i < 300; i++) {
      const result = region.follow(region.clueFound().id);
      if (result.found && result.creek.sluiceSpots.length > 0) {
        secondCreek = result.creek;
        second = result.creek.sluiceSpots[0];
      }
    }
    expect(session.setUpSluice(secondCreek.id, second!)).toBe('set');
    expect(session.sluiceAt(bend.id, first.id)).toBeNull();
    expect(session.sluiceAt(secondCreek.id, second!.id)!.mossGoldCount).toBe(0);
    expect(session.jar.gold).toHaveLength(caught);
  });

  it('survives a save, mid-run, exactly', () => {
    const { region, bend } = withBend(5);
    const session = new PanningSession(createRng(5));
    session.cash = 40;
    buyGear(session, 'sluice');
    const site = bend.sluiceSpots[0]!;
    session.setUpSluice(bend.id, site);
    runSluice(session, bend.id, site.id, 5);
    session.sluiceAt(bend.id, site.id)!.feed(LOAD);
    const save = JSON.parse(JSON.stringify(createSave(region, session, { screen: 'creek', creekId: bend.id, spotId: site.id }, 0)));
    const loaded = loadSave(save, createRng(6))!;
    expect(loaded.session.snapshot()).toEqual(session.snapshot());
    const restored = loaded.session.sluiceAt(bend.id, site.id)!;
    expect(restored.mossGoldCount).toBe(session.sluiceAt(bend.id, site.id)!.mossGoldCount);
    expect(restored.headerVolume).toBeCloseTo(session.sluiceAt(bend.id, site.id)!.headerVolume);
  });

  it('is not owned by anyone loading a version 4 save', () => {
    const region = new Region(createRng(7));
    const session = new PanningSession(createRng(7));
    session.cash = 12;
    const v5 = JSON.parse(JSON.stringify(createSave(region, session, { screen: 'creek', creekId: region.home.id, spotId: null }, 0)));
    delete v5.session.sluice;
    const loaded = loadSave({ ...v5, version: 4 }, createRng(8))!;
    expect(loaded).not.toBeNull();
    expect(loaded.session.owns('sluice')).toBe(false);
    expect(loaded.session.cash).toBe(12);
  });
});
