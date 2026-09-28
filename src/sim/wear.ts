import type { GoldSize } from './pan';

/**
 * Machines wear (see "Economy, Depletion, and Recovery": maintenance). Every load through a
 * sluice, rocker or drywasher scuffs its riffles, moss, apron or cloth; rocks batter them harder
 * (a classifier screens those out), and overdriving speeds it up. A worn machine keeps less of the
 * fine gold, long before it looks finished. A highbanker's engine wears with its running hours,
 * faster run hot, and a worn-out engine seizes.
 *
 * A repair kit from the outfitter (bolts, moss, canvas, a gasket set) puts a machine right. Crews
 * use the player's kits as they use the fuel cans. The pan never wears: the shovel and pan never
 * need anything that can run out.
 */
export const WEAR_TUNING = {
  /** Wear per unit of material through, by machine: a sluice lasts about 200 shovelfuls, a rocker or drywasher about 100. */
  perVolume: { sluice: 0.006, rocker: 0.012, drywasher: 0.012 },
  /** Extra wear from each rock that goes through or over it. */
  perRock: 0.0015,
  /** How much faster an overdriven machine wears (overpowered water, a flooded or choppy box). */
  overStress: 1.5,
  /** Highbanker engine wear per second running at full throttle, and how much faster when hot. */
  enginePerSecond: 1 / 1800,
  hotStress: 2,
  /** At most this share of each size is lost to a worn-out machine. */
  maxLoss: { fine: 0.55, flake: 0.35, picker: 0.05 } as Record<GoldSize, number>,
  /** Offer servicing past this much wear; crews service past crewServiceAt. */
  serviceAt: 0.25,
  crewServiceAt: 0.7,
  /** Seconds a crew hand spends servicing a machine. */
  crewServiceTime: 20,
} as const;

/** Repair kits at the outfitter: price, and how many the player can carry. */
export const REPAIR_KIT = { name: 'Repair kit', price: 5, carryLimit: 4 } as const;

/** Share of a size a machine this worn still keeps, 1 new .. down to 1 - maxLoss worn out. */
export function wornKeep(wear: number, size: GoldSize): number {
  return 1 - WEAR_TUNING.maxLoss[size] * Math.min(1, Math.max(0, wear)) ** 1.5;
}

export type WearWord = 'sound' | 'wearing' | 'worn' | 'worn out';

/** Wear as the player reads it: words, never a number. */
export function wearWord(wear: number): WearWord {
  if (wear < WEAR_TUNING.serviceAt) return 'sound';
  if (wear < 0.6) return 'wearing';
  if (wear < 1) return 'worn';
  return 'worn out';
}
