import { Pan, totalMg, type PanLoad, type GoldPiece } from './pan';
import type { Rng } from './rng';

/** Black sand (pan-volume units) the concentrate jar holds. */
export const JAR_CAPACITY = 0.5;
/** Most black sand poured into the pan at once; the rest waits in the jar. */
export const CONCENTRATE_POUR = 0.25;
/** Less than this in the jar is not worth panning. */
export const MIN_CONCENTRATE = 0.005;

/**
 * The player's panning: the pan (empty until a shovelful goes in), the vial of recovered gold,
 * and the concentrate jar of saved black sand.
 */
export class PanningSession {
  pan: Pan | null = null;
  readonly vial: GoldPiece[] = [];
  readonly jar: { blackSand: number; gold: GoldPiece[] } = { blackSand: 0, gold: [] };
  /** Pans of creek gravel worked; re-panned concentrate is not counted. */
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

  get canPanConcentrate(): boolean {
    return this.panIsFree && this.jar.blackSand >= MIN_CONCENTRATE;
  }

  /**
   * Pour black sand from the jar into the pan to re-pan it. The gold saved in the jar comes with
   * it in proportion to how much of the jar is poured.
   */
  startConcentratePan(): Pan {
    if (!this.canPanConcentrate) throw new Error('Nothing to pour, or the pan is in use');
    const amount = Math.min(this.jar.blackSand, CONCENTRATE_POUR);
    const share = amount / this.jar.blackSand;
    const poured: GoldPiece[] = [];
    const kept: GoldPiece[] = [];
    for (const piece of this.jar.gold) (share >= 1 || this.rng.next() < share ? poured : kept).push(piece);
    this.jar.gold = kept;
    this.jar.blackSand -= amount;
    this.pan = new Pan(this.rng, { richness: 0, clayiness: 0, rockiness: 0 }, { blackSand: amount, gold: poured });
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
    if (this.pan.kind === 'gravel') this.pansWorked += 1;
    return collected;
  }

  get vialMg(): number {
    return totalMg(this.vial);
  }
}
