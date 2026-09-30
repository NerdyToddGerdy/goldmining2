import { describe, expect, it } from 'vitest';
import { PAN_TUNING as PAN_T, Pan, totalMg, type PanLoad, type PanControls } from './pan';
import { Creek } from './creek';
import { PanningSession } from './panningSession';
import { createRng } from './rng';

const SPOT: PanLoad = { richness: 4, clayiness: 0.5, rockiness: 0.5 };
const DT = 1 / 30;

type Policy = (pan: Pan) => PanControls;

const SETTLE = { tilt: 0, shake: 1 };
/** Shake level until the clay is gone and the pan has settled, then shake with a moderate tip. */
const skilled: Policy = (pan) => (pan.clay > 0 || pan.stratification < 0.5 ? SETTLE : { tilt: 0.4, shake: 1 });
const aggressive: Policy = (pan) => (pan.clay > 0 ? SETTLE : { tilt: 0.9, shake: 1 });
const timid: Policy = (pan) => (pan.clay > 0 ? SETTLE : { tilt: 0.12, shake: 1 });

function workPan(seed: number, policy: Policy, rakeRocks = true): { pan: Pan; collected: number; initial: number } {
  const pan = new Pan(createRng(seed), SPOT);
  const initial = totalMg(pan.gold) + totalMg(pan.rocks.flatMap((r) => (r.stuckPicker ? [r.stuckPicker] : [])));
  let collected = 0;
  if (rakeRocks) for (const rock of [...pan.rocks]) collected += pan.rakeRock(rock.id)?.mg ?? 0;
  for (let t = 0; t < 600 && !pan.workedDown; t += DT) pan.step(DT, policy(pan));
  pan.reveal();
  collected += totalMg(pan.collect(false).collected);
  return { pan, collected, initial };
}

function recoveryRate(policy: Policy): { recovery: number; seconds: number } {
  let collected = 0;
  let initial = 0;
  let seconds = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const result = workPan(seed, policy);
    collected += result.collected;
    initial += result.initial;
    seconds += result.pan.elapsed;
  }
  return { recovery: collected / initial, seconds: seconds / 60 };
}

describe('Pan', () => {
  it('is deterministic for a seed', () => {
    const a = workPan(9, skilled);
    const b = workPan(9, skilled);
    expect(a.collected).toEqual(b.collected);
    expect(a.pan.elapsed).toEqual(b.pan.elapsed);
  });

  it('conserves gold: everything is collected, lost, or still hidden', () => {
    const pan = new Pan(createRng(3), SPOT);
    const before = totalMg(pan.gold);
    for (let i = 0; i < 400; i++) pan.step(DT, aggressive(pan));
    pan.reveal();
    const after = totalMg(pan.visible) + totalMg(pan.hidden) + totalMg(pan.lost);
    expect(after).toBeCloseTo(before);
  });

  it('rewards skilled panning over aggressive panning', () => {
    const good = recoveryRate(skilled);
    const bad = recoveryRate(aggressive);
    expect(good.recovery).toBeGreaterThan(0.75);
    expect(bad.recovery).toBeLessThan(good.recovery - 0.25);
    expect(bad.seconds).toBeLessThan(good.seconds);
  });

  it('makes timid panning safe but slow', () => {
    const good = recoveryRate(skilled);
    const slow = recoveryRate(timid);
    expect(slow.recovery).toBeGreaterThan(good.recovery - 0.1);
    expect(slow.seconds).toBeGreaterThan(good.seconds * 2);
  });

  it('classifies wash against the current stratification', () => {
    const pan = new Pan(createRng(5), { ...SPOT, rockiness: 0 });
    pan.stratification = 0.9;
    expect(pan.classify(0.02)).toBe('timid');
    expect(pan.classify(0.3)).toBe('balanced');
    expect(pan.classify(0.9)).toBe('aggressive');
    pan.stratification = 0.05;
    expect(pan.classify(0.3)).toBe('aggressive');
  });

  it('shaking level settles the pan, and washing hard churns it back up', () => {
    const pan = new Pan(createRng(6), SPOT);
    for (let i = 0; i < 90; i++) pan.step(DT, SETTLE);
    const settled = pan.stratification;
    expect(settled).toBeGreaterThan(0.7);
    pan.clay = 0;
    for (let i = 0; i < 90; i++) pan.step(DT, { tilt: 0.9, shake: 1 });
    expect(pan.stratification).toBeLessThan(settled);
  });

  it('washes nothing until the shaking has broken up all the clay', () => {
    const pan = new Pan(createRng(13), { ...SPOT, clayiness: 1, rockiness: 0 });
    const sand = pan.lightSand;
    while (pan.clay > 0) {
      pan.step(DT, { tilt: 0.5, shake: 1 });
      expect(pan.lightSand).toBe(sand);
    }
    for (let i = 0; i < 30; i++) pan.step(DT, { tilt: 0.5, shake: 1 });
    expect(pan.lightSand).toBeLessThan(sand);
  });

  it('stops sifting once the sand reads 0%: nothing more washes out or is lost', () => {
    const pan = new Pan(createRng(15), { ...SPOT, clayiness: 0, rockiness: 0 });
    for (let t = 0; t < 300 && !pan.siftedOut; t += DT) pan.step(DT, skilled(pan));
    expect(pan.siftedOut).toBe(true);
    expect(Math.round((pan.lightSand / pan.initialLightSand) * 100)).toBe(0);
    const gold = pan.gold.length;
    const black = pan.blackSand;
    const strat = pan.stratification;
    for (let i = 0; i < 300; i++) pan.step(DT, { tilt: 1, shake: 1 });
    expect(pan.gold.length).toBe(gold);
    expect(pan.blackSand).toBe(black);
    expect(pan.stratification).toBe(strat);
  });

  it('washes nothing without shaking, however far it is tipped', () => {
    const pan = new Pan(createRng(14), { ...SPOT, clayiness: 0, rockiness: 0 });
    const sand = pan.lightSand;
    for (let i = 0; i < 60; i++) pan.step(DT, { tilt: 0.8, shake: 0 });
    expect(pan.lightSand).toBe(sand);
  });

  it('hides gold under sand when revealed too early', () => {
    let earlyVisible = 0;
    let lateVisible = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const early = new Pan(createRng(seed), SPOT);
      early.reveal();
      earlyVisible += early.visible.length / Math.max(1, early.visible.length + early.hidden.length);
      lateVisible += workPan(seed, skilled).pan.hidden.length === 0 ? 1 : 0.9;
    }
    expect(earlyVisible / 30).toBeLessThan(0.2);
    expect(lateVisible / 30).toBeGreaterThan(0.8);
  });

  it('breaks up all the clay with enough shaking, not just most of it', () => {
    const pan = new Pan(createRng(12), { ...SPOT, clayiness: 1 });
    expect(pan.clay).toBeGreaterThan(0.01);
    let seconds = 0;
    while (pan.clay > 0 && seconds < 20) {
      pan.step(DT, SETTLE);
      seconds += DT;
    }
    expect(pan.clay).toBe(0);
    expect(seconds).toBeLessThan(10);
  });

  it('rocks slow washing until raked out', () => {
    const rocky = new Pan(createRng(2), { ...SPOT, rockiness: 1 });
    rocky.clay = 0;
    expect(rocky.rocks.length).toBeGreaterThan(0);
    const controls = { tilt: 0.5, shake: 1 };
    const blocked = rocky.effectiveWash(controls);
    for (const rock of [...rocky.rocks]) rocky.rakeRock(rock.id);
    expect(rocky.effectiveWash(controls)).toBeGreaterThan(blocked);
  });
});

