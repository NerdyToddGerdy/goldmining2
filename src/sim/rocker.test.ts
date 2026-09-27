import { describe, expect, it } from 'vitest';
import { totalMg, type PanLoad } from './pan';
import { createRng } from './rng';
import { ROCKER_TUNING, Rocker } from './rocker';

const LOAD: PanLoad = { richness: 6, clayiness: 0.3, rockiness: 0.4 };

interface Style {
  /** Seconds between strokes. */
  beat: number;
  /** Ladle whenever the box drops below this. */
  keepWater: number;
  loads?: number;
}

/** Work `loads` shovelfuls, stroking at `beat`, keeping water up, cleaning up every 6 loads. */
function run(seed: number, style: Style): { rocker: Rocker; recovered: number; seconds: number; ladles: number } {
  const rocker = new Rocker(createRng(seed));
  const { beat, keepWater, loads = 18 } = style;
  let recovered = 0;
  let seconds = 0;
  let ladles = 0;
  for (let i = 0; i < loads; i++) {
    rocker.feed(LOAD);
    for (let strokes = 0; rocker.hopperVolume > 0.01 && strokes < 200; strokes++) {
      while (rocker.water < keepWater && rocker.bucket > 0) (rocker.ladle(), ladles++);
      if (rocker.bucket === 0) rocker.fillBucket();
      rocker.step(beat);
      seconds += beat;
      rocker.rock();
    }
    rocker.tipOff();
    if (i % 6 === 5) recovered += totalMg(rocker.cleanUp().gold);
  }
  recovered += totalMg(rocker.cleanUp().gold);
  return { rocker, recovered, seconds, ladles };
}

function average(style: Style, n = 16) {
  let recovery = 0;
  let seconds = 0;
  let ladles = 0;
  for (let seed = 1; seed <= n; seed++) {
    const r = run(seed, style);
    recovery += r.recovered / r.rocker.fedMg;
    seconds += r.seconds / (style.loads ?? 18);
    ladles += r.ladles / (style.loads ?? 18);
  }
  return { recovery: recovery / n, secondsPerLoad: seconds / n, ladlesPerLoad: ladles / n };
}

describe('Rocker box', () => {
  it('recovers well with a steady beat and enough water, a few seconds a load', () => {
    const steady = average({ beat: 1, keepWater: 0.4 });
    expect(steady.recovery).toBeGreaterThan(0.72);
    expect(steady.recovery).toBeLessThan(0.92);
    expect(steady.secondsPerLoad).toBeLessThan(20);
    expect(steady.ladlesPerLoad).toBeGreaterThan(0.5);
  });

  it('loses gold when rocked too fast', () => {
    const steady = average({ beat: 1, keepWater: 0.4 });
    const frantic = average({ beat: 0.2, keepWater: 0.4 });
    expect(frantic.recovery).toBeLessThan(steady.recovery - 0.12);
  });

  it('loses fines when flooded, and uses more water', () => {
    const steady = average({ beat: 1, keepWater: 0.4 });
    const flooded = average({ beat: 1, keepWater: 1.1 });
    expect(flooded.recovery).toBeLessThan(steady.recovery - 0.1);
    expect(flooded.ladlesPerLoad).toBeGreaterThan(steady.ladlesPerLoad);
  });

  it('barely moves dry, and a slow beat is slow', () => {
    const dry = new Rocker(createRng(1));
    dry.feed(LOAD);
    const before = dry.hopperVolume;
    for (let i = 0; i < 20; i++) (dry.step(1), dry.rock());
    expect(dry.hopperVolume).toBeCloseTo(before);
    expect(dry.state).toBe('stalled');
    const slow = average({ beat: 4, keepWater: 0.4 });
    const steady = average({ beat: 1, keepWater: 0.4 });
    expect(slow.secondsPerLoad).toBeGreaterThan(steady.secondsPerLoad * 3);
  });

  it('conserves gold: all of it is on the apron, in the hopper, or lost', () => {
    const r = run(3, { beat: 0.9, keepWater: 0.5, loads: 5 });
    r.rocker.feed(LOAD);
    for (let i = 0; i < 3; i++) (r.rocker.ladle(), r.rocker.step(1), r.rocker.rock());
    const onApron = totalMg(r.rocker.cleanUp().gold);
    const hopper = r.rocker.snapshot().hopper;
    const onScreen = totalMg(hopper.gold) + totalMg(hopper.rocks.flatMap((rock) => (rock.stuckPicker ? [rock.stuckPicker] : [])));
    expect(r.recovered + onApron + onScreen + totalMg(r.rocker.lost)).toBeCloseTo(r.rocker.fedMg);
  });

  it('holds only so many ladles, and refuses a shovelful on a full hopper', () => {
    const rocker = new Rocker(createRng(4));
    let ladles = 0;
    while (rocker.ladle()) ladles++;
    expect(ladles).toBe(ROCKER_TUNING.bucketLadles);
    rocker.fillBucket();
    expect(rocker.bucket).toBe(ROCKER_TUNING.bucketLadles);
    while (rocker.feed(LOAD));
    expect(rocker.hopperFull).toBe(true);
  });

  it('round-trips through a snapshot', () => {
    const a = run(5, { beat: 1, keepWater: 0.4, loads: 3 }).rocker;
    a.feed(LOAD);
    a.ladle();
    const b = new Rocker(createRng(9), JSON.parse(JSON.stringify(a.snapshot())));
    expect(b.snapshot()).toEqual(a.snapshot());
  });
});
