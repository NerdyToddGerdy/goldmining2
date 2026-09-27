import { describe, expect, it } from 'vitest';
import { Drywasher } from './drywasher';
import { Pan, totalMg, type PanLoad } from './pan';
import { createRng } from './rng';
import { WASH_TUB_TUNING, dipPan, freshTub, refillTub, tubHasWater } from './washTub';
import { buyGear } from './outfitter';
import { PanningSession } from './panningSession';
import { Region } from './region';
import { createSave, loadSave } from './save';
import { siteAllows } from './sites';

const LOAD: PanLoad = { richness: 6, clayiness: 0.3, rockiness: 0.4 };
const DT = 1 / 20;

/** Work `loads` shovelfuls at a fixed air gate, shaking the dust out and knocking the screen when asked. */
function run(seed: number, air: number, opts: { loads?: number; tend?: boolean } = {}) {
  const { loads = 12, tend = true } = opts;
  const dw = new Drywasher(createRng(seed));
  let recovered = 0;
  let seconds = 0;
  for (let i = 0; i < loads; i++) {
    dw.feed(LOAD);
    while (dw.hopperVolume > 0.01 && seconds < 3000) {
      dw.step(DT, true, air);
      seconds += DT;
      if (tend && dw.dust > 0.4) dw.shakeOutDust();
      if (tend && dw.screenClog > 0.5) dw.knockScreen();
      if (!tend && dw.screenClog > 0.9) dw.knockScreen();
    }
    dw.tipOff();
    if (dw.drawerLoading > 0.5) recovered += totalMg(dw.pullDrawer().gold);
  }
  const last = dw.pullDrawer();
  recovered += totalMg(last.gold);
  return { dw, recovery: recovered / dw.fedMg, seconds, junk: last.blackSand };
}

function average(air: number, opts: { tend?: boolean } = {}) {
  let recovery = 0;
  let seconds = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const r = run(seed, air, opts);
    recovery += r.recovery;
    seconds += r.seconds;
  }
  return { recovery: recovery / 12, seconds: seconds / 12 };
}

describe('Drywasher', () => {
  it('does nothing while the bellows are still', () => {
    const dw = new Drywasher(createRng(1));
    dw.feed(LOAD);
    const before = dw.hopperVolume;
    expect(dw.step(5, false, 0.5).state).toBe('still');
    expect(dw.hopperVolume).toBe(before);
  });

  it('recovers most of the gold with balanced air and a tended cloth', () => {
    const balanced = average(0.55);
    expect(balanced.recovery).toBeGreaterThan(0.7);
    expect(balanced.recovery).toBeLessThan(0.92);
  });

  it('loses fines overblown, and loses gold and fills the drawer with sand underblown', () => {
    const balanced = average(0.55);
    expect(average(1).recovery).toBeLessThan(balanced.recovery - 0.1);
    expect(average(0.15).recovery).toBeLessThan(balanced.recovery - 0.05);
    const under = new Drywasher(createRng(2));
    const good = new Drywasher(createRng(2));
    for (const [dw, air] of [[under, 0.15], [good, 0.55]] as const) {
      dw.feed({ ...LOAD, clayiness: 0 });
      for (let t = 0; t < 20; t += DT) dw.step(DT, true, air);
    }
    expect(under.drawerVolume).toBeGreaterThan(good.drawerVolume * 2);
  });

  it('chokes on dust until it is shaken out', () => {
    const dw = new Drywasher(createRng(3));
    expect(dw.classify(0.5)).toBe('balanced');
    for (let i = 0; i < 6; i++) {
      dw.feed(LOAD);
      for (let t = 0; t < 8; t += DT) dw.step(DT, true, 0.5);
      dw.knockScreen();
    }
    expect(dw.dust).toBeGreaterThan(0.4);
    expect(dw.classify(0.5)).toBe('underblown');
    dw.shakeOutDust();
    expect(dw.classify(0.5)).toBe('balanced');
    const untended = average(0.55, { tend: false });
    expect(untended.recovery).toBeLessThan(average(0.55).recovery - 0.05);
  });

  it('blinds its screen on dry clay, which slows it until knocked clear', () => {
    const dw = new Drywasher(createRng(4));
    for (let i = 0; i < 4; i++) {
      dw.feed({ ...LOAD, clayiness: 1 });
      for (let t = 0; t < 6; t += DT) dw.step(DT, true, 0.5);
    }
    expect(dw.screenClog).toBeGreaterThan(0.3);
    dw.feed(LOAD);
    const slow = dw.step(1, true, 0.5).passed;
    dw.knockScreen();
    expect(dw.step(1, true, 0.5).passed).toBeGreaterThan(slow * 1.3);
  });

  it('conserves gold: all of it is in the drawer, on the screen, or lost', () => {
    const dw = new Drywasher(createRng(5));
    for (let i = 0; i < 5; i++) {
      dw.feed(LOAD);
      for (let t = 0; t < 3; t += DT) dw.step(DT, true, i % 2 ? 0.9 : 0.4);
      if (i === 2) dw.shakeOutDust();
      if (i === 3) dw.tipOff();
    }
    const snap = dw.snapshot();
    const onScreen = totalMg(snap.hopper.gold) + totalMg(snap.hopper.rocks.flatMap((r) => (r.stuckPicker ? [r.stuckPicker] : [])));
    expect(totalMg(dw.pullDrawer().gold) + onScreen + totalMg(dw.lost)).toBeCloseTo(dw.fedMg);
  });

  it('round-trips through a snapshot', () => {
    const { dw } = run(6, 0.5, { loads: 2 });
    dw.feed(LOAD);
    const copy = new Drywasher(createRng(9), JSON.parse(JSON.stringify(dw.snapshot())));
    expect(copy.snapshot()).toEqual(dw.snapshot());
  });
});

