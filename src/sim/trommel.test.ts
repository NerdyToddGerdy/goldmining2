import { describe, expect, it } from 'vitest';
import { totalMg } from './pan';
import { createRng } from './rng';
import { TROMMEL_TUNING, Trommel } from './trommel';

const LOAD = { richness: 4, clayiness: 0.6, rockiness: 0.6 };

/** Run a trommel fed every `every` seconds for `seconds`, cleaning out each minute. */
function run(seed: number, speed: number, spray: number, seconds = 180, every = 2.2): { t: Trommel; kept: number; jams: number } {
  const t = new Trommel(createRng(seed));
  t.refuel();
  t.start();
  let kept = 0;
  let jams = 0;
  let next = 0;
  for (let s = 0; s < seconds; s += 0.1) {
    if (s >= next && !t.hopperFull) {
      t.feed(LOAD);
      next = s + every;
    }
    if (t.step(0.1, speed, spray).event === 'jammed') {
      jams += 1;
      t.clearJam();
      t.start();
    }
    if (t.fuel < 20) t.refuel();
    if (Math.round(s * 10) % 600 === 599) kept += totalMg(t.deck.liftMat().gold);
  }
  for (let s = 0; s < 60; s += 0.1) t.step(0.1, speed, spray);
  kept += totalMg(t.deck.liftMat().gold);
  return { t, kept, jams };
}

const share = (speed: number, spray = 0.6): { kept: number; out: number } => {
  let kept = 0;
  let out = 0;
  let fed = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const r = run(seed, speed, spray);
    kept += r.kept;
    out += totalMg(r.t.lostOut);
    fed += r.t.fedMg;
  }
  return { kept: kept / fed, out: out / fed };
};

describe('Trommel', () => {
  it('keeps the most at a tumbling drum: crawling lets clay balls out whole, racing flings fines out the end', () => {
    const crawling = share(0.15);
    const tumbling = share(0.5);
    const racing = share(0.92);
    expect(tumbling.kept).toBeGreaterThan(0.55);
    expect(tumbling.kept).toBeGreaterThan(crawling.kept + 0.2);
    expect(tumbling.kept).toBeGreaterThan(racing.kept + 0.15);
    expect(racing.out).toBeGreaterThan(tumbling.out * 2);
    expect(crawling.out).toBeGreaterThan(tumbling.out * 2);
  });

  it('reads the drum in words', () => {
    const t = new Trommel(createRng(1));
    expect(t.classify(0.1)).toBe('crawling');
    expect(t.classify(0.5)).toBe('tumbling');
    expect(t.classify(0.95)).toBe('racing');
  });

  it('jams overfed; clearing it turns the load out onto the pile, gold and all', () => {
    const t = new Trommel(createRng(2));
    t.refuel();
    t.start();
    let jammed = false;
    for (let s = 0; s < 60 && !jammed; s += 0.1) {
      while (!t.hopperFull) t.feed(LOAD);
      jammed = t.step(0.1, 0.2, 0.2).event === 'jammed';
    }
    expect(jammed).toBe(true);
    expect(t.running).toBe(false);
    expect(t.start()).toBe('jammed');
    const before = t.lostOut.length;
    t.clearJam();
    expect(t.lostOut.length).toBeGreaterThan(before);
    expect(t.start()).toBe('started');
  });

  it('conserves gold: every piece fed is on the deck, lost from it, out the end, or still inside', () => {
    const t = new Trommel(createRng(3));
    t.refuel();
    t.start();
    for (let s = 0; s < 40; s += 0.1) {
      if (Math.round(s * 10) % 25 === 0 && !t.hopperFull) t.feed(LOAD);
      t.step(0.1, 0.55, 0.6);
    }
    const inside = t.snapshot();
    const still = [inside.hopper, inside.drum].reduce((n, l) => n + totalMg(l.gold) + totalMg(l.rocks.flatMap((r) => (r.stuckPicker ? [r.stuckPicker] : []))), 0);
    const onDeck = totalMg(t.deck.snapshot().moss.gold) + totalMg(t.deck.snapshot().header.gold) + totalMg(t.deck.snapshot().header.rocks.flatMap((r) => (r.stuckPicker ? [r.stuckPicker] : [])));
    expect(onDeck + totalMg(t.deck.lost) + totalMg(t.lostOut) + still).toBeCloseTo(t.fedMg, 5);
  });

  it('runs on fuel, wears, and seizes; a kit puts it right', () => {
    const t = new Trommel(createRng(4));
    expect(t.start()).toBe('noFuel');
    t.refuel();
    t.start();
    for (let s = 0; s < TROMMEL_TUNING.tank + 60 && t.running; s += 0.5) t.step(0.5, 1, 1);
    expect(t.running).toBe(false);
    expect(t.fuel).toBe(0);
    t.engineWear = 1;
    t.refuel();
    expect(t.start()).toBe('seized');
    t.service();
    expect(t.wear).toBe(0);
    expect(t.start()).toBe('started');
  });

  it('comes back from a save exactly', () => {
    const { t } = run(5, 0.5, 0.6, 30);
    const back = new Trommel(createRng(5), JSON.parse(JSON.stringify(t.snapshot())));
    expect(back.snapshot()).toEqual(t.snapshot());
  });
});

describe('Trommel with a crew', () => {
  it('an operator runs a crew trommel on a gravel bar into the crew bucket, keeping it clear of jams', async () => {
    const { Region } = await import('./region');
    const { PanningSession } = await import('./panningSession');
    const { Economy, ECONOMY_TUNING } = await import('./economy');
    const { Crew } = await import('./staffing');
    const region = new Region(createRng(7));
    let creek = null as import('./creek').Creek | null;
    while (!creek) {
      const lead = region.clueFound();
      (lead as { truth: unknown }).truth = { real: true, richness: 1.3, site: 'gravelBar' };
      const r = region.follow(lead.id);
      if (r.found) creek = r.creek;
    }
    const session = new PanningSession(createRng(7));
    session.cash = 1000;
    session.fuelCans = 6;
    const economy = new Economy();
    economy.stakeFound(region);
    const crew = new Crew(createRng(7));
    expect(crew.buyMachine(session, 'trommel', false)).toBe('bought');
    crew.hire(session, false, 'operator');
    crew.send(creek, economy, region.home.id);
    expect(crew.toggleJob(creek, 'trommel')).toBe('on');
    const world = { session, region, economy, playerAt: null };
    for (let t = 0; t < ECONOMY_TUNING.daySeconds / 2; t += 10) crew.work(10, world);
    const site = crew.findSite(creek.id)!;
    expect(site.crewTrommel).not.toBeNull();
    expect(site.report.shovelfuls).toBeGreaterThan(20);
    expect(site.report.cleanouts).toBeGreaterThan(0);
    expect(site.bucket.gold.length).toBeGreaterThan(0);
    expect(session.fuelCans).toBeLessThan(6);
    // Not on a plain bend: no room.
    const bend = region.creeks.find((c) => c.profile.site === 'creekBend');
    if (bend) expect(crew.toggleJob(bend, 'trommel')).toBe('doesntFit');
  });
});
