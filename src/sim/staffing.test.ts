import { describe, expect, it } from 'vitest';
import type { Creek } from './creek';
import { CREW_TUNING, type CrewPolicy } from './crewJobs';
import { ECONOMY_TUNING, Economy } from './economy';
import { buyGear } from './outfitter';
import { totalMg } from './pan';
import { PanningSession } from './panningSession';
import { Region } from './region';
import { createRng } from './rng';
import { createSave, loadSave } from './save';
import type { SiteKind } from './sites';
import { Crew, STAFF_TUNING, crewFromV14, crewGroundLeft, estimateHandTake, type CrewWorld } from './staffing';

const DAY = ECONOMY_TUNING.daySeconds;

interface Setup {
  region: Region;
  creek: Creek;
  session: PanningSession;
  economy: Economy;
  crew: Crew;
  world: CrewWorld;
}

/** A found stretch of the given kind, staked, with cash in hand and an empty crew. */
function setup(seed: number, site: SiteKind = 'creekBend', richness = 1.3): Setup {
  const region = new Region(createRng(seed));
  let creek: Creek | null = null;
  while (!creek) {
    const lead = region.clueFound();
    (lead as { truth: unknown }).truth = { real: true, richness, site };
    const result = region.follow(lead.id);
    if (result.found) creek = result.creek;
  }
  const session = new PanningSession(createRng(seed));
  session.cash = 1000;
  const economy = new Economy();
  economy.stakeFound(region);
  const crew = new Crew(createRng(seed));
  return { region, creek, session, economy, crew, world: { session, region, economy, playerAt: null } };
}

/** Hire `n` operators (who can do any job), send them to the setup's stretch, and switch on `jobs` in order. */
function staff(s: Setup, n: number, jobs: Parameters<Crew['toggleJob']>[1][]): void {
  for (let i = 0; i < n; i++) {
    s.crew.hire(s.session, false, 'operator');
    s.crew.send(s.creek, s.economy, s.region.home.id);
  }
  for (const job of jobs) s.crew.toggleJob(s.creek, job);
}

function runFor(s: Setup, seconds: number): void {
  for (let t = 0; t < seconds; t += 10) s.crew.work(10, s.world);
}

