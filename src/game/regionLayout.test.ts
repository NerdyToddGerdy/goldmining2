import { describe, expect, it } from 'vitest';
import { TOWN, layoutRegion, riverY } from './regionLayout';

const ids = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);

describe('region map layout', () => {
  it('puts stretches on both banks of the river and both sides of town', () => {
    const map = layoutRegion(ids(20));
    const found = [...map.entries()].slice(1).map(([, p]) => p);
    expect(found.some((p) => p.y < riverY(p.x))).toBe(true);
    expect(found.some((p) => p.y > riverY(p.x))).toBe(true);
    expect(found.some((p) => p.x < TOWN.x)).toBe(true);
    expect(found.some((p) => p.x > TOWN.x)).toBe(true);
  });

  it('keeps every place clear of the river and of each other', () => {
    const map = layoutRegion(ids(40));
    const points = [...map.values()];
    for (const p of points) expect(Math.abs(p.y - riverY(p.x))).toBeGreaterThan(50);
    for (let i = 0; i < points.length; i++)
      for (let j = i + 1; j < points.length; j++) expect(Math.hypot(points[i]!.x - points[j]!.x, points[i]!.y - points[j]!.y)).toBeGreaterThan(90);
  });

  it('never moves a stretch when another is found, and draws the same map every time', () => {
    const before = layoutRegion(ids(12));
    const after = layoutRegion(ids(13));
    for (const [id, p] of before) expect(after.get(id)).toEqual(p);
    expect(layoutRegion(ids(12))).toEqual(before);
  });
});
