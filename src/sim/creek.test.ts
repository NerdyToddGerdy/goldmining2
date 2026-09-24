import { describe, expect, it } from 'vitest';
import { HomeCreek, type DigSpot } from './creek';
import { createRng } from './rng';

/** Mean richness per shovelful over the whole spot: the hidden truth signs are evidence for. */
function spotValue(spot: DigSpot): number {
  const loads = spot.layers.reduce((n, l) => n + l.initialLoads, 0);
  return spot.layers.reduce((mg, l) => mg + l.richness * l.initialLoads, 0) / loads;
}

function clearBlocks(creek: HomeCreek, spot: DigSpot): void {
  while (spot.boulder) creek.pry(spot.id);
  while (spot.water >= 1) creek.bail(spot.id);
}

describe('HomeCreek', () => {
  it('is deterministic for a seed', () => {
    const a = new HomeCreek(createRng(4)).spots.map((s) => [s.signs, spotValue(s)]);
    const b = new HomeCreek(createRng(4)).spots.map((s) => [s.signs, spotValue(s)]);
    expect(a).toEqual(b);
  });

  it('makes ground signs evidence, not proof', () => {
    const spots = Array.from({ length: 300 }, (_, seed) => new HomeCreek(createRng(seed)).spots).flat();
    const bySigns = (pred: (n: number) => boolean) => spots.filter((s) => pred(s.signs.length)).map(spotValue);
    const none = bySigns((n) => n === 0);
    const many = bySigns((n) => n >= 2);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(many)).toBeGreaterThan(mean(none) * 1.5);
    // But a spot with no signs can still beat a well-marked one.
    expect(Math.max(...none)).toBeGreaterThan(Math.min(...many));
  });

  it('digs top down, and the pay streak is richer than the overburden', () => {
    const creek = new HomeCreek(createRng(8));
    const spot = creek.spots[0]!;
    const order: string[] = [];
    while (!creek.isWorkedOut(spot)) {
      clearBlocks(creek, spot);
      const result = creek.shovel(spot.id, 'spoil');
      if (result.ok && result.from !== 'slump' && order.at(-1) !== result.from) order.push(result.from);
      if (creek.highWaterEvents > 0) break;
    }
    expect(order).toEqual(['overburden', 'gravel', 'payStreak', 'bedrock']);
    const layer = (kind: string) => spot.layers.find((l) => l.kind === kind)!;
    expect(layer('payStreak').richness).toBeGreaterThan(layer('overburden').richness);
  });

  it('puts material in the pan only when shovelled into it', () => {
    const creek = new HomeCreek(createRng(2));
    const spot = creek.spots[1]!;
    const toSpoil = creek.shovel(spot.id, 'spoil');
    const toPan = creek.shovel(spot.id, 'pan');
    expect(toSpoil.ok && toSpoil.load).toBe(null);
    expect(toPan.ok && toPan.load).toBeTruthy();
    expect(spot.spoil).toBe(1);
  });

  it('is finite: a spot runs out of shovelfuls', () => {
    const creek = new HomeCreek(createRng(3));
    const spot = creek.spots[2]!;
    const total = spot.layers.reduce((n, l) => n + l.loads, 0);
    let dug = 0;
    for (let i = 0; i < 200 && !creek.isWorkedOut(spot); i++) {
      clearBlocks(creek, spot);
      const r = creek.shovel(spot.id, 'spoil');
      if (r.ok && r.from !== 'slump') dug++;
    }
    expect(dug).toBe(total);
  });

  it('blocks the shovel until a boulder is pried out or water is bailed', () => {
    const creek = new HomeCreek(createRng(5));
    const spot = creek.spots[0]!;
    spot.boulder = { pries: 2, initialPries: 2 };
    expect(creek.shovel(spot.id, 'pan')).toEqual({ ok: false, blocked: 'boulder' });
    expect(creek.pry(spot.id)).toBe(false);
    expect(creek.pry(spot.id)).toBe(true);
    spot.water = 1;
    expect(creek.shovel(spot.id, 'pan')).toEqual({ ok: false, blocked: 'flooded' });
    creek.bail(spot.id);
    expect(creek.shovel(spot.id, 'pan').ok).toBe(true);
  });

  it('never runs dry: high water redeposits gravel once every spot is worked out', () => {
    const creek = new HomeCreek(createRng(11));
    for (let i = 0; i < 2000; i++) {
      const spot = creek.spots.find((s) => !creek.isWorkedOut(s));
      expect(spot).toBeDefined();
      clearBlocks(creek, spot!);
      creek.shovel(spot!.id, 'spoil');
    }
    expect(creek.highWaterEvents).toBeGreaterThan(0);
  });
});
