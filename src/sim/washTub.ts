/**
 * A wash tub: water carried to ground that has none, so the pan works at a dry wash (see "Pan
 * progression" in the design doc). Every pan dipped in it clouds the water, clay-rich gravel most,
 * and muddy water settles the pan slower and hides colour. Changing the water means another trip
 * to wherever water is, so the player trades pan quality against time.
 */

export const WASH_TUB_TUNING = {
  /** Share of a full tub each pan uses. */
  perPan: 0.1,
  /** Murk each pan adds, plus more for clay. */
  muddyBase: 0.06,
  muddyPerClay: 0.15,
} as const;

export interface WashTub {
  /** 0 empty, 1 full. */
  water: number;
  /** 0 clear, 1 thick mud. */
  turbidity: number;
}

export function freshTub(): WashTub {
  return { water: 1, turbidity: 0 };
}

export function tubHasWater(tub: WashTub): boolean {
  return tub.water >= WASH_TUB_TUNING.perPan - 1e-9;
}

/**
 * Dip a pan in the tub. Returns how muddy the water is for this pan (what it was before this pan
 * clouded it further), or null if the tub is too low to pan in.
 */
export function dipPan(tub: WashTub, clayiness: number): number | null {
  if (!tubHasWater(tub)) return null;
  const murk = tub.turbidity;
  tub.water = Math.max(0, tub.water - WASH_TUB_TUNING.perPan);
  tub.turbidity = Math.min(1, tub.turbidity + WASH_TUB_TUNING.muddyBase + clayiness * WASH_TUB_TUNING.muddyPerClay);
  return murk;
}

/** Tip out the muddy water and fill it clean. */
export function refillTub(tub: WashTub): void {
  tub.water = 1;
  tub.turbidity = 0;
}
