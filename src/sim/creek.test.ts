import { describe, expect, it } from 'vitest';
import { Creek, HOME_CREEK_PROFILE, type DigSpot } from './creek';
import { createRng } from './rng';

/** Mean richness per shovelful over the whole spot: the hidden truth signs are evidence for. */
function spotValue(spot: DigSpot): number {
  const loads = spot.layers.reduce((n, l) => n + l.initialLoads, 0);
  return spot.layers.reduce((mg, l) => mg + l.richness * l.initialLoads, 0) / loads;
}

function clearBlocks(creek: Creek, spot: DigSpot): void {
  while (spot.boulder) creek.pry(spot.id);
  while (spot.water >= 1) creek.bail(spot.id);
}

describe('Creek', () => {
  it('is deterministic for a seed', () => {
    const a = new Creek(createRng(4)).spots.map((s) => [s.signs, spotValue(s)]);
    const b = new Creek(createRng(4)).spots.map((s) => [s.signs, spotValue(s)]);
    expect(a).toEqual(b);
  });

  it('makes ground signs evidence, not proof', () => {
    const spots = Array.from({ length: 300 }, (_, seed) => new Creek(createRng(seed)).spots).flat();
    const bySigns = (pred: (n: number) => boolean) => spots.filter((s) => pred(s.signs.length)).map(spotValue);
    const none = bySigns((n) => n === 0);
    const many = bySigns((n) => n >= 2);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(many)).toBeGreaterThan(mean(none) * 1.5);
    // But a spot with no signs can still beat a well-marked one.
    expect(Math.max(...none)).toBeGreaterThan(Math.min(...many));
  });

  it('digs top down, and the pay streak is richer than the overburden', () => {
    const creek = new Creek(createRng(8));
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
    const creek = new Creek(createRng(2));
    const spot = creek.spots[1]!;
    const toSpoil = creek.shovel(spot.id, 'spoil');
    const toPan = creek.shovel(spot.id, 'pan');
    expect(toSpoil.ok && toSpoil.load).toBe(null);
    expect(toPan.ok && toPan.load).toBeTruthy();
    expect(spot.spoil).toBe(1);
  });

  it('is finite: a spot runs out of shovelfuls', () => {
    const creek = new Creek(createRng(3));
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
    const creek = new Creek(createRng(5));
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
    const creek = new Creek(createRng(11));
    for (let i = 0; i < 2000; i++) {
      const spot = creek.spots.find((s) => !creek.isWorkedOut(s));
      expect(spot).toBeDefined();
      clearBlocks(creek, spot!);
      creek.shovel(spot!.id, 'spoil');
    }
    expect(creek.highWaterEvents).toBeGreaterThan(0);
  });

  it('keeps field notes per spot, split shallow and deep where the layer is known', () => {
    const creek = new Creek(createRng(12));
    const spot = creek.creekSpots[0]!;
    creek.recordPan(spot.id, 1, 'gravel');
    creek.recordPan(spot.id, 2, 'overburden');
    creek.recordPan(spot.id, 9, 'bedrock');
    creek.recordPan(spot.id, 4, null);
    expect(spot.notes).toEqual({ pans: 4, mg: 16, shallow: { pans: 2, mg: 3 }, deep: { pans: 1, mg: 9 } });
  });

  it('renews worked-out Home Creek spots bit by bit, without waiting for the whole creek', () => {
    const creek = new Creek(createRng(13));
    const [first, second] = creek.creekSpots;
    const workOut = (spot: DigSpot): void => {
      while (!creek.isWorkedOut(spot)) (clearBlocks(creek, spot), creek.shovel(spot.id, 'spoil'));
    };
    workOut(first!);
    workOut(second!);
    // Other spots are untouched, so the big high water hasn't come.
    expect(creek.highWaterEvents).toBe(0);
    let days = 0;
    while (creek.isWorkedOut(first!) && days < 30) (creek.trickle(0.5), (days += 0.5));
    expect(creek.isWorkedOut(first!)).toBe(false);
    expect(days).toBeLessThan(10);
    expect(creek.highWaterEvents).toBe(0);
  });

  it('renews gully test spots on the Home Creek too: colour from a source gully, next to none from a barren one', () => {
    let sourceRich = 0;
    let barrenRich = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const creek = new Creek(createRng(seed));
      for (const gully of creek.gullySpots) {
        while (!creek.isWorkedOut(gully)) (clearBlocks(creek, gully), creek.shovel(gully.id, 'spoil'));
      }
      let days = 0;
      while (creek.gullySpots.some((g) => creek.isWorkedOut(g)) && days < 60) (creek.trickle(1), days++);
      for (const gully of creek.gullySpots) {
        expect(creek.isWorkedOut(gully)).toBe(false);
        const richness = creek.currentLayer(gully)!.richness;
        if (gully.gully!.source) sourceRich += richness;
        else barrenRich += richness;
      }
    }
    expect(sourceRich).toBeGreaterThan(barrenRich * 5);
  });

  it('includes gullies in the big high water, and never renews a stretch found by a lead', () => {
    const creek = new Creek(createRng(14));
    for (const spot of creek.spots) {
      while (!creek.isWorkedOut(spot)) (clearBlocks(creek, spot), creek.shovel(spot.id, 'spoil'));
    }
    // The last shovelful on the creek brought the high water; the gullies worked out after it
    // wait for the next, or the slow renewal.
    creek.highWater();
    for (const spot of creek.spots) expect(creek.isWorkedOut(spot)).toBe(false);

    const stretch = new Creek(createRng(15), undefined, { ...HOME_CREEK_PROFILE, name: 'Found', site: 'creekStretch', renewing: false });
    for (const spot of stretch.spots) {
      while (!stretch.isWorkedOut(spot)) (clearBlocks(stretch, spot), stretch.shovel(spot.id, 'spoil'));
    }
    expect(stretch.trickle(100)).toHaveLength(0);
    for (const spot of stretch.spots) expect(stretch.isWorkedOut(spot)).toBe(true);
  });
});
