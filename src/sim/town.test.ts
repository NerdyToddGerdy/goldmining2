import { describe, expect, it } from 'vitest';
import type { Creek } from './creek';
import { CREW_TUNING, TOWN_SITE, courierTrip } from './crewJobs';
import { ECONOMY_TUNING, Economy } from './economy';
import { MAGNET_TUNING } from './magnet';
import { totalMg, type GoldPiece } from './pan';
import { PanningSession } from './panningSession';
import { Region } from './region';
import { createRng } from './rng';
import { createSave, loadSave } from './save';
import { Crew } from './staffing';

const DAY = ECONOMY_TUNING.daySeconds;

function setup(seed: number): { region: Region; creek: Creek; session: PanningSession; economy: Economy; crew: Crew } {
  const region = new Region(createRng(seed));
  let creek: Creek | null = null;
  while (!creek) {
    const lead = region.clueFound();
    (lead as { truth: unknown }).truth = { real: true, richness: 1.3, site: 'creekStretch' };
    const r = region.follow(lead.id);
    if (r.found) creek = r.creek;
  }
  const session = new PanningSession(createRng(seed));
  session.cash = 500;
  const economy = new Economy();
  economy.stakeFound(region);
  return { region, creek, session, economy, crew: new Crew(createRng(seed)) };
}

let pieceId = 900_000;
function gold(n: number): GoldPiece[] {
  return Array.from({ length: n }, (_, i) => ({ id: pieceId++, size: i % 5 === 0 ? 'flake' : 'fine', mg: i % 5 === 0 ? 0.3 : 0.05 }));
}

function runFor(w: ReturnType<typeof setup>, seconds: number): void {
  const world = { session: w.session, region: w.region, economy: w.economy, playerAt: null };
  for (let t = 0; t < seconds; t += 10) w.crew.work(10, world);
}

describe('the crew in town', () => {
  it('takes the jar into the settling tub, magnetite and all, and pays out the counter to the vial', () => {
    const w = setup(1);
    w.session.jar.blackSand = 0.3;
    w.session.jar.magnetite = 0.18;
    w.session.jar.gold.push(...gold(10));
    expect(w.crew.leaveJar(w.session)).toBeCloseTo(0.3);
    expect(w.session.jar.blackSand).toBe(0);
    expect(w.crew.tub.magnetite).toBeCloseTo(0.18);
    expect(w.crew.tub.gold).toHaveLength(10);
    w.crew.findSite(TOWN_SITE)!.poke.push(...gold(3));
    expect(w.crew.collectCounter(w.session)).toBe(3);
    expect(w.session.vial).toHaveLength(3);
  });

  it('strips the magnetite out of the tub; pushing hard loses more fines to the clump than going carefully', () => {
    const run = (policy: 'careful' | 'push'): { magnetite: number; kept: number } => {
      let magnetite = 0;
      let kept = 0;
      for (let seed = 1; seed <= 8; seed++) {
        const w = setup(seed);
        w.session.jar.blackSand = 0.5;
        w.session.jar.magnetite = 0.5 * MAGNET_TUNING.share;
        const g = gold(40);
        w.session.jar.gold.push(...g);
        w.crew.leaveJar(w.session);
        w.crew.hire(w.session, false, 'hand');
        expect(w.crew.sendToTown()).toBe('sent');
        w.crew.toggleTownJob('magnet');
        w.crew.setPolicy(TOWN_SITE, policy);
        runFor(w, DAY);
        magnetite += w.crew.tub.magnetite ?? 0;
        kept += totalMg(w.crew.tub.gold) / totalMg(g);
      }
      return { magnetite: magnetite / 8, kept: kept / 8 };
    };
    const careful = run('careful');
    const push = run('push');
    expect(careful.magnetite).toBeLessThan(0.3 * MAGNET_TUNING.share * 0.5);
    expect(push.kept).toBeLessThan(careful.kept);
  });

  it('pans the tub down into gold at the counter', () => {
    const w = setup(3);
    w.session.jar.blackSand = 0.4;
    w.session.jar.magnetite = 0;
    w.session.jar.gold.push(...gold(30));
    w.crew.leaveJar(w.session);
    w.crew.hire(w.session, false, 'hand');
    w.crew.sendToTown();
    w.crew.toggleTownJob('finish');
    runFor(w, DAY);
    expect(w.crew.tub.blackSand).toBeLessThan(0.4);
    expect(w.crew.findSite(TOWN_SITE)!.poke.length).toBeGreaterThan(0);
  });

  it('a courier carries the crew bucket and poke to town and walks back', () => {
    const w = setup(4);
    w.crew.hire(w.session, false, 'hand');
    w.crew.send(w.creek, w.economy, w.region.home.id);
    w.crew.toggleJob(w.creek, 'courier');
    const site = w.crew.findSite(w.creek.id)!;
    site.bucket.blackSand = 0.8;
    site.bucket.gold.push(...gold(12));
    site.poke.push(...gold(2));
    runFor(w, 20);
    expect(site.bucket.blackSand).toBe(0);
    const leg = courierTrip(w.creek) / 2;
    runFor(w, leg + 20);
    expect(w.crew.tub.blackSand).toBeCloseTo(0.8);
    expect(w.crew.tub.magnetite).toBeCloseTo(0.8 * MAGNET_TUNING.share);
    expect(w.crew.tub.gold).toHaveLength(12);
    expect(w.crew.findSite(TOWN_SITE)!.poke).toHaveLength(2);
    // Nothing more to carry: it waits.
    runFor(w, leg + 20);
    expect(site.idle.courier).toBe('nothingToFinish');
    expect(CREW_TUNING.courierLoad).toBeGreaterThan(0);
  });

  it('only hands and operators work in town, a couple at most, and it costs no supplies', () => {
    const w = setup(5);
    for (const role of ['hand', 'operator', 'hand', 'foreman'] as const) w.crew.hire(w.session, false, role);
    expect(w.crew.sendToTown('foreman')).toBe('noneFree');
    expect(w.crew.sendToTown()).toBe('sent');
    expect(w.crew.sendToTown()).toBe('sent');
    expect(w.crew.sendToTown()).toBe('full');
    expect(w.crew.dailySupplies(w.region)).toBe(0);
    expect(w.crew.toggleTownJob('sluice')).toBe('doesntFit');
  });

  it('keeps the town station, tub and couriers through a save', () => {
    const w = setup(6);
    w.session.jar.blackSand = 0.2;
    w.session.jar.magnetite = 0.1;
    w.crew.leaveJar(w.session);
    w.crew.hire(w.session, false, 'hand');
    w.crew.sendToTown();
    w.crew.toggleTownJob('magnet');
    runFor(w, 30);
    const save = JSON.parse(JSON.stringify(createSave(w.region, w.session, { screen: 'town', creekId: w.creek.id, spotId: null }, 0, { economy: w.economy, crew: w.crew })));
    const loaded = loadSave(save, createRng(1))!;
    expect(loaded.crew.workersAt(TOWN_SITE)).toHaveLength(1);
    expect(loaded.crew.tub.blackSand).toBeCloseTo(w.crew.tub.blackSand);
    expect(loaded.crew.tub.magnetite).toBeCloseTo(w.crew.tub.magnetite ?? 0);
  });
});