describe('hiring and placing the crew', () => {
  it('hires hands with the first day up front, into town, with names of their own', () => {
    const s = setup(1);
    s.session.cash = STAFF_TUNING.wage.hand - 1;
    expect(s.crew.hire(s.session, false)).toBe('cantAfford');
    s.session.cash = 500;
    expect(s.crew.hire(s.session, true)).toBe('restricted');
    for (let i = 0; i < 5; i++) expect(s.crew.hire(s.session, false)).toBe('hired');
    expect(s.session.cash).toBe(500 - 5 * STAFF_TUNING.wage.hand);
    expect(s.crew.wagesOwed).toBe(-5 * STAFF_TUNING.wage.hand);
    expect(new Set(s.crew.workers.map((w) => w.name)).size).toBe(5);
    expect(s.crew.idleWorkers).toHaveLength(5);
  });

  it('sends hands only as far as the ground has room, never to the Home Creek or a lapsed claim', () => {
    const s = setup(2, 'creekBend');
    for (let i = 0; i < 4; i++) s.crew.hire(s.session, false);
    expect(s.crew.send(s.region.home, s.economy, s.region.home.id)).toBe('homeCreek');
    expect(s.crew.send(s.creek, s.economy, s.region.home.id)).toBe('sent');
    expect(s.crew.send(s.creek, s.economy, s.region.home.id)).toBe('sent');
    expect(s.crew.send(s.creek, s.economy, s.region.home.id)).toBe('full'); // A bend takes two.
    const bar = setup(3, 'gravelBar');
    for (let i = 0; i < 5; i++) bar.crew.hire(bar.session, false);
    let sent = 0;
    while (bar.crew.send(bar.creek, bar.economy, bar.region.home.id) === 'sent') sent++;
    expect(sent).toBe(4); // A gravel bar takes four.
    bar.economy.advance(DAY * 10);
    bar.crew.recall(bar.creek.id);
    expect(bar.crew.send(bar.creek, bar.economy, bar.region.home.id)).toBe('claimLapsed');
    expect(s.crew.recall(s.creek.id)).not.toBeNull();
    expect(s.crew.workersAt(s.creek.id)).toHaveLength(1);
  });

  it('pays hands less than operators, and only operators run the sluice, highbanker and drywasher', () => {
    const s = setup(40, 'creekBend');
    expect(STAFF_TUNING.wage.hand).toBeLessThan(STAFF_TUNING.wage.operator);
    s.crew.hire(s.session, false, 'hand');
    s.crew.send(s.creek, s.economy, s.region.home.id);
    s.crew.toggleJob(s.creek, 'sluice');
    s.crew.toggleJob(s.creek, 'pan');
    // A lone hand can't run the sluice, so they take the pan.
    expect(s.crew.staffedJobs(s.creek.id)).toEqual(['pan']);
    s.crew.hire(s.session, false, 'operator');
    s.crew.send(s.creek, s.economy, s.region.home.id, 'operator');
    expect(s.crew.staffedJobs(s.creek.id)).toEqual(['sluice', 'pan']);
    // An operator fills in on a hand's job when no hand is free.
    const t = setup(41, 'creekStretch');
    t.crew.hire(t.session, false, 'operator');
    t.crew.send(t.creek, t.economy, t.region.home.id);
    t.crew.toggleJob(t.creek, 'pan');
    expect(t.crew.staffedJobs(t.creek.id)).toEqual(['pan']);
    expect(t.crew.dailyWages).toBe(STAFF_TUNING.wage.operator);
    // Workers saved before roles existed were hired at an operator's wage: they're operators.
    const snap = t.crew.snapshot();
    const old = { ...snap, workers: snap.workers.map(({ role: _role, ...w }) => w) } as never;
    expect(new Crew(createRng(1), old).workers[0]!.role).toBe('operator');
  });

  it('fills the job list in the order jobs were switched on, and refuses jobs the ground can’t take', () => {
    const s = setup(4, 'creekBend');
    staff(s, 1, ['pan', 'haul']);
    expect(s.crew.staffedJobs(s.creek.id)).toEqual(['pan']);
    s.crew.hire(s.session, false);
    s.crew.send(s.creek, s.economy, s.region.home.id);
    expect(s.crew.staffedJobs(s.creek.id)).toEqual(['pan', 'haul']);
    expect(s.crew.toggleJob(s.creek, 'drywasher')).toBe('doesntFit');
    const ravine = setup(5, 'ravine');
    expect(ravine.crew.toggleJob(ravine.creek, 'rocker')).toBe('doesntFit');
    const dry = setup(6, 'dryWash');
    expect(dry.crew.toggleJob(dry.creek, 'pan')).toBe('doesntFit');
    expect(dry.crew.toggleJob(dry.creek, 'drywasher')).toBe('on');
  });
});

