import { describe, expect, it } from 'vitest';
import type { Creek, DigSpot } from './creek';
import { ECONOMY_TUNING, Economy } from './economy';
import { MARKET } from './market';
import { buyGear } from './outfitter';
import { totalMg } from './pan';
import { PanningSession } from './panningSession';
import { Region } from './region';
import { createRng } from './rng';
import { createSave, loadSave } from './save';
import type { Sluice } from './sluice';
import { Crew, STAFF_TUNING, daysOfGroundLeft, estimateDailyTake, type CrewSite } from './staffing';

const DAY = ECONOMY_TUNING.daySeconds;

interface Setup {
  region: Region;
  creek: Creek;
  spot: DigSpot;
  session: PanningSession;
  sluice: Sluice;
  economy: Economy;
  crew: Crew;
}

/** A found creek bend with the sluice set up on it, claims staked, and a crew ready to hire. */
function setup(seed: number, richness?: number): Setup {
  const region = new Region(createRng(seed));
  for (let i = 0; i < 300; i++) {
    const lead = region.clueFound();
    if (richness !== undefined) (lead as { truth: unknown }).truth = { real: true, richness, site: 'creekBend' };
    const result = region.follow(lead.id);
    if (!result.found || result.lead.truth.site !== 'creekBend') continue;
    const session = new PanningSession(createRng(seed));
    session.cash = 200;
    buyGear(session, 'sluice');
    const spot = result.creek.sluiceSpots[0]!;
    session.setUpSluice(result.creek.id, spot);
    const economy = new Economy();
    economy.stakeFound(region);
    return { region, creek: result.creek, spot, session, sluice: session.sluiceAt(result.creek.id, spot.id)!, economy, crew: new Crew(createRng(seed)) };
  }
  throw new Error('no bend found');
}

const site = (s: Setup, stopped: CrewSite['stopped'] = null): CrewSite => ({ creek: s.creek, spot: s.spot, sluice: s.sluice, session: s.session, stopped });

/** Run the hand until it stops or `seconds` pass. Returns seconds worked. */
function runHand(s: Setup, seconds: number): number {
  for (let t = 0; t < seconds && s.crew.hand && !s.crew.hand.idle; t++) s.crew.work(1, site(s));
  return s.crew.report.seconds;
}

