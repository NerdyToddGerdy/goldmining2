import type { GoldPiece, GoldSize } from './pan';

/**
 * The gold buyer in town. Gold is weighed and paid for at the spot price less the buyer's
 * cut, which shrinks for bigger lots, so saving up the vial pays better than selling every
 * speck. Pickers sell as specimens, at a premium over their weight.
 */
export const MARKET = {
  /**
   * Dollars per milligram of placer gold at spot ($500 a gram). A game price, set so careful
   * panning through a Home Creek spot averages about $1.70 a pan and the $40 sluice takes
   * roughly 25 good pans.
   */
  spotPerMg: 0.5,
  /** Share of spot the buyer pays, by lot weight (mg of by-weight gold). */
  tiers: [
    { fromMg: 0, rate: 0.7 },
    { fromMg: 100, rate: 0.8 },
    { fromMg: 1000, rate: 0.88 },
  ],
  /** Pickers are sold whole as specimens, at this multiple of spot. */
  specimenMultiple: 1.5,
} as const;

export interface SaleQuote {
  readonly counts: Record<GoldSize, number>;
  /** Fines and flakes, paid by weight. */
  readonly weighedMg: number;
  /** Pickers, paid as specimens. */
  readonly specimenMg: number;
  /** Share of spot paid for the weighed gold. */
  readonly rate: number;
  readonly weighedValue: number;
  readonly specimenValue: number;
  readonly total: number;
  /** Weight at which the next better rate applies, if any. */
  readonly nextTier: { readonly fromMg: number; readonly rate: number } | null;
}

export function quoteSale(pieces: readonly GoldPiece[]): SaleQuote {
  const counts: Record<GoldSize, number> = { fine: 0, flake: 0, picker: 0 };
  let weighedMg = 0;
  let specimenMg = 0;
  for (const piece of pieces) {
    counts[piece.size] += 1;
    if (piece.size === 'picker') specimenMg += piece.mg;
    else weighedMg += piece.mg;
  }
  const tier = [...MARKET.tiers].reverse().find((t) => weighedMg >= t.fromMg) ?? MARKET.tiers[0];
  const nextTier = MARKET.tiers.find((t) => t.fromMg > weighedMg) ?? null;
  const weighedValue = roundCents(weighedMg * MARKET.spotPerMg * tier.rate);
  const specimenValue = roundCents(specimenMg * MARKET.spotPerMg * MARKET.specimenMultiple);
  return {
    counts,
    weighedMg,
    specimenMg,
    rate: tier.rate,
    weighedValue,
    specimenValue,
    total: roundCents(weighedValue + specimenValue),
    nextTier,
  };
}

function roundCents(dollars: number): number {
  return Math.round(dollars * 100) / 100;
}