describe('crew jobs', () => {
  it('runs the player’s own sluice where it’s set up, into the crew bucket, conserving gold', () => {
    const s = setup(7);
    buyGear(s.session, 'sluice');
    const spot = s.creek.sluiceSpots[0]!;
    s.session.setUpSluice(s.creek.id, spot);
    staff(s, 1, ['sluice']);
    runFor(s, 3 * DAY);
    const site = s.crew.findSite(s.creek.id)!;
    expect(site.idle.sluice).toBe('workedOut');
    expect(site.report.cleanouts).toBeGreaterThan(2);
    expect(site.bucket.gold.length).toBeGreaterThan(0);
    const sluice = s.session.sluiceAt(s.creek.id, spot.id)!;
    expect(totalMg(site.bucket.gold) + totalMg(sluice.lost) + totalMg(sluice.liftMat().gold)).toBeCloseTo(sluice.fedMg);
  });

  it('needs a crew unit where the player’s machine isn’t, and sends it back to spare when switched off', () => {
    const s = setup(8);
    staff(s, 1, ['sluice']);
    runFor(s, 60);
    expect(s.crew.findSite(s.creek.id)!.idle.sluice).toBe('noMachine');
    s.crew.buyMachine(s.session, 'sluice', false);
    runFor(s, 200);
    const site = s.crew.findSite(s.creek.id)!;
    expect(site.crewSluice).not.toBeNull();
    expect(s.crew.spares.sluice).toBe(0);
    expect(site.report.shovelfuls).toBeGreaterThan(10);
    const held = site.crewSluice!.sluice.mossGoldCount;
    const before = site.bucket.gold.length;
    s.crew.toggleJob(s.creek, 'sluice');
    expect(site.crewSluice).toBeNull();
    expect(s.crew.spares.sluice).toBe(1);
    expect(site.bucket.gold.length).toBe(before + held);
  });

  it('rocks, drywashes and runs a highbanker on crew units, and pans by hand', () => {
    const bend = setup(9, 'creekBend');
    for (const m of ['rocker', 'highbanker'] as const) bend.crew.buyMachine(bend.session, m, false);
    bend.session.fuelCans = 3;
    staff(bend, 2, ['rocker', 'highbanker']);
    runFor(bend, DAY / 2);
    const site = bend.crew.findSite(bend.creek.id)!;
    expect(site.rocker).not.toBeNull();
    expect(site.crewHighbanker).not.toBeNull();
    expect(site.report.shovelfuls).toBeGreaterThan(40);
    expect(site.bucket.blackSand).toBeGreaterThan(0);
    expect(bend.session.fuelCans).toBeLessThan(3);

    const dry = setup(10, 'dryWash');
    dry.crew.buyMachine(dry.session, 'drywasher', false);
    staff(dry, 1, ['drywasher']);
    runFor(dry, DAY / 2);
    expect(dry.crew.findSite(dry.creek.id)!.report.cleanouts).toBeGreaterThan(0);

    const pan = setup(11, 'creekStretch');
    staff(pan, 1, ['pan']);
    runFor(pan, DAY / 2);
    const panSite = pan.crew.findSite(pan.creek.id)!;
    expect(panSite.report.pans).toBeGreaterThan(3);
    expect(panSite.poke.length + panSite.bucket.gold.length).toBeGreaterThan(0);
  });

  it('stops the highbanker when the player has no fuel cans left', () => {
    const s = setup(12, 'creekBend');
    s.crew.buyMachine(s.session, 'highbanker', false);
    s.session.fuelCans = 0;
    staff(s, 1, ['highbanker']);
    runFor(s, 60);
    expect(s.crew.findSite(s.creek.id)!.idle.highbanker).toBe('noFuel');
  });

  it('screens loads on a classifier: no rocks reach the machine, and wedged pickers go in the poke', () => {
    const s = setup(13, 'creekBend');
    for (const m of ['sluice', 'classifier'] as const) s.crew.buyMachine(s.session, m, false);
    staff(s, 2, ['sluice', 'screen']);
    let rocksSeen = 0;
    for (let t = 0; t < DAY / 2; t += 10) {
      s.crew.work(10, s.world);
      rocksSeen += s.crew.findSite(s.creek.id)!.crewSluice!.sluice.headerRocks;
    }
    expect(rocksSeen).toBe(0);
  });

  it('gets more done with a hauler on site', () => {
    const shovelfuls = (withHauler: boolean): number => {
      let total = 0;
      for (let seed = 20; seed < 26; seed++) {
        const s = setup(seed, 'gravelBar');
        s.crew.buyMachine(s.session, 'sluice', false);
        staff(s, 2, withHauler ? ['sluice', 'haul'] : ['sluice']);
        runFor(s, DAY / 4);
        total += s.crew.findSite(s.creek.id)!.report.shovelfuls;
      }
      return total;
    };
    expect(shovelfuls(true)).toBeGreaterThan(shovelfuls(false) * 1.15);
  });

  it('prospects: traces a gully to a new staked stretch, and turns up leads roaming', () => {
    let traced = false;
    for (let seed = 30; seed < 50 && !traced; seed++) {
      const s = setup(seed, 'creekStretch');
      if (!s.creek.gullySpots.some((g) => g.gully!.source)) continue;
      staff(s, 1, ['prospect']);
      const before = s.region.creeks.length;
      runFor(s, DAY);
      traced = s.region.creeks.length > before;
      if (traced) expect(s.economy.allClaims.length).toBe(s.region.creeks.length - 1);
    }
    expect(traced).toBe(true);
    const roam = setup(51, 'dryWash');
    staff(roam, 1, ['prospect']);
    const leads = roam.region.leads.length;
    runFor(roam, 4 * DAY);
    expect(roam.region.leads.length).toBeGreaterThan(leads);
  });

  it('finishes the crew’s concentrate into the poke, at a hand’s recovery', () => {
    const s = setup(52, 'creekBend');
    const site = s.crew.site(s.creek.id);
    const gold = Array.from({ length: 60 }, (_, i) => ({ id: 90000 + i, size: 'flake' as const, mg: 0.3 }));
    site.addToBucket(1, gold);
    staff(s, 1, ['finish']);
    runFor(s, DAY);
    expect(site.bucket.blackSand).toBeLessThan(0.05);
    expect(site.poke.length).toBeGreaterThan(20);
    expect(site.poke.length).toBeLessThanOrEqual(60);
  });

  it('stands back while the player is at the stretch, and stops on a lapsed claim', () => {
    const s = setup(53);
    staff(s, 1, ['pan']);
    s.crew.work(300, { ...s.world, playerAt: s.creek.id });
    expect(s.crew.findSite(s.creek.id)!.report.seconds).toBe(0);
    s.economy.advance(DAY * 10);
    s.crew.work(300, s.world);
    expect(s.crew.findSite(s.creek.id)!.report.seconds).toBe(0);
  });
});

