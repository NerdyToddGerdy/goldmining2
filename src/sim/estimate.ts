/**
 * The player's belief about a hidden quantity (reserve size, grade, recovery).
 *
 * Design invariant: uncertainty is reduced, never eliminated. Refining an estimate narrows it,
 * but its width never drops below MIN_RELATIVE_WIDTH of its midpoint, no matter how good the
 * information. The true value lives elsewhere in the simulation and is never exposed through this type.
 */
export interface Estimate {
  readonly low: number;
  readonly high: number;
}

/** Narrowest an estimate may ever be, as a fraction of its midpoint. */
export const MIN_RELATIVE_WIDTH = 0.1;

export function midpoint(estimate: Estimate): number {
  return (estimate.low + estimate.high) / 2;
}

export function width(estimate: Estimate): number {
  return estimate.high - estimate.low;
}

export function estimateAround(center: number, relativeWidth: number): Estimate {
  const halfWidth = (Math.max(relativeWidth, MIN_RELATIVE_WIDTH) * Math.abs(center)) / 2;
  return { low: center - halfWidth, high: center + halfWidth };
}

/**
 * Fold an observation into an estimate. `weight` (0..1) is how much the observation is trusted:
 * the midpoint moves toward it and the range shrinks by that fraction, down to the floor.
 */
export function refine(estimate: Estimate, observation: number, weight: number): Estimate {
  const w = Math.min(Math.max(weight, 0), 1);
  const center = midpoint(estimate) + (observation - midpoint(estimate)) * w;
  const relativeWidth = center === 0 ? 0 : (width(estimate) * (1 - w)) / Math.abs(center);
  return estimateAround(center, relativeWidth);
}
