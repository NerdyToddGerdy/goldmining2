import { describe, expect, it } from 'vitest';
import type { Creek } from './creek';
import { ECONOMY_TUNING, Economy } from './economy';
import { Highbanker } from './highbanker';
import { buyGear, buyRepairKit } from './outfitter';
import { totalMg } from './pan';
import { PanningSession } from './panningSession';
import { Region } from './region';
import { createRng } from './rng';
import { createSave, loadSave } from './save';
import type { SiteKind } from './sites';
import { Sluice, bareKit } from './sluice';
import { Crew } from './staffing';
import { REPAIR_KIT, WEAR_TUNING, wearWord, wornKeep } from './wear';

const DAY = ECONOMY_TUNING.daySeconds;
const LOAD = { richness: 4, clayiness: 0.1, rockiness: 0.3 };

/** Feed a sluice at a given water power until it has taken `loads` shovelfuls, stepping it along. */
function run(sluice: Sluice, loads: number, flow: number): void {
  for (let i = 0; i < loads; i++) {
    while (sluice.feedBlocked) sluice.step(0.1, { flow });
    sluice.feed(LOAD);
    for (let t = 0; t < 6; t += 0.1) sluice.step(0.1, { flow });
  }
}

function found(seed: number, site: SiteKind): { region: Region; creek: Creek; session: PanningSession; economy: Economy; crew: Crew } {
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
  return { region, creek, session, economy, crew: new Crew(createRng(seed)) };
}

describe('machine wear', () => {
  it('wears a sluice with every load, faster run too hard', () => {
    const site = { slope: 0.5, flow: 1, scale: 1 };
    const steady = new Sluice(createRng(1), site, undefined, bareKit());
    const hard = new Sluice(createRng(1), site, undefined, bareKit());
    run(steady, 20, 0.5);
    run(hard, 20, 1);
    expect(steady.wear).toBeGreaterThan(0);
    expect(hard.wear).toBeGreaterThan(steady.wear * 1.1);
  });

  it('a worn machine keeps less of the fine gold, and hardly less of the pickers', () => {
    expect(wornKeep(0, 'fine')).toBe(1);
    expect(wornKeep(1, 'fine')).toBeCloseTo(1 - WEAR_TUNING.maxLoss.fine);
    expect(wornKeep(1, 'picker')).toBeGreaterThan(0.9);
    // In the sluice itself: the same gravel through a worn box loses more.
    const lostShare = (wear: number): number => {
      let lost = 0;
      let fed = 0;
      for (let seed = 1; seed <= 10; seed++) {
        const s = new Sluice(createRng(seed), { slope: 0.5, flow: 1, scale: 1 }, undefined, bareKit());
        s.wear = wear;
        run(s, 6, 0.5);
        s.wear = wear; // hold it there while measuring
        lost += totalMg(s.lost);
        fed += s.fedMg;
      }
      return lost / fed;
    };
    expect(lostShare(1)).toBeGreaterThan(lostShare(0) + 0.1);
  });

  it('words, never numbers', () => {
    expect(wearWord(0)).toBe('sound');
    expect(wearWord(0.4)).toBe('wearing');
    expect(wearWord(0.8)).toBe('worn');
    expect(wearWord(1.2)).toBe('worn out');
  });

  it('a highbanker engine wears with its hours and seizes; a kit puts it right', () => {
    const hb = new Highbanker(createRng(2));
    hb.refuel();
    hb.engineWear = 0.999;
    hb.prime();
    hb.start();
    for (let t = 0; t < 10 && hb.running; t += 0.1) hb.step(0.1, 1);
    expect(hb.seized).toBe(true);
    expect(hb.start()).toBe('seized');
    const session = new PanningSession(createRng(2));
    expect(session.service(hb)).toBe(false);
    session.cash = 20;
    expect(buyRepairKit(session)).toBe('bought');
    expect(session.cash).toBe(20 - REPAIR_KIT.price);
    expect(session.service(hb)).toBe(true);
    expect(session.repairKits).toBe(0);
    expect(hb.seized).toBe(false);
    expect(hb.sluice.wear).toBe(0);
    expect(hb.start()).not.toBe('seized');
  });

  it('only so many kits can be carried', () => {
    const session = new PanningSession(createRng(3));
    session.cash = 100;
    for (let i = 0; i < REPAIR_KIT.carryLimit; i++) expect(buyRepairKit(session)).toBe('bought');
    expect(buyRepairKit(session)).toBe('full');
  });
});

