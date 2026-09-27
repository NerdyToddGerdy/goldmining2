import type { PanningSession } from './panningSession';

/**
 * The outfitter in town. Buying gear never unlocks where it can be used: a sluice only sets up
 * where the ground has a sluice site, and a pump only matters where the creek runs too thin to
 * feed one. Money buys the tool; the land decides the operation.
 */

export type GearId = 'sluice' | 'bigJar' | 'classifier' | 'riffleMat' | 'legs' | 'pump' | 'magnet' | 'rocker';

export interface GearItem {
  readonly id: GearId;
  readonly name: string;
  readonly price: number;
  readonly description: string;
  /** Gear this fits onto, which has to be owned first. */
  readonly requires?: GearId;
}

export const OUTFITTER: readonly GearItem[] = [
  {
    id: 'classifier',
    name: 'Hand classifier',
    price: 15,
    description: 'A screen over a bucket, with coarse and fine mesh. Shake your gravel through it: rocks stay on top to be checked for wedged pickers, and clean, even material goes to the pan or sluice. Too much for the narrow Home Creek; use it on the stretches you find.',
  },
  {
    id: 'rocker',
    name: 'Rocker box',
    price: 20,
    description: 'A box on curved rockers, with a screen, a canvas apron and riffles. Ladle water over the gravel and rock it on a steady beat: quicker than panning, and it needs no sluice site, only the water you carry. Rock too fast or flood it and gold goes out the end. For the stretches you find, not the narrow Home Creek.',
  },
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
  {
    id: 'magnet',
    name: 'Magnet in a sleeve',
    price: 6,
    description: 'Pass it over your jar of black sand and the magnetite leaps up onto it, so the jar holds more and pans down faster. Held close it drags fine gold up too: shake the clump back before you strip it off. For use in town or on the stretches you find.',
  },
  {
    id: 'riffleMat',
    name: 'Riffle insert and ribbed mat',
    price: 25,
    requires: 'sluice',
    description: 'Deeper riffles over a ribbed mat in place of plain moss. Catches more of the fine gold and holds it when the water runs hard. You only see the difference at cleanout.',
  },
  {
    id: 'legs',
    name: 'Adjustable legs',
    price: 12,
    requires: 'sluice',
    description: 'Screw legs for the sluice, so you set its slope instead of taking the drop the site gives you. Worth it where a site is too flat (gravel piles up) or too steep (gold shoots through).',
  },
  {
    id: 'pump',
    name: 'Recirculating pump',
    price: 60,
    requires: 'sluice',
    description: 'A small gas pump that feeds the sluice from a settling pool. It runs a sluice where there is room and a drop but the creek is too thin, for as long as its fuel lasts. It buys nothing at a strong creek.',
  },
];

/** Fuel for the pump: one can fills its tank. */
export const FUEL_CAN = { name: 'Can of fuel', price: 2, carryLimit: 6 } as const;

export type BuyResult = 'bought' | 'alreadyOwned' | 'cantAfford' | 'needsBase';

export function buyGear(session: PanningSession, id: GearId): BuyResult {
  const item = OUTFITTER.find((g) => g.id === id);
  if (!item) throw new Error(`No gear ${id}`);
  if (session.owns(id)) return 'alreadyOwned';
  if (item.requires && !session.owns(item.requires)) return 'needsBase';
  if (session.cash < item.price) return 'cantAfford';
  session.cash = Math.round((session.cash - item.price) * 100) / 100;
  session.acquire(id);
  return 'bought';
}

export type FuelResult = 'bought' | 'noPump' | 'full' | 'cantAfford';

export function buyFuel(session: PanningSession): FuelResult {
  if (!session.owns('pump')) return 'noPump';
  if (session.fuelCans >= FUEL_CAN.carryLimit) return 'full';
  if (session.cash < FUEL_CAN.price) return 'cantAfford';
  session.cash = Math.round((session.cash - FUEL_CAN.price) * 100) / 100;
  session.fuelCans += 1;
  return 'bought';
}
