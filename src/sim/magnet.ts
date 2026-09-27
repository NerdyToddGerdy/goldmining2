import type { GoldPiece, GoldSize } from './pan';
import type { Rng } from './rng';

/**
 * A magnet in a plastic sleeve, passed over the concentrate jar's black sand spread in a tray
 * (see "Pan progression" in the design doc).
 *
 * Much of black sand is magnetite. Passing the magnet lifts it into a bristling clump on the
 * sleeve, shrinking what has to be stored and panned. Held close it strips fast but drags fine gold
 * up with the sand; held high it is slow and clean. The player can shake the clump back over the
 * tray, which drops most trapped gold (and some sand) back, before stripping the clump off onto
 * the discard pile. Whatever gold is in the clump then goes with it, and nothing says whether any did.
 */

export const MAGNET_TUNING = {
  /** Share of saved black sand that is magnetite. */
  share: 0.6,
  /** Volume lifted per second held fully close, with plenty of magnetite left. */
  stripRate: 0.12,
  /** Even held high, the magnet pulls this share of the close rate. */
  minPull: 0.15,
  /** The sleeve holds this much before it stops lifting more. */
  clumpMax: 0.12,
  /** Chance per unit of magnetite fraction lifted that a piece comes up too, at full closeness. */
  lift: { fine: 0.6, flake: 0.2, picker: 0 } as Record<GoldSize, number>,
  /** Shaking the clump back drops these shares back into the tray. */
  shakeBackGold: 0.8,
  shakeBackSand: 0.3,
} as const;

/** The concentrate jar, with how much of its black sand is still magnetite. */
export interface MagnetJar {
  blackSand: number;
  magnetite: number;
  gold: GoldPiece[];
}

export interface Clump {
  sand: number;
  gold: GoldPiece[];
}

export interface MagnetStepEvents {
  /** Magnetite lifted this step. */
  readonly lifted: number;
  /** Pieces dragged up into the clump this step (shown as a glint, never as a count). */
  readonly goldLifted: number;
}

/**
 * One pass of the magnet over the jar. `closeness` 0..1: 0 held high, 1 right down on the sand.
 * Mutates the jar and clump.
 */
export function magnetStep(rng: Rng, jar: MagnetJar, clump: Clump, dt: number, closeness: number): MagnetStepEvents {
  const T = MAGNET_TUNING;
  if (jar.magnetite <= 1e-6 || clump.sand >= T.clumpMax) return { lifted: 0, goldLifted: 0 };
  const close = Math.min(1, Math.max(0, closeness));
  const pull = T.minPull + (1 - T.minPull) * close;
  // The last of the magnetite is harder to reach: it comes up in proportion to what's left.
  const available = jar.magnetite / Math.max(jar.blackSand, 1e-6);
  const lifted = Math.min(jar.magnetite, T.clumpMax - clump.sand, T.stripRate * pull * available * dt);
  const fraction = lifted / Math.max(jar.magnetite, 1e-6);
  jar.magnetite -= lifted;
  jar.blackSand -= lifted;
  clump.sand += lifted;
  let goldLifted = 0;
  jar.gold = jar.gold.filter((piece) => {
    if (rng.next() >= fraction * T.lift[piece.size] * close * close) return true;
    clump.gold.push(piece);
    goldLifted += 1;
    return false;
  });
  return { lifted, goldLifted };
}

/** Shake the clump over the tray: most trapped gold and some sand fall back. */
export function shakeBack(rng: Rng, jar: MagnetJar, clump: Clump): void {
  const T = MAGNET_TUNING;
  const back = clump.sand * T.shakeBackSand;
  clump.sand -= back;
  jar.blackSand += back;
  jar.magnetite += back;
  clump.gold = clump.gold.filter((piece) => {
    if (rng.next() >= T.shakeBackGold) return true;
    jar.gold.push(piece);
    return false;
  });
}

/** Slide the sleeve off: the clump goes on the discard pile, gold and all. Returns the pieces lost. */
export function stripOff(clump: Clump): GoldPiece[] {
  const lost = clump.gold;
  clump.sand = 0;
  clump.gold = [];
  return lost;
}
