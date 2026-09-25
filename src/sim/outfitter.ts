import type { PanningSession } from './panningSession';

/**
 * The outfitter in town. Buying gear never unlocks where it can be used: a sluice only sets up
 * where the ground has a sluice site. Money buys the tool; the land decides the operation.
 */

export type GearId = 'sluice' | 'bigJar';

export interface GearItem {
  readonly id: GearId;
  readonly name: string;
  readonly price: number;
  readonly description: string;
}

export const OUTFITTER: readonly GearItem[] = [
  {
    id: 'sluice',
    name: 'Hand sluice',
    price: 40,
    description: 'A four-foot box with riffles and miner’s moss. It only sets up where a creek has steady water and a drop: look for creek bends.',
  },
  {
    id: 'bigJar',
    name: 'Big concentrate jar',
    price: 10,
    description: 'Holds three times as much black sand as your jar, so you can save more pans and sluice cleanouts before stopping to pan it down.',
  },
];

export type BuyResult = 'bought' | 'alreadyOwned' | 'cantAfford';

export function buyGear(session: PanningSession, id: GearId): BuyResult {
  const item = OUTFITTER.find((g) => g.id === id);
  if (!item) throw new Error(`No gear ${id}`);
  if (session.owns(id)) return 'alreadyOwned';
  if (session.cash < item.price) return 'cantAfford';
  session.cash = Math.round((session.cash - item.price) * 100) / 100;
  session.acquire(id);
  return 'bought';
}
