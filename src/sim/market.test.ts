import { describe, expect, it } from 'vitest';
import { MARKET, quoteSale } from './market';
import type { GoldPiece, GoldSize } from './pan';
import { PanningSession } from './panningSession';
import { createRng } from './rng';

let id = 1;
const piece = (size: GoldSize, mg: number): GoldPiece => ({ id: id++, size, mg });
const flakes = (count: number, mg: number): GoldPiece[] => Array.from({ length: count }, () => piece('flake', mg));

describe('quoteSale', () => {
  it('pays nothing for an empty vial', () => {
    expect(quoteSale([]).total).toBe(0);
  });

  it('pays by weight at spot less the buyer cut', () => {
    const quote = quoteSale(flakes(10, 5)); // 50 mg
    expect(quote.weighedMg).toBeCloseTo(50);
    expect(quote.rate).toBe(0.7);
    expect(quote.total).toBeCloseTo(50 * MARKET.spotPerMg * 0.7, 2);
  });

  it('pays a better rate for bigger lots, so saving up is worth it', () => {
    const small = quoteSale(flakes(1, 50));
    const large = quoteSale(flakes(1, 500));
    expect(large.rate).toBeGreaterThan(small.rate);
    expect(large.total / 500).toBeGreaterThan(small.total / 50);
    expect(small.nextTier?.fromMg).toBe(100);
    expect(quoteSale(flakes(1, 2000)).nextTier).toBeNull();
  });

  it('sells pickers as specimens at a premium over their weight', () => {
    const picker = quoteSale([piece('picker', 3)]);
    const sameWeight = quoteSale([piece('flake', 3)]);
    expect(picker.specimenValue).toBeGreaterThan(sameWeight.weighedValue);
    expect(picker.weighedMg).toBe(0);
  });

  it('counts pieces by size', () => {
    const quote = quoteSale([piece('fine', 0.05), piece('fine', 0.05), piece('flake', 0.3), piece('picker', 2)]);
    expect(quote.counts).toEqual({ fine: 2, flake: 1, picker: 1 });
  });
});

describe('PanningSession.sellVial', () => {
  it('turns the vial into cash and empties it', () => {
    const session = new PanningSession(createRng(1));
    session.vial.push(...flakes(4, 10), piece('picker', 2));
    const quote = session.sellVial();
    expect(session.vial).toHaveLength(0);
    expect(session.cash).toBeCloseTo(quote.total);
    expect(session.earned).toBeCloseTo(quote.total);
    expect(session.soldMg).toBeCloseTo(42);
    session.vial.push(...flakes(1, 10));
    session.sellVial();
    expect(session.cash).toBeGreaterThan(quote.total);
  });
});