describe('sand grain (each pan reads a little differently)', () => {
  const settled = (grain: number): Pan => {
    const pan = new Pan(createRng(5), { richness: 4, clayiness: 0, rockiness: 0, grain });
    for (let t = 0; t < 4; t += DT) pan.step(DT, { tilt: 0, shake: 1 });
    return pan;
  };

  it('lets coarse grit take a steeper tip than fine silt before gold goes over the lip', () => {
    const fine = settled(0.05);
    const coarse = settled(0.95);
    expect(coarse.safeLimit).toBeGreaterThan(fine.safeLimit * 1.4);
    // The same memorized tilt is balanced on one and aggressive on the other.
    const wash = (fine.safeLimit + coarse.safeLimit) / 2;
    expect(fine.classify(wash)).toBe('aggressive');
    expect(coarse.classify(wash)).toBe('balanced');
  });

  it('washes fine silt faster than coarse grit at the same gentle tip', () => {
    const fine = settled(0.05);
    const coarse = settled(0.95);
    const before = [fine.lightSand, coarse.lightSand];
    for (let t = 0; t < 5; t += DT) {
      fine.step(DT, { tilt: 0.15, shake: 1 });
      coarse.step(DT, { tilt: 0.15, shake: 1 });
    }
    expect(before[0]! - fine.lightSand).toBeGreaterThan((before[1]! - coarse.lightSand) * 1.5);
  });

  it('varies from shovelful to shovelful, finer in the topsoil than the gravel, so no one tilt fits every pan', () => {
    const creek = new Creek(createRng(12));
    const byLayer: Record<string, number[]> = {};
    for (const spot of creek.creekSpots) {
      for (let i = 0; i < 40 && !creek.isWorkedOut(spot); i++) {
        spot.boulder = null;
        spot.water = 0;
        const layer = spot.slumped > 0 ? 'slump' : creek.currentLayer(spot)!.kind;
        const r = creek.shovel(spot.id, 'pan');
        if (r.ok && r.load) (byLayer[layer] ??= []).push(r.load.grain!);
      }
    }
    const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(byLayer.overburden!)).toBeLessThan(mean(byLayer.gravel!) - 0.2);
    // A wash just inside the safe limit of a well-settled medium pan: memorize it, and it's too
    // much for a good share of pans, and needlessly timid-ish for the rest.
    const safeAt = (grain: number): number => (PAN_T.safeLimitBase + PAN_T.safeLimitPerStrat * 0.8) * (PAN_T.fineSafe + PAN_T.grainSafe * grain);
    const memorized = safeAt(0.5) * 0.95;
    const all = Object.values(byLayer).flat();
    const tooMuch = all.filter((grain) => safeAt(grain) < memorized);
    expect(tooMuch.length).toBeGreaterThan(all.length * 0.15);
    expect(tooMuch.length).toBeLessThan(all.length * 0.85);
  });

  it('keeps its grain through a save; concentrate and old saves are medium', () => {
    const pan = new Pan(createRng(3), { richness: 4, clayiness: 0.2, rockiness: 0.2, grain: 0.83 });
    expect(Pan.restore(createRng(4), JSON.parse(JSON.stringify(pan.snapshot()))).grain).toBe(0.83);
    const { grain: _grain, ...old } = pan.snapshot();
    expect(Pan.restore(createRng(4), old).grain).toBe(0.5);
    expect(new Pan(createRng(5), { richness: 0, clayiness: 0, rockiness: 0 }, { blackSand: 0.2, gold: [] }).grain).toBe(0.5);
  });
});

