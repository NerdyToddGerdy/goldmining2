import { describe, expect, it } from 'vitest';
import { MIN_RELATIVE_WIDTH, estimateAround, midpoint, refine, width } from './estimate';

describe('Estimate', () => {
  it('moves toward observations', () => {
    const e = refine(estimateAround(100, 1), 60, 0.5);
    expect(midpoint(e)).toBeCloseTo(80);
  });

  it('never becomes exact, even after perfect information', () => {
    let e = estimateAround(100, 1);
    for (let i = 0; i < 50; i++) e = refine(e, 100, 1);
    expect(width(e)).toBeGreaterThan(0);
    expect(width(e) / midpoint(e)).toBeCloseTo(MIN_RELATIVE_WIDTH);
  });

  it('cannot be created narrower than the floor', () => {
    const e = estimateAround(50, 0);
    expect(width(e)).toBeCloseTo(50 * MIN_RELATIVE_WIDTH);
  });
});
