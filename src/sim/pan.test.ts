import { describe, expect, it } from 'vitest';
import { Pan, totalMg, type PanLoad, type PanControls } from './pan';
import { createRng } from './rng';

const SPOT: PanLoad = { richness: 4, clayiness: 0.5, rockiness: 0.5 };
const DT = 1 / 30;

type Policy = (pan: Pan) => PanControls;

/** Shake level until settled and clay is gone, then wash moderately; re-shake when the layers mix. */
const skilled: Policy = (pan) =>
  pan.clay > 0.005 || pan.stratification < 0.5
    ? { tilt: 0, swirl: 0, shake: 1 }
    : { tilt: 0.45, swirl: 0.7, shake: 0 };
const aggressive: Policy = () => ({ tilt: 0.9, swirl: 1, shake: 0 });
const timid: Policy = () => ({ tilt: 0.15, swirl: 0.3, shake: 0 });

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

  it('shaking restores stratification and swirling mixes it', () => {
    const pan = new Pan(createRng(6), SPOT);
    for (let i = 0; i < 90; i++) pan.step(DT, { tilt: 0, swirl: 0, shake: 1 });
    const settled = pan.stratification;
    expect(settled).toBeGreaterThan(0.7);
    for (let i = 0; i < 90; i++) pan.step(DT, { tilt: 0.1, swirl: 1, shake: 0 });
    expect(pan.stratification).toBeLessThan(settled);
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

  it('rocks slow washing until raked out', () => {
    const rocky = new Pan(createRng(2), { ...SPOT, rockiness: 1 });
    expect(rocky.rocks.length).toBeGreaterThan(0);
    const controls = { tilt: 0.5, swirl: 0.8, shake: 0 };
    const blocked = rocky.effectiveWash(controls);
    for (const rock of [...rocky.rocks]) rocky.rakeRock(rock.id);
    expect(rocky.effectiveWash(controls)).toBeGreaterThan(blocked);
  });
});
