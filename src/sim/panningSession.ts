import { Pan, totalMg, type PanLoad, type GoldPiece } from './pan';
import type { Rng } from './rng';

/** Black sand (pan-volume units) the concentrate jar holds. */
export const JAR_CAPACITY = 0.5;

/**
 * The player's panning: the pan (empty until a shovelful goes in), the vial of recovered gold,
 * and the concentrate jar of saved black sand.
 */
export class PanningSession {
  pan: Pan | null = null;
  readonly vial: GoldPiece[] = [];
  readonly jar: { blackSand: number; gold: GoldPiece[] } = { blackSand: 0, gold: [] };
  pansWorked = 0;

  constructor(private readonly rng: Rng) {}

  /** True when the pan can take a new shovelful: none yet, or the last one is finished. */
  get panIsFree(): boolean {
    return this.pan === null || this.pan.phase === 'emptied';
  }

  /** Fill the pan with a shovelful. */
  startPan(load: PanLoad): Pan {
    if (!this.panIsFree) throw new Error('The pan is still in use');
    this.pan = new Pan(this.rng, load);
    return this.pan;
  }

  rakeRock(rockId: number): GoldPiece | null {
    const picker = this.pan?.rakeRock(rockId) ?? null;
    if (picker) this.vial.push(picker);
    return picker;
  }

  collect(saveBlackSand: boolean): GoldPiece[] {
    if (!this.pan) return [];
    const { collected, toJar, blackSand } = this.pan.collect(saveBlackSand);
    this.vial.push(...collected);
    this.jar.gold.push(...toJar);
    this.jar.blackSand += blackSand;
    this.pansWorked += 1;
    return collected;
  }

  get vialMg(): number {
    return totalMg(this.vial);
  }
}