describe('staff buy time, not output', () => {
  /** A player-paced run on the same ground: quicker hands, quicker raking, cleanouts every 8. */
  function playerSluice(s: Setup, seconds: number): number {
    const sluice = s.session.sluiceAt(s.creek.id, s.creek.sluiceSpots[0]!.id)!;
    const spot = s.creek.sluiceSpots[0]!;
    const { creek } = s;
    const spots = [...creek.creekSpots].sort((a, b) => Math.abs(a.position - spot.position) - Math.abs(b.position - spot.position));
    let caught = 0;
    let since = 0;
    let timer = 0;
    const lift = (): void => {
      for (let r = 0; r < 60; r++) sluice.step(1 / 20, { flow: 0.75 });
      caught += totalMg(sluice.liftMat().gold);
      since = 0;
    };
    for (let t = 0; t < seconds; t += 1 / 20) {
      sluice.step(1 / 20, { flow: 0.75 });
      if (sluice.clog > 0.3) sluice.rake();
      if ((timer -= 1 / 20) > 0) continue;
      const next = spots.find((x) => !creek.isWorkedOut(x));
      if (since >= 8 && sluice.headerVolume < 0.05) lift();
      else if (!next) {
        if (sluice.headerVolume < 0.05) break;
        timer = 1;
      } else if (creek.blockedBy(next) === 'boulder') (creek.pry(next.id), (timer = 1.5));
      else if (creek.blockedBy(next) === 'flooded') (creek.bail(next.id), (timer = 1.5));
      else if (next.slumped > 0 || creek.currentLayer(next)?.kind === 'overburden') (creek.shovel(next.id, 'spoil'), (timer = 2));
      else if (!sluice.feedBlocked) {
        const r = creek.shovel(next.id, 'pan');
        if (r.ok && r.load) (sluice.feed(r.load), since++);
        timer = 3.5 + 6 * Math.abs(next.position - spot.position);
      }
    }
    if (since > 0) lift();
    return caught;
  }

  it('a hand on the sluice keeps about half what the player would in the same time', () => {
    let hand = 0;
    let player = 0;
    for (let seed = 70; seed < 82; seed++) {
      const a = setup(seed);
      buyGear(a.session, 'sluice');
      a.session.setUpSluice(a.creek.id, a.creek.sluiceSpots[0]!);
      staff(a, 1, ['sluice']);
      runFor(a, DAY / 3);
      const site = a.crew.findSite(a.creek.id)!;
      hand += totalMg(site.bucket.gold) + totalMg(a.session.sluiceAt(a.creek.id, a.creek.sluiceSpots[0]!.id)!.liftMat().gold);
      const b = setup(seed);
      buyGear(b.session, 'sluice');
      b.session.setUpSluice(b.creek.id, b.creek.sluiceSpots[0]!);
      player += playerSluice(b, DAY / 3);
    }
    expect(hand).toBeGreaterThan(player * 0.4);
    expect(hand).toBeLessThan(player * 0.75);
  });
});

