import { Pan, totalMg, type DigSpot, type GoldPiece } from './pan';
import type { Rng } from './rng';

/** Black sand (pan-volume units) the concentrate jar holds. */
export const JAR_CAPACITY = 0.5;

/**
 * A stretch of panning at one dig spot: the current pan plus what the player carries,
 * the vial of recovered gold and the concentrate jar of saved black sand.
 */
export class PanningSession {
  pan: Pan;
  readonly vial: GoldPiece[] = [];
  readonly jar: { blackSand: number; gold: GoldPiece[] } = { blackSand: 0, gold: [] };
  pansWorked = 0;

  constructor(
    private readonly rng: Rng,
    readonly spot: DigSpot,
  ) {
    this.pan = new Pan(rng, spot);
  }

  rakeRock(rockId: number): GoldPiece | null {
    const picker = this.pan.rakeRock(rockId);
    if (picker) this.vial.push(picker);
    return picker;
  }

  collect(saveBlackSand: boolean): GoldPiece[] {
    const { collected, toJar, blackSand } = this.pan.collect(saveBlackSand);
    this.vial.push(...collected);
    this.jar.gold.push(...toJar);
    this.jar.blackSand += blackSand;
    this.pansWorked += 1;
    return collected;
  }

  /** Scoop the next load from the same spot. */
  nextPan(): Pan {
    this.pan = new Pan(this.rng, this.spot);
    return this.pan;
  }

  get vialMg(): number {
    return totalMg(this.vial);
  }
}
