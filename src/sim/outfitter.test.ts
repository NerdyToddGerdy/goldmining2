import { describe, expect, it } from 'vitest';
import type { Creek, DigSpot } from './creek';
import { FUEL_CAN, OUTFITTER, buyFuel, buyGear } from './outfitter';
import { totalMg } from './pan';
import { PanningSession } from './panningSession';
import { Region } from './region';
import { createRng } from './rng';
import { createSave, loadSave } from './save';
import { SLUICE_TUNING, needsPump } from './sluice';

const LOAD = { richness: 6, clayiness: 0.2, rockiness: 0.3 };
const SLUICE_PRICE = OUTFITTER.find((g) => g.id === 'sluice')!.price;

/** A region with the Home Creek plus a creek bend that has at least one sluice site. */
function withBend(seed: number): { region: Region; bend: Creek } {
  const region = new Region(createRng(seed));
  for (let i = 0; i < 300; i++) {
    const result = region.follow(region.clueFound().id);
    if (result.found && result.lead.truth.bend) return { region, bend: result.creek };
  }
  throw new Error('no bend found');
}

/** A region with a stretch whose only sluice site runs on too little water without a pump. */
function withThinSite(seed: number): { region: Region; creek: Creek; spot: DigSpot } {
  const region = new Region(createRng(seed));
  for (let i = 0; i < 300; i++) {
    const result = region.follow(region.clueFound().id);
    const spot = result.found ? result.creek.sluiceSpots.find((s) => needsPump(s.sluiceSite!)) : undefined;
    if (result.found && spot) return { region, creek: result.creek, spot };
  }
  throw new Error('no thin site found');
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
    const concentrate = session.takeDownSluice() as { gold: readonly unknown[] };
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
      if (result.found && result.lead.truth.bend) {
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
    delete v5.session.pumpFuel;
    delete v5.session.fuelCans;
    const loaded = loadSave({ ...v5, version: 4 }, createRng(8))!;
    expect(loaded).not.toBeNull();
    expect(loaded.session.owns('sluice')).toBe(false);
    expect(loaded.session.cash).toBe(12);
  });
});