describe('crews and wear', () => {
  it('a crew services worn machines with the player’s kits, and stands a seized engine idle without one', () => {
    const w = found(4, 'creekBend');
    buyGear(w.session, 'sluice');
    const spot = w.creek.sluiceSpots[0]!;
    w.session.setUpSluice(w.creek.id, spot);
    w.crew.hire(w.session, false, 'operator');
    w.crew.send(w.creek, w.economy, w.region.home.id);
    w.crew.toggleJob(w.creek, 'sluice');
    const sluice = w.session.sluiceAt(w.creek.id, spot.id)!;
    sluice.wear = 0.9;
    w.session.repairKits = 1;
    const world = { session: w.session, region: w.region, economy: w.economy, playerAt: null };
    w.crew.work(1, world);
    expect(w.session.repairKits).toBe(0);
    expect(sluice.wear).toBeLessThan(0.1);

    const hb = found(5, 'creekBend');
    hb.crew.buyMachine(hb.session, 'highbanker', false);
    hb.session.fuelCans = 3;
    hb.crew.hire(hb.session, false, 'operator');
    hb.crew.send(hb.creek, hb.economy, hb.region.home.id);
    hb.crew.toggleJob(hb.creek, 'highbanker');
    const hbWorld = { session: hb.session, region: hb.region, economy: hb.economy, playerAt: null };
    hb.crew.work(1, hbWorld);
    const machine = hb.crew.findSite(hb.creek.id)!.crewHighbanker!.machine;
    machine.stop();
    machine.engineWear = 1;
    hb.crew.work(5, hbWorld);
    expect(hb.crew.findSite(hb.creek.id)!.idle.highbanker).toBe('needsService');
  });

  it('crews at remote stretches cost supplies on top of wages; near ones don’t', () => {
    for (const [site, expected] of [['creekBend', 0], ['ravine', 3], ['dryWash', 4]] as const) {
      const w = found(6, site);
      w.crew.hire(w.session, false, 'hand');
      w.crew.send(w.creek, w.economy, w.region.home.id);
      expect(w.crew.dailySupplies(w.region)).toBe(expected);
      const before = w.crew.wagesOwed;
      w.crew.accrue(DAY, w.region);
      expect(w.crew.wagesOwed - before).toBeCloseTo(w.crew.dailyWages + expected);
    }
  });

  it('keeps wear and kits through a save, and a version 20 save carries no kits', () => {
    const w = found(7, 'creekBend');
    buyGear(w.session, 'sluice');
    const spot = w.creek.sluiceSpots[0]!;
    w.session.setUpSluice(w.creek.id, spot);
    w.session.sluiceAt(w.creek.id, spot.id)!.wear = 0.42;
    w.session.repairKits = 2;
    const save = JSON.parse(JSON.stringify(createSave(w.region, w.session, { screen: 'creek', creekId: w.creek.id, spotId: null }, 0, { economy: w.economy, crew: w.crew })));
    const loaded = loadSave(save, createRng(1))!;
    expect(loaded.session.repairKits).toBe(2);
    expect(loaded.session.sluiceAt(w.creek.id, spot.id)!.wear).toBeCloseTo(0.42);
    delete save.session.repairKits;
    expect(loadSave({ ...save, version: 20 }, createRng(1))!.session.repairKits).toBe(0);
  });
});

