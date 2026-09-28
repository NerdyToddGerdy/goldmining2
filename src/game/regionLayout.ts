/**
 * Where things sit on the region map, in map units (not screen pixels): the river winding across
 * the middle, the town on its bank, the Home Creek close by, and every stretch found spread out
 * around them on both banks and both sides of town. The camera (see RegionMapView) decides what
 * part of this is on screen.
 *
 * Positions come only from each stretch's id and the order stretches were found, so the same save
 * always draws the same map, and finding a new stretch never moves the old ones.
 */

export interface MapPoint {
  readonly x: number;
  readonly y: number;
}

/** The town sits on the north bank, where the river bends. */
export const TOWN: MapPoint = { x: 0, y: -40 };

/** The river's line: y at a given x, a slow meander through the town's bend. */
export function riverY(x: number): number {
  return 30 * Math.sin(x / 260) + 12 * Math.sin(x / 97 + 1.3);
}

/** How far a stretch keeps from the river, the town, and every other place. */
const BANK = 70;
const SPACING = 110;

/**
 * Positions for the Home Creek (first) and each found stretch (in the order found), by id.
 * Each new stretch goes a little further out than the last, on a bank and bearing seeded by its
 * id, nudged until it's clear of the river and of everything already placed.
 */
export function layoutRegion(ids: readonly number[]): Map<number, MapPoint> {
  const placed = new Map<number, MapPoint>();
  const taken: MapPoint[] = [TOWN];
  ids.forEach((id, index) => {
    if (index === 0) {
      // The Home Creek: just upstream of town, on the same bank.
      const home = { x: 170, y: -150 };
      placed.set(id, home);
      taken.push(home);
      return;
    }
    const rand = seeded(id * 7919 + 13);
    const north = rand() < 0.5;
    let spot: MapPoint | null = null;
    // Search outward from a radius that grows with how many have been found.
    for (let tries = 0; tries < 400 && !spot; tries++) {
      const reach = 190 + 55 * Math.sqrt(index) + tries * 4;
      const angle = rand() * Math.PI; // Half a turn, on the chosen bank.
      const x = TOWN.x + Math.cos(angle) * reach * 1.5;
      const y = riverY(x) + (north ? -1 : 1) * (BANK + Math.sin(angle) * reach * 0.9);
      const candidate = { x, y };
      if (taken.every((p) => Math.hypot(p.x - x, p.y - y) >= SPACING)) spot = candidate;
    }
    const final = spot ?? { x: TOWN.x + index * SPACING, y: riverY(TOWN.x + index * SPACING) - BANK * 2 };
    placed.set(id, final);
    taken.push(final);
  });
  return placed;
}

/** Where a stretch's creek meets the river: a little downstream of it, on the bank it's on. */
export function mouthOf(p: MapPoint): MapPoint {
  const x = p.x + 30;
  return { x, y: riverY(x) };
}

/** A small deterministic generator (mulberry32), so layouts never depend on game randomness. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