describe('wages, collecting and saving', () => {
  it('runs wages for the whole crew; the last hired walks off unpaid, and wages stay owed', () => {
    const s = setup(60);
    for (let i = 0; i < 3; i++) s.crew.hire(s.session, false);
    const last = s.crew.workers[2]!;
    expect(s.crew.accrue(DAY)).toBeNull();
    expect(s.crew.accrue(DAY)).toBeNull();
    expect(s.crew.wagesOverdue).toBe(false);
    expect(s.crew.accrue(DAY * 1.5)).toBe(last);
    expect(s.crew.workers).toHaveLength(2);
    expect(s.crew.wagesOwed).toBeGreaterThan(s.crew.dailyWages);
    s.crew.payWages(s.session);
    expect(s.crew.wagesOwed).toBe(0);
  });

  it('collects the poke into the vial and the bucket into the jar, as far as it fits', () => {
    const s = setup(61);
    const site = s.crew.site(s.creek.id);
    site.poke.push({ id: 91000, size: 'flake', mg: 0.4 });
    site.addToBucket(2, [{ id: 91001, size: 'fine', mg: 0.05 }]);
    const got = s.crew.collect(s.creek.id, s.session);
    expect(got.gold).toBe(1);
    expect(s.session.vial).toHaveLength(1);
    expect(got.sand).toBeCloseTo(s.session.jarCapacity);
    expect(got.sandLeft).toBeCloseTo(2 - s.session.jarCapacity);
  });

  it('estimates a hand’s take only from the player’s own notes', () => {
    const s = setup(62);
    expect(estimateHandTake(s.creek)).toBeNull();
    s.creek.recordPan(s.creek.creekSpots[0]!.id, 6, 'payStreak');
    const est = estimateHandTake(s.creek)!;
    expect(est.high).toBeGreaterThan(est.low);
  });

  it('survives a save mid-shift, pans and machines and all', () => {
    const s = setup(63, 'creekBend');
    for (const m of ['rocker', 'sluice', 'classifier'] as const) s.crew.buyMachine(s.session, m, false);
    staff(s, 2, ['pan', 'rocker', 'sluice']);
    runFor(s, 95);
    s.economy.advance(95);
    s.crew.accrue(95);
    const save = JSON.parse(JSON.stringify(createSave(s.region, s.session, { screen: 'region', creekId: s.region.home.id, spotId: null }, 0, s)));
    const loaded = loadSave(save, createRng(64))!;
    expect(loaded.crew.snapshot()).toEqual(s.crew.snapshot());
  });

  it('turns a version 14 hand on the sluice into a crew with the sluice job, bucket and all', () => {
    const snap = crewFromV14({ hand: { name: 'Ruth', wage: 25 }, wagesOwed: 3, bucket: { blackSand: 0.5, gold: [{ id: 1, size: 'fine', mg: 0.05 }] }, sluiceCreekId: 7 });
    const crew = new Crew(createRng(1), snap);
    expect(crew.workers.map((w) => [w.name, w.siteId])).toEqual([['Ruth', 7]]);
    expect(crew.findSite(7)!.jobs).toEqual(['sluice']);
    expect(crew.findSite(7)!.bucket.blackSand).toBe(0.5);
    const away = new Crew(createRng(1), crewFromV14({ hand: { name: 'Ruth', wage: 25 }, wagesOwed: 0, bucket: { blackSand: 0.5, gold: [] }, sluiceCreekId: null }));
    expect(away.workers[0]!.siteId).toBeNull();
    expect(away.returned.blackSand).toBe(0.5);
    expect(CREW_TUNING.bucketCapacity).toBeGreaterThan(0);
  });
});

