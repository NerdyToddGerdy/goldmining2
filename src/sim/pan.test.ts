import { describe, expect, it } from 'vitest';
import { Pan, totalMg, type PanLoad, type PanControls } from './pan';
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