describe('Wash tub', () => {
  it('holds about ten pans, clouding with each, clay most', () => {
    const tub = freshTub();
    let pans = 0;
    while (dipPan(tub, 0.2) !== null) pans++;
    expect(pans).toBe(Math.round(1 / WASH_TUB_TUNING.perPan));
    expect(tubHasWater(tub)).toBe(false);
    const clean = freshTub();
    const clayey = freshTub();
    dipPan(clean, 0);
    dipPan(clayey, 1);
    expect(clayey.turbidity).toBeGreaterThan(clean.turbidity * 3);
    refillTub(tub);
    expect(tub).toEqual(freshTub());
  });

  it('muddy water settles a pan slower and hides colour at the reveal', () => {
    const work = (murk: number): { strat: number; visible: number } => {
      let strat = 0;
      let visible = 0;
      for (let seed = 1; seed <= 20; seed++) {
        const pan = new Pan(createRng(seed), { richness: 8, clayiness: 0, rockiness: 0 });
        pan.waterMurk = murk;
        for (let t = 0; t < 2; t += DT) pan.step(DT, { tilt: 0, shake: 1 });
        strat += pan.stratification;
        pan.reveal();
        visible += pan.visible.length / Math.max(1, pan.visible.length + pan.hidden.length);
      }
      return { strat: strat / 20, visible: visible / 20 };
    };
    const clear = work(0);
    const muddy = work(0.9);
    expect(muddy.strat).toBeLessThan(clear.strat);
    expect(muddy.visible).toBeLessThan(clear.visible);
  });
});

describe('dry gear in the session', () => {
  it('is only for ground with no water, never a creek or the Home Creek', () => {
    for (const gear of ['drywasher', 'washTub'] as const) {
      expect(siteAllows('dryWash', gear)).toBe(true);
      for (const site of ['homeCreek', 'creekStretch', 'creekBend', 'gravelBar', 'ravine'] as const) expect(siteAllows(site, gear)).toBe(false);
    }
  });

  it('is bought once, travels with the player, and survives a save; nobody had it in a version 13 save', () => {
    const session = new PanningSession(createRng(20));
    session.cash = 100;
    expect(buyGear(session, 'drywasher')).toBe('bought');
    expect(buyGear(session, 'washTub')).toBe('bought');
    expect(buyGear(session, 'washTub')).toBe('alreadyOwned');
    session.drywasher!.feed(LOAD);
    session.drywasher!.step(2, true, 0.5);
    dipPan(session.tub!, 0.4);
    session.startPan(LOAD, session.tub!.turbidity);
    const region = new Region(createRng(20));
    const save = JSON.parse(JSON.stringify(createSave(region, session, { screen: 'drywasher', creekId: region.home.id, spotId: null }, 0)));
    const loaded = loadSave(save, createRng(21))!;
    expect(loaded.session.snapshot()).toEqual(session.snapshot());
    expect(loaded.session.pan!.waterMurk).toBeGreaterThan(0);
    delete save.session.drywasher;
    delete save.session.tub;
    const old = loadSave({ ...save, version: 13 }, createRng(22))!;
    expect(old.session.owns('drywasher')).toBe(false);
    expect(old.session.owns('washTub')).toBe(false);
  });
});