describe('sluice upgrades', () => {
  it('fit only a sluice that is already owned', () => {
    const session = new PanningSession(createRng(10));
    session.cash = 500;
    for (const id of ['riffleMat', 'legs', 'pump'] as const) {
      expect(buyGear(session, id)).toBe('needsBase');
      expect(session.owns(id)).toBe(false);
    }
    expect(session.cash).toBe(500);
    buyGear(session, 'sluice');
    for (const id of ['riffleMat', 'legs', 'pump'] as const) expect(buyGear(session, id)).toBe('bought');
    expect(session.sluiceKit).toEqual({ improvedMat: true, legs: true, pump: { fuel: 0 } });
  });

  it('take effect on a sluice already set up', () => {
    const { bend } = withBend(11);
    const session = new PanningSession(createRng(11));
    session.cash = 500;
    buyGear(session, 'sluice');
    const site = bend.sluiceSpots[0]!;
    session.setUpSluice(bend.id, site);
    const sluice = session.sluiceAt(bend.id, site.id)!;
    sluice.setSlope(site.sluiceSite!.slope + 0.2);
    expect(sluice.slope).toBe(site.sluiceSite!.slope);
    buyGear(session, 'legs');
    sluice.setSlope(site.sluiceSite!.slope + 0.2);
    expect(sluice.slope).toBeCloseTo(Math.min(1, site.sluiceSite!.slope + 0.2));
  });

  it("don't create sluice sites: legs and a pump still won't set up on the Home Creek", () => {
    const region = new Region(createRng(12));
    const session = new PanningSession(createRng(12));
    session.cash = 500;
    for (const id of ['sluice', 'legs', 'pump'] as const) buyGear(session, id);
    for (const spot of region.home.spots) expect(session.setUpSluice(region.home.id, spot)).toBe('noSite');
  });

  it('a thin-water site needs the pump, and the pump needs fuel', () => {
    const { creek, spot } = withThinSite(13);
    const session = new PanningSession(createRng(13));
    session.cash = 500;
    buyGear(session, 'sluice');
    expect(session.setUpSluice(creek.id, spot)).toBe('needsPump');
    expect(buyFuel(session)).toBe('noPump');
    buyGear(session, 'pump');
    expect(session.setUpSluice(creek.id, spot)).toBe('set');
    const sluice = session.sluiceAt(creek.id, spot.id)!;
    expect(sluice.usesPump).toBe(true);
    // Dry, it runs on the creek's trickle: underpowered.
    expect(sluice.step(0.1, { flow: 1 }).state).toBe('underpowered');
    expect(session.refuelPump()).toBe('noCans');
    for (let i = 0; i < FUEL_CAN.carryLimit; i++) expect(buyFuel(session)).toBe('bought');
    expect(buyFuel(session)).toBe('full');
    expect(session.refuelPump()).toBe('refuelled');
    expect(session.refuelPump()).toBe('full');
    const pumped = sluice.step(0.1, { flow: 0.75 });
    expect(pumped.pumping).toBe(true);
    expect(pumped.state).not.toBe('underpowered');
    // Run it until the tank is dry: the water drops back to a trickle mid-run.
    let t = 0;
    while (sluice.step(0.5, { flow: 0.75 }).pumping) t += 0.5;
    expect(t).toBeGreaterThan(SLUICE_TUNING.pumpTank * 0.9);
    expect(t).toBeLessThan(SLUICE_TUNING.pumpTank * 1.5);
    expect(sluice.step(0.1, { flow: 0.75 }).state).toBe('underpowered');
  });

  it('keep the fuel, cans, slope and gear through a save', () => {
    const { region, bend } = withBend(14);
    const session = new PanningSession(createRng(14));
    session.cash = 500;
    for (const id of ['sluice', 'legs', 'pump', 'riffleMat'] as const) buyGear(session, id);
    buyFuel(session);
    buyFuel(session);
    session.refuelPump();
    session.sluiceKit.pump!.fuel = 33;
    const site = bend.sluiceSpots[0]!;
    session.setUpSluice(bend.id, site);
    session.sluiceAt(bend.id, site.id)!.setSlope(site.sluiceSite!.slope - 0.1);
    const save = JSON.parse(JSON.stringify(createSave(region, session, { screen: 'sluice', creekId: bend.id, spotId: site.id }, 0)));
    const loaded = loadSave(save, createRng(15))!;
    expect(loaded.session.snapshot()).toEqual(session.snapshot());
    expect(loaded.session.fuelCans).toBe(1);
    expect(loaded.session.sluiceKit).toEqual(session.sluiceKit);
    const restored = loaded.session.sluiceAt(bend.id, site.id)!;
    expect(restored.slope).toBeCloseTo(site.sluiceSite!.slope - 0.1);
    // The restored sluice shares the session's kit, so refuelling reaches it.
    expect(restored.kit).toBe(loaded.session.sluiceKit);
  });

  it('migrate from a version 7 save: no pump, no fuel, and a set-up sluice keeps its slope', () => {
    const { region, bend } = withBend(16);
    const session = new PanningSession(createRng(16));
    session.cash = 40;
    buyGear(session, 'sluice');
    const site = bend.sluiceSpots[0]!;
    session.setUpSluice(bend.id, site);
    const v8 = JSON.parse(JSON.stringify(createSave(region, session, { screen: 'creek', creekId: bend.id, spotId: site.id }, 0)));
    delete v8.session.pumpFuel;
    delete v8.session.fuelCans;
    delete v8.session.sluice.state.slope;
    for (const creek of v8.region.creeks) delete creek.profile.pumpSites;
    const loaded = loadSave({ ...v8, version: 7 }, createRng(17))!;
    expect(loaded).not.toBeNull();
    expect(loaded.session.fuelCans).toBe(0);
    expect(loaded.session.sluiceKit.pump).toBeNull();
    expect(loaded.session.sluiceAt(bend.id, site.id)!.slope).toBe(site.sluiceSite!.slope);
    for (const creek of loaded.region.creeks) expect(creek.profile.pumpSites).toBe(0);
  });
});
