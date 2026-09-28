import type { PanningSession } from './panningSession';

/**
 * The outfitter in town. Buying gear never unlocks where it can be used: a sluice only sets up
 * where the ground has a sluice site, and a pump only matters where the creek runs too thin to
 * feed one. Money buys the tool; the land decides the operation.
 */

export type GearId =
  | 'sluice'
  | 'bigJar'
  | 'classifier'
  | 'riffleMat'
  | 'legs'
  | 'pump'
  | 'magnet'
  | 'rocker'
  | 'highbanker'
  | 'drywasher'
  | 'washTub'
  | 'finishingPan'
  | 'snuffer';

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
    id: 'finishingPan',
    name: 'Finishing pan',
    price: 8,
    description: 'A small, deep-riffled pan for panning down your jar. Tip it a little less than the steel pan and it keeps far more of the fine gold, working the black sand to a thin tail that hides less. Used in town and on the stretches you find, not at the Home Creek.',
  },
  {
    id: 'snuffer',
    name: 'Snuffer bottle',
    price: 4,
    description: 'A squeeze bottle with a fine nozzle. At the reveal, touch it to the black-sand tail and draw the fine gold straight up. Work the tail thin first, or it misses specks; draw too greedily and the bottle clouds with sand and goes back to the jar. In town and on found stretches.',
  },
  {
    id: 'washTub',
    name: 'Wash tub',
    price: 8,
    description: 'A galvanized tub to carry water to dry ground, so you can pan where there is no creek. Every pan muddies it, clay worst of all, and muddy water hides colour. Changing the water means another long haul.',
  },
  {
    id: 'drywasher',
    name: 'Drywasher',
    price: 45,
    description: 'A screen over a sloped riffle tray with a cloth bottom and a hand bellows under it. Pump the bellows and air lifts the light sand away while the heavies settle into the drawer. No water at all: the tool for a dry wash. Mind the air gate, the dust in the cloth, and dry clay on the screen.',
  },
  {
    id: 'highbanker',
    name: 'Highbanker',
    price: 90,
    description: 'A sluice box on a stand with a hopper, a spray bar and a little gas engine and pump. It sets up on the bank, so you shovel straight into the hopper and it moves far more gravel than the hand sluice. Prime the pump, mind the throttle and the heat, and keep it fuelled. Needs strong water and room: a creek bend, a gravel bar, or a ravine.',
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

/** Fuel for the pump or the highbanker's engine: one can fills a tank. */
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
  if (!session.owns('pump') && !session.owns('highbanker')) return 'noPump';
  if (session.fuelCans >= FUEL_CAN.carryLimit) return 'full';
  if (session.cash < FUEL_CAN.price) return 'cantAfford';
  session.cash = Math.round((session.cash - FUEL_CAN.price) * 100) / 100;
  session.fuelCans += 1;
  return 'bought';
}