/** A player-paced run on the same stretch: quicker hands, quicker raking, cleanouts every 8. */
function runPlayer(s: Setup, seconds: number): number {
  const { creek, spot, sluice } = s;
  const spots = [...creek.creekSpots].sort((a, b) => Math.abs(a.position - spot.position) - Math.abs(b.position - spot.position));
  let caught = 0;
  let since = 0;
  let timer = 0;
  const rinseAndLift = (): void => {
    for (let r = 0; r < 60; r++) sluice.step(1 / 20, { flow: 0.75 });
    caught += totalMg(sluice.liftMat().gold);
    since = 0;
  };
  for (let t = 0; t < seconds; t += 1 / 20) {
    sluice.step(1 / 20, { flow: 0.75 });
    if (sluice.clog > 0.3) sluice.rake();
    if ((timer -= 1 / 20) > 0) continue;
    const next = spots.find((x) => !creek.isWorkedOut(x));
    if (since >= 8 && sluice.headerVolume < 0.05) rinseAndLift();
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
  if (since > 0) rinseAndLift();
  return caught;
}

describe('the first hired hand', () => {
  it('can only be hired for a set-up sluice on a workable stretch, with a day paid up front', () => {
    const s = setup(1);
    const noSluice = new PanningSession(createRng(1));
    noSluice.cash = 100;
    expect(s.crew.hire(noSluice, s.economy, s.region.home.id, false)).toBe('noSluice');
    expect(s.crew.hire(s.session, s.economy, s.region.home.id, true)).toBe('restricted');
    s.session.cash = STAFF_TUNING.wage - 1;
    expect(s.crew.hire(s.session, s.economy, s.region.home.id, false)).toBe('cantAfford');
    s.session.cash = 100;
    expect(s.crew.hire(s.session, s.economy, s.region.home.id, false)).toBe('hired');
    expect(s.session.cash).toBe(100 - STAFF_TUNING.wage);
    expect(s.crew.wagesOwed).toBe(-STAFF_TUNING.wage);
    expect(s.crew.hire(s.session, s.economy, s.region.home.id, false)).toBe('alreadyHired');
  });

  it('is never hired on the Home Creek, and not on a lapsed claim', () => {
    const s = setup(2);
    // Pretend the sluice sits on the Home Creek: the rule is about the place, whatever the ground.
    expect(s.crew.hire(s.session, s.economy, s.creek.id, false)).toBe('homeCreek');
    s.economy.advance(DAY * (ECONOMY_TUNING.graceDays + 1));
    expect(s.crew.hire(s.session, s.economy, s.region.home.id, false)).toBe('claimLapsed');
  });

  it('works the stretch into the crew bucket, unrevealed, and conserves the gold', () => {
    const s = setup(3);
    s.crew.hire(s.session, s.economy, s.region.home.id, false);
    runHand(s, 3 * DAY);
    expect(s.crew.hand!.idle).toBe('workedOut');
    expect(s.creek.creekSpots.every((spot) => s.creek.isWorkedOut(spot))).toBe(true);
    expect(s.crew.report.cleanouts).toBeGreaterThan(2);
    expect(s.crew.bucket.gold.length).toBeGreaterThan(0);
    expect(s.session.jar.gold).toHaveLength(0); // Nothing reaches the player until they wash it in.
    const inBucket = totalMg(s.crew.bucket.gold);
    expect(inBucket + totalMg(s.sluice.lost) + totalMg(s.sluice.liftMat().gold)).toBeCloseTo(s.sluice.fedMg);
  });

  it('keeps about half what a player would in the same time: staff buy time, not output', () => {
    let hand = 0;
    let player = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const a = setup(seed);
      a.crew.hire(a.session, a.economy, a.region.home.id, false);
      runHand(a, DAY / 3);
      hand += totalMg(a.crew.bucket.gold) + totalMg(a.sluice.liftMat().gold);
      player += runPlayer(setup(seed), DAY / 3);
    }
    expect(hand).toBeGreaterThan(player * 0.4);
    expect(hand).toBeLessThan(player * 0.75);
  });

  it("doesn't work while the player is at the stretch, the claim has lapsed, or there's no sluice", () => {
    const s = setup(4);
    s.crew.hire(s.session, s.economy, s.region.home.id, false);
    for (const reason of ['playerHere', 'claimLapsed', 'noSluice'] as const) {
      s.crew.work(60, site(s, reason));
      expect(s.crew.hand!.idle).toBe(reason);
    }
    expect(s.crew.report.seconds).toBe(0);
    expect(s.sluice.shovelfulsFed).toBe(0);
  });

  it('runs a thin-water site on the pump, from the player’s cans, and stops when they run out', () => {
    const region = new Region(createRng(5));
    let found: { creek: Creek; spot: DigSpot } | null = null;
    for (let i = 0; i < 300 && !found; i++) {
      const r = region.follow(region.clueFound().id);
      const spot = r.found ? r.creek.sluiceSpots.find((x) => x.sluiceSite!.flow < 0.4) : undefined;
      if (r.found && spot) found = { creek: r.creek, spot };
    }
    const session = new PanningSession(createRng(5));
    session.cash = 300;
    for (const id of ['sluice', 'pump'] as const) buyGear(session, id);
    session.fuelCans = 1;
    session.setUpSluice(found!.creek.id, found!.spot);
    const economy = new Economy();
    economy.stakeFound(region);
    const s: Setup = { region, ...found!, session, sluice: session.sluiceAt(found!.creek.id, found!.spot.id)!, economy, crew: new Crew(createRng(5)) };
    s.crew.hire(session, economy, region.home.id, false);
    runHand(s, 3 * DAY);
    expect(session.fuelCans).toBe(0);
    expect(['pumpDry', 'workedOut']).toContain(s.crew.hand!.idle);
  });

  it('walks off after two days unpaid; the wages stay owed', () => {
    const s = setup(6);
    s.crew.hire(s.session, s.economy, s.region.home.id, false);
    expect(s.crew.accrue(DAY)).toBeNull(); // The day paid up front.
    expect(s.crew.accrue(DAY)).toBeNull();
    expect(s.crew.wagesOverdue).toBe(false);
    expect(s.crew.accrue(DAY * 1.2)).toBe('quit');
    expect(s.crew.hand).toBeNull();
    expect(s.crew.wagesOwed).toBe(STAFF_TUNING.wage * STAFF_TUNING.quitDays);
    expect(s.crew.wagesOverdue).toBe(true);
    s.session.cash = 1000;
    s.crew.payWages(s.session);
    expect(s.crew.wagesOwed).toBe(0);
    expect(s.crew.wagesOverdue).toBe(false);
  });

  it('loses money on a poor stretch and pays on a good one', () => {
    const takePerDay = (richness: number): number => {
      let dollars = 0;
      let days = 0;
      for (let seed = 1; seed <= 8; seed++) {
        const s = setup(seed, richness);
        s.crew.hire(s.session, s.economy, s.region.home.id, false);
        const seconds = runHand(s, 3 * DAY);
        dollars += (totalMg(s.crew.bucket.gold) + totalMg(s.sluice.liftMat().gold)) * MARKET.spotPerMg * 0.8;
        days += seconds / DAY;
      }
      return dollars / days;
    };
    expect(takePerDay(0.15)).toBeLessThan(STAFF_TUNING.wage);
    expect(takePerDay(1.3)).toBeGreaterThan(STAFF_TUNING.wage * 2);
  });

  it('washes its bucket into the jar as far as it fits', () => {
    const s = setup(7);
    s.crew.hire(s.session, s.economy, s.region.home.id, false);
    runHand(s, 3 * DAY);
    const before = s.crew.bucket.blackSand;
    const gold = s.crew.bucket.gold.length;
    s.session.jar.blackSand = s.session.jarCapacity - 0.1;
    expect(s.crew.washIntoJar(s.session)).toBeCloseTo(Math.min(0.1, before));
    s.session.jar.blackSand = 0;
    s.crew.washIntoJar(s.session);
    expect(s.crew.bucket.gold.length + s.session.jar.gold.length).toBe(gold);
  });

  it('estimates ground left and the daily take only from what the player knows', () => {
    const s = setup(8);
    expect(daysOfGroundLeft(s.creek, s.spot)).toBeGreaterThan(0.3);
    expect(estimateDailyTake(s.creek, s.spot)).toBeNull(); // No field notes, no estimate.
    s.creek.recordPan(s.spot.id, 6, 'payStreak');
    const est = estimateDailyTake(s.creek, s.spot)!;
    expect(est.high).toBeGreaterThan(est.low);
    s.crew.hire(s.session, s.economy, s.region.home.id, false);
    runHand(s, 3 * DAY);
    expect(daysOfGroundLeft(s.creek, s.spot)).toBe(0);
  });

  it('survives a save mid-shift, exactly', () => {
    const s = setup(9);
    s.crew.hire(s.session, s.economy, s.region.home.id, false);
    runHand(s, 90);
    s.economy.advance(90);
    s.crew.accrue(90);
    const save = JSON.parse(JSON.stringify(createSave(s.region, s.session, { screen: 'region', creekId: s.region.home.id, spotId: null }, 0, s)));
    const loaded = loadSave(save, createRng(10))!;
    expect(loaded.crew.snapshot()).toEqual(s.crew.snapshot());
    expect(loaded.economy.snapshot()).toEqual(s.economy.snapshot());
  });
});