describe('crew policies', () => {
  /** Two operators on the player's sluice and a pan at a bend, for half a day under a policy. */
  function shift(seed: number, policy: CrewPolicy): { loads: number; fed: number; lost: number; topsoil: number; s: Setup } {
    const s = setup(seed);
    buyGear(s.session, 'sluice');
    const spot = s.creek.sluiceSpots[0]!;
    s.session.setUpSluice(s.creek.id, spot);
    staff(s, 2, ['sluice', 'pan']);
    s.crew.setPolicy(s.creek.id, policy);
    runFor(s, DAY / 2);
    const sluice = s.session.sluiceAt(s.creek.id, spot.id)!;
    const topsoil = s.creek.creekSpots.reduce((n, sp) => n + sp.layers[0]!.loads, 0);
    return { loads: s.crew.findSite(s.creek.id)!.report.shovelfuls, fed: sluice.fedMg, lost: totalMg(sluice.lost), topsoil, s };
  }
  function over(policy: CrewPolicy): { loads: number; loss: number; topsoil: number } {
    let loads = 0;
    let fed = 0;
    let lost = 0;
    let topsoil = 0;
    for (let seed = 1; seed <= 5; seed++) {
      const r = shift(seed, policy);
      loads += r.loads;
      fed += r.fed;
      lost += r.lost;
      topsoil += r.topsoil;
    }
    return { loads, loss: lost / fed, topsoil };
  }

  it('trade ground for gold: careful digs less and loses less, push hard digs more and loses more', () => {
    const steady = over('steady');
    const careful = over('careful');
    const push = over('push');
    expect(careful.loads).toBeLessThan(steady.loads * 0.9);
    expect(push.loads).toBeGreaterThan(steady.loads * 1.1);
    expect(careful.loss).toBeLessThan(steady.loss * 0.7);
    expect(push.loss).toBeGreaterThan(steady.loss * 1.15);
    // Gold a day: pushing brings in a little more for all it wastes; care brings in a little less.
    const kept = (r: { loads: number; loss: number }): number => r.loads * (1 - r.loss);
    expect(kept(push)).toBeGreaterThan(kept(steady));
    expect(kept(careful)).toBeLessThan(kept(steady));
  });

  it('prepare the ground: topsoil stripped, boulders pried, nothing washed, then say it’s ready', () => {
    const { s, loads, fed } = shift(3, 'prepare');
    expect(loads).toBe(0);
    expect(fed).toBe(0);
    const site = s.crew.findSite(s.creek.id)!;
    for (const spot of s.creek.creekSpots) {
      if (s.creek.isWorkedOut(spot)) continue;
      expect(s.creek.blockedBy(spot)).toBeNull();
      expect(s.creek.currentLayer(spot)?.kind).not.toBe('overburden');
      expect(spot.slumped).toBe(0);
    }
    expect(site.idle.sluice).toBe('groundReady');
    expect(site.idle.pan).toBe('groundReady');
    // No gravel dug away, so no end to the ground at this pace.
    expect(crewGroundLeft(s.crew, s.creek)).toBe(Infinity);
  });

  it('wash the old tailings at abandoned diggings instead of tossing them', () => {
    const s = setup(4, 'oldDiggings');
    staff(s, 1, ['pan']);
    runFor(s, DAY / 2);
    const site = s.crew.findSite(s.creek.id)!;
    expect(site.report.pans).toBeGreaterThan(3);
    expect(s.creek.creekSpots.reduce((n, sp) => n + sp.spoil, 0)).toBe(0);
  });

  it('shape the estimates: more ground a day pushing, no take at all while preparing', () => {
    const s = setup(5);
    s.creek.recordPan(s.creek.creekSpots[0]!.id, 4, 'gravel');
    const steady = estimateHandTake(s.creek, 'steady')!;
    expect(estimateHandTake(s.creek, 'push')!.high).toBeGreaterThan(steady.high);
    expect(estimateHandTake(s.creek, 'prepare')).toBeNull();
    staff(s, 1, ['pan']);
    const days = crewGroundLeft(s.crew, s.creek);
    s.crew.setPolicy(s.creek.id, 'push');
    expect(crewGroundLeft(s.crew, s.creek)).toBeLessThan(days);
  });

  it('keeps each stretch’s policy through a save, and a version 17 crew works steady', () => {
    const s = setup(6);
    staff(s, 1, ['pan']);
    s.crew.setPolicy(s.creek.id, 'careful');
    const save = JSON.parse(JSON.stringify(createSave(s.region, s.session, { screen: 'creek', creekId: s.creek.id, spotId: null }, 0, s)));
    expect(loadSave(save, createRng(1))!.crew.policyAt(s.creek.id)).toBe('careful');
    for (const site of save.crew.sites) delete site.policy;
    expect(loadSave({ ...save, version: 17 }, createRng(1))!.crew.policyAt(s.creek.id)).toBe('steady');
  });
});