describe('Riffled pan', () => {
  /** Riffles toward the lip, washed at `tilt`; flipped to the smooth side when the riffles hold everything back (unless `flip` is false). */
  function workRiffled(seed: number, tilt: number, flip = true): { pan: Pan; collected: number; initial: number } {
    const pan = new Pan(createRng(seed), SPOT);
    pan.riffled = true;
    const initial = totalMg(pan.gold) + totalMg(pan.rocks.flatMap((r) => (r.stuckPicker ? [r.stuckPicker] : [])));
    let collected = 0;
    for (const rock of [...pan.rocks]) collected += pan.rakeRock(rock.id)?.mg ?? 0;
    for (let t = 0; t < 600 && !pan.workedDown; t += DT) {
      if (pan.rifflesToLip && pan.lightSand <= pan.riffleFloor * 1.02) {
        if (!flip) break;
        pan.flip();
      }
      pan.step(DT, pan.clay > 0 || pan.stratification < 0.5 ? SETTLE : { tilt: pan.rifflesToLip ? tilt : 0.4, shake: 1 });
    }
    pan.reveal();
    collected += totalMg(pan.collect(false).collected);
    return { pan, collected, initial };
  }

  function riffledRate(tilt: number, flip = true): { recovery: number; seconds: number } {
    let collected = 0;
    let initial = 0;
    let seconds = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const result = workRiffled(seed, tilt, flip);
      collected += result.collected;
      initial += result.initial;
      seconds += result.pan.elapsed;
    }
    return { recovery: collected / initial, seconds: seconds / 60 };
  }

  it('takes a steeper tip with the riffles toward the lip', () => {
    const pan = new Pan(createRng(5), SPOT);
    const steel = pan.safeLimit;
    pan.riffled = true;
    expect(pan.safeLimit).toBeCloseTo(steel * PAN_T.riffleSafeScale);
    pan.flip();
    expect(pan.side).toBe('smooth');
    // Smooth side out it's the steel pan again (flipping stirs the layers a little, so compare like with like).
    const smooth = pan.safeLimit;
    pan.riffled = false;
    expect(pan.safeLimit).toBeCloseTo(smooth);
  });

  it('holds sand back riffles-first: it only works down once flipped', () => {
    const held = workRiffled(4, 0.55, false).pan;
    expect(held.workedDown).toBe(false);
    expect(held.lightSand).toBeGreaterThanOrEqual(held.initialLightSand * PAN_T.riffleHold * 0.999);
    expect(workRiffled(4, 0.55).pan.workedDown).toBe(true);
  });

  it('is faster than the steel pan for a skilled hand, without out-earning it', () => {
    const steel = recoveryRate(skilled);
    const riffled = riffledRate(0.55);
    expect(riffled.seconds).toBeLessThan(steel.seconds * 0.9);
    expect(riffled.recovery).toBeGreaterThan(steel.recovery - 0.05);
    expect(riffled.recovery).toBeLessThan(steel.recovery + 0.05);
  });

  it('hides more of the fines when revealed riffles-first', () => {
    const flipped = riffledRate(0.55);
    const unflipped = riffledRate(0.55, false);
    expect(unflipped.recovery).toBeLessThan(flipped.recovery - 0.05);
  });

  it('pans the jar too, unless the finishing pan is to hand', () => {
    const session = new PanningSession(createRng(8));
    session.acquire('riffledPan');
    session.jar.blackSand = 0.3;
    expect(session.startConcentratePan(0, false).riffled).toBe(true);
    session.pan!.phase = 'emptied';
    session.acquire('finishingPan');
    const finishing = session.startConcentratePan(0, true);
    expect(finishing.finishing).toBe(true);
    expect(finishing.riffled).toBe(false);
  });

  it('keeps its side through a save; the steel pan has none', () => {
    const pan = new Pan(createRng(2), SPOT);
    expect(pan.snapshot().riffled).toBeUndefined();
    expect(pan.flip()).toBe(false);
    pan.riffled = true;
    pan.flip();
    const back = Pan.restore(createRng(2), JSON.parse(JSON.stringify(pan.snapshot())));
    expect(back.riffled).toBe(true);
    expect(back.side).toBe('smooth');
  });
});
