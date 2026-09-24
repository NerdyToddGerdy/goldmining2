import { describe, expect, it } from 'vitest';
import { SloshTracker } from './sloshTracker';

const R = 100;
const DT = 1 / 60;

/** Drive the tracker with x(t) for `seconds`, one move per frame; returns the samples. */
function drive(tracker: SloshTracker, x: (t: number) => number, seconds: number) {
  const samples = [];
  tracker.start(x(0));
  for (let t = DT; t <= seconds; t += DT) {
    tracker.move(x(t), R);
    samples.push({ t, ...tracker.sample(DT, R) });
  }
  return samples;
}

const strokes = (amplitude: number, hz: number) => (t: number) => 500 + amplitude * R * Math.sin(2 * Math.PI * hz * t);

describe('SloshTracker', () => {
  it('reads steady back-and-forth strokes as strong slosh', () => {
    const samples = drive(new SloshTracker(), strokes(0.5, 2), 3);
    expect(samples.at(-1)!.slosh).toBeGreaterThan(0.7);
  });

  it('reads faster strokes as more slosh', () => {
    const slow = drive(new SloshTracker(), strokes(0.5, 0.7), 3).at(-1)!.slosh;
    const fast = drive(new SloshTracker(), strokes(0.5, 2), 3).at(-1)!.slosh;
    expect(fast).toBeGreaterThan(slow + 0.2);
  });

  it('lets one long drag die away once it stops reversing', () => {
    const samples = drive(new SloshTracker(), (t) => 100 + t * 3 * R, 3);
    expect(samples.find((s) => s.t > 0.3)!.slosh).toBeGreaterThan(0.2);
    expect(samples.at(-1)!.slosh).toBeLessThan(0.05);
  });

  it('reads a still hand as no slosh', () => {
    expect(drive(new SloshTracker(), () => 300, 2).at(-1)!.slosh).toBeLessThan(0.01);
  });

  it('ignores tiny jitter', () => {
    const samples = drive(new SloshTracker(), strokes(0.02, 4), 3);
    expect(samples.at(-1)!.slosh).toBeLessThan(0.05);
  });

  it('points the offset the way the hand is pushing', () => {
    const samples = drive(new SloshTracker(), strokes(0.5, 1), 1);
    const toward = samples.find((s) => Math.abs(s.t - 0.25) < DT)!;
    const away = samples.find((s) => Math.abs(s.t - 0.75) < DT)!;
    expect(toward.offset).toBeGreaterThan(0.1);
    expect(away.offset).toBeLessThan(-0.1);
  });

  it('settles back to nothing when the finger lifts', () => {
    const tracker = new SloshTracker();
    drive(tracker, strokes(0.5, 2), 1);
    tracker.end();
    let last = { slosh: 1, offset: 1 };
    for (let i = 0; i < 180; i++) last = tracker.sample(DT, R);
    expect(last.slosh).toBeLessThan(0.02);
    expect(Math.abs(last.offset)).toBeLessThan(0.02);
  });
});
