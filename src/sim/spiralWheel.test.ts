import { describe, expect, it } from 'vitest';
import { totalMg, type GoldPiece } from './pan';
import { createRng } from './rng';
import { SPIRAL_TUNING, SpiralWheel, type SpiralControls } from './spiralWheel';

const DT = 1 / 30;

/** A jar pour's worth of black sand with the kind of gold saved pans leave in it: mostly fines. */
function jar(seed: number): { blackSand: number; magnetite: number; gold: GoldPiece[] } {
  const rng = createRng(seed);
  const gold: GoldPiece[] = [];
  let id = 1;
  for (let i = 0; i < 40; i++) gold.push({ id: id++, size: 'fine', mg: 0.03 + rng.next() * 0.05 });
  for (let i = 0; i < 8; i++) gold.push({ id: id++, size: 'flake', mg: 0.3 + rng.next() * 0.5 });
  return { blackSand: 0.25, magnetite: 0.15, gold };
}

interface Run {
  vial: GoldPiece[];
  backToJar: GoldPiece[];
  lost: GoldPiece[];
  seconds: number;
  initial: number;
}

/** Run the whole jar through: scoop when the tray runs low, lift the cup now and then, dump the tailings at the end. */
function run(seed: number, controls: SpiralControls): Run {
  const j = jar(seed);
  const initial = totalMg(j.gold);
  const wheel = new SpiralWheel(createRng(seed + 100));
  wheel.leveled = true;
  const vial: GoldPiece[] = [];
  const backToJar: GoldPiece[] = [];
  let t = 0;
  const lift = (): void => {
    const h = wheel.liftCup();
    vial.push(...h.gold);
    backToJar.push(...h.backToJar.gold);
  };
  for (; t < 900; t += DT) {
    if (wheel.tray.sand < 0.01 && j.blackSand > 1e-6) wheel.scoopFrom(j);
    wheel.step(DT, controls);
    if (Math.round(t * 30) % 300 === 0) lift();
    if (j.blackSand <= 1e-6 && wheel.idle) break;
  }
  lift();
  const lost = wheel.dumpTailings();
  return { vial, backToJar, lost, seconds: t, initial };
}

function totals(controls: SpiralControls): { recovery: number; fineRecovery: number; seconds: number; backShare: number } {
  let got = 0;
  let initial = 0;
  let fines = 0;
  let finesGot = 0;
  let back = 0;
  let seconds = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const r = run(seed, controls);
    got += totalMg(r.vial);
    initial += r.initial;
    back += totalMg(r.backToJar);
    fines += 40;
    finesGot += r.vial.filter((p) => p.size === 'fine').length;
    seconds += r.seconds;
  }
  return { recovery: got / initial, fineRecovery: finesGot / fines, seconds: seconds / 20, backShare: back / initial };
}

const BALANCED: SpiralControls = { tilt: 0.5, spray: 0.5, feed: 0.5 };

describe('Spiral wheel', () => {
  it('names its power: underpowered, balanced, overpowered', () => {
    expect(SpiralWheel.classify(SpiralWheel.power({ tilt: 0.1, spray: 0.2, feed: 0 }))).toBe('underpowered');
    expect(SpiralWheel.classify(SpiralWheel.power(BALANCED))).toBe('balanced');
    expect(SpiralWheel.classify(SpiralWheel.power({ tilt: 0.9, spray: 0.9, feed: 0 }))).toBe('overpowered');
  });

  it('keeps every piece somewhere: vial, back to the jar, or the tailings', () => {
    const r = run(3, { tilt: 0.8, spray: 0.9, feed: 1 });
    const pieces = r.vial.length + r.backToJar.length + r.lost.length;
    expect(pieces).toBe(48);
    expect(totalMg([...r.vial, ...r.backToJar, ...r.lost])).toBeCloseTo(r.initial);
  });

  it('does nothing until it is set level', () => {
    const wheel = new SpiralWheel(createRng(1));
    const j = jar(1);
    wheel.scoopFrom(j);
    const e = wheel.step(1, BALANCED);
    expect(e.fed).toBe(0);
  });

  it('balanced, it finishes a pour in well under a minute and keeps nearly all the fines', () => {
    const t = totals(BALANCED);
    expect(t.recovery).toBeGreaterThan(0.9);
    expect(t.fineRecovery).toBeGreaterThan(0.85);
    expect(t.recovery).toBeLessThan(0.99);
    expect(t.seconds).toBeLessThan(30);
  });

  it('overpowered, it throws fine gold over the rim with the sand', () => {
    const good = totals(BALANCED);
    const hard = totals({ tilt: 0.9, spray: 0.95, feed: 0.5 });
    expect(hard.fineRecovery).toBeLessThan(good.fineRecovery - 0.25);
    expect(hard.seconds).toBeLessThan(good.seconds);
  });

  it('underpowered or overfed, the centre crowds and the cup comes up dirty: fines go back to the jar', () => {
    const good = totals(BALANCED);
    const crowded = totals({ tilt: 0.25, spray: 0.3, feed: 1 });
    expect(crowded.backShare).toBeGreaterThan(good.backShare + 0.05);
  });

  it('can run the tailings again, or dump them', () => {
    const wheel = new SpiralWheel(createRng(2));
    wheel.leveled = true;
    const j = jar(2);
    wheel.scoopFrom(j);
    for (let t = 0; t < 30; t += DT) wheel.step(DT, { tilt: 0.9, spray: 0.9, feed: 1 });
    const inBucket = wheel.tailings.sand;
    expect(inBucket).toBeGreaterThan(0);
    wheel.rerunTailings();
    expect(wheel.tray.sand).toBeCloseTo(Math.min(SPIRAL_TUNING.trayMax, inBucket));
  });
});
