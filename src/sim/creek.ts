import type { PanLoad } from './pan';
import type { Rng } from './rng';

/**
 * The Home Creek: a short stretch of creek with a handful of dig spots (see "Home Creek" in the
 * design doc). Each spot has visible ground signs and hidden layered reserves. Signs raise the
 * odds that a spot is rich; only the pan confirms it.
 *
 * Digging is done one shovelful at a time, top down: overburden, gravel, the pay streak, then
 * bedrock cracks. A shovelful either goes into the pan or gets tossed aside. Boulders, seeping
 * water, and bank slumps interrupt the work.
 */

export type LayerKind = 'overburden' | 'gravel' | 'payStreak' | 'bedrock';

export type GroundSign = 'insideBend' | 'bedrockOutcrop' | 'blackSandStreak' | 'mossLine' | 'boulderTrap';

export const GROUND_SIGNS: readonly GroundSign[] = ['insideBend', 'bedrockOutcrop', 'blackSandStreak', 'mossLine', 'boulderTrap'];

export interface Layer {
  readonly kind: LayerKind;
  /** Shovelfuls left in this layer at this spot. */
  loads: number;
  readonly initialLoads: number;
  /** Hidden: expected mg of gold per shovelful. */
  readonly richness: number;
  readonly clayiness: number;
  readonly rockiness: number;
}

export interface Boulder {
  /** Pries with the shovel still needed to lever it out. */
  pries: number;
  readonly initialPries: number;
}

export interface DigSpot {
  readonly id: number;
  /** 0..1 along the creek, upstream to downstream. */
  readonly position: number;
  readonly signs: readonly GroundSign[];
  /** Top to bottom. */
  readonly layers: Layer[];
  /** Shovelfuls of collapsed bank lying in the hole, to be cleared before digging continues. */
  slumped: number;
  boulder: Boulder | null;
  /** Water seeped into the hole: 0 dry, 1 flooded. */
  water: number;
  /** Shovelfuls tossed onto the spoil pile. */
  spoil: number;
  /** How quickly water seeps in as the hole deepens. */
  readonly waterTable: number;
  /** How likely the hole walls are to slump. */
  readonly instability: number;
}

export type ShovelBlock = 'boulder' | 'flooded' | 'workedOut';

export type ShovelResult =
  | {
      readonly ok: true;
      /** What the shovelful came from. */
      readonly from: LayerKind | 'slump';
      /** The material, when it went into the pan. */
      readonly load: PanLoad | null;
      /** Something that happened because of this shovelful. */
      readonly event: 'boulder' | 'slump' | 'reachedBedrock' | 'workedOut' | null;
    }
  | { readonly ok: false; readonly blocked: ShovelBlock };

export const CREEK_TUNING = {
  spotCount: 6,
  /** mg per shovelful for a spot of average quality, before the layer factor. */
  baseRichness: 3,
  /** Spread of hidden spot quality (lognormal sigma). */
  qualitySigma: 0.7,
  layerRichness: { overburden: 0.08, gravel: 0.5, payStreak: 2.2, bedrock: 4 } as Record<LayerKind, number>,
  layerClay: { overburden: 0.7, gravel: 0.3, payStreak: 0.5, bedrock: 0.4 } as Record<LayerKind, number>,
  layerRock: { overburden: 0.1, gravel: 0.8, payStreak: 0.6, bedrock: 0.1 } as Record<LayerKind, number>,
  /** Water seeping in per shovelful, by layer, scaled by the spot's water table. */
  seepPerLoad: { overburden: 0, gravel: 0.06, payStreak: 0.14, bedrock: 0.2 } as Record<LayerKind, number>,
  bailAmount: 0.3,
  boulderChance: 0.18,
  slumpChance: 0.1,
  /** Richness of redeposited surface gravel after high water, relative to base. */
  highWaterRichness: 0.5,
} as const;

let nextSpotId = 1;

export class HomeCreek {
  readonly spots: DigSpot[];
  highWaterEvents = 0;

  constructor(private readonly rng: Rng) {
    const count = CREEK_TUNING.spotCount;
    this.spots = Array.from({ length: count }, (_, i) => this.makeSpot((i + 0.5) / count));
  }

  spot(id: number): DigSpot {
    const spot = this.spots.find((s) => s.id === id);
    if (!spot) throw new Error(`No dig spot ${id}`);
    return spot;
  }

  /** The layer the next shovelful comes from, or null when the spot is worked out. */
  currentLayer(spot: DigSpot): Layer | null {
    return spot.layers.find((layer) => layer.loads > 0) ?? null;
  }

  isWorkedOut(spot: DigSpot): boolean {
    return spot.slumped === 0 && this.currentLayer(spot) === null;
  }

  /** Why the shovel can't go in right now, if it can't. */
  blockedBy(spot: DigSpot): ShovelBlock | null {
    if (this.isWorkedOut(spot)) return 'workedOut';
    if (spot.boulder) return 'boulder';
    if (spot.water >= 1) return 'flooded';
    return null;
  }

  /** Dig one shovelful, into the pan or onto the spoil pile. */
  shovel(spotId: number, into: 'pan' | 'spoil'): ShovelResult {
    const T = CREEK_TUNING;
    const spot = this.spot(spotId);
    const blocked = this.blockedBy(spot);
    if (blocked) return { ok: false, blocked };

    const rng = this.rng;
    let from: LayerKind | 'slump';
    let load: PanLoad | null = null;
    let event: Extract<ShovelResult, { ok: true }>['event'] = null;

    if (spot.slumped > 0) {
      // Collapsed bank is mostly overburden with a little of whatever it fell onto.
      spot.slumped -= 1;
      from = 'slump';
      const top = spot.layers[0];
      if (into === 'pan' && top) load = this.loadFrom({ ...top, richness: top.richness * 1.5 });
    } else {
      const layer = this.currentLayer(spot);
      if (!layer) return { ok: false, blocked: 'workedOut' };
      layer.loads -= 1;
      from = layer.kind;
      if (into === 'pan') load = this.loadFrom(layer);

      spot.water = Math.min(1, spot.water + spot.waterTable * T.seepPerLoad[layer.kind] * rng.range(0.7, 1.3));

      const next = this.currentLayer(spot);
      if (next?.kind === 'bedrock' && layer.kind !== 'bedrock') event = 'reachedBedrock';
      if ((layer.kind === 'gravel' || layer.kind === 'payStreak') && rng.next() < layer.rockiness * T.boulderChance) {
        const pries = rng.int(2, 4);
        spot.boulder = { pries, initialPries: pries };
        event = 'boulder';
      } else if (layer.kind !== 'overburden' && rng.next() < spot.instability * T.slumpChance) {
        spot.slumped += rng.int(1, 2);
        event = 'slump';
      }
    }

    if (into === 'spoil') spot.spoil += 1;
    if (this.isWorkedOut(spot)) {
      event = 'workedOut';
      this.ensureWorkable();
    }
    return { ok: true, from, load, event };
  }

  /** Lever the boulder with the shovel. Returns true once it comes free. */
  pry(spotId: number): boolean {
    const spot = this.spot(spotId);
    if (!spot.boulder) return false;
    spot.boulder.pries -= 1;
    if (spot.boulder.pries > 0) return false;
    spot.boulder = null;
    return true;
  }

  /** Bail seeped water out of the hole with the pan. */
  bail(spotId: number): void {
    const spot = this.spot(spotId);
    spot.water = Math.max(0, spot.water - CREEK_TUNING.bailAmount);
  }

  /**
   * Anti-death-spiral guarantee: the Home Creek never runs dry. When every spot is worked out,
   * high water redeposits modest surface gravel along the creek.
   */
  ensureWorkable(): void {
    if (this.spots.some((spot) => !this.isWorkedOut(spot))) return;
    this.highWater();
  }

  highWater(): void {
    const T = CREEK_TUNING;
    this.highWaterEvents += 1;
    for (const spot of this.spots) {
      if (!this.isWorkedOut(spot)) continue;
      spot.water = 0;
      spot.boulder = null;
      const loads = this.rng.int(2, 4);
      spot.layers.unshift({
        kind: 'gravel',
        loads,
        initialLoads: loads,
        richness: T.baseRichness * T.highWaterRichness * this.rng.range(0.5, 1.5),
        clayiness: T.layerClay.gravel,
        rockiness: T.layerRock.gravel,
      });
    }
  }

  private loadFrom(layer: Layer): PanLoad {
    return {
      richness: layer.richness * this.rng.range(0.6, 1.4),
      clayiness: layer.clayiness,
      rockiness: layer.rockiness,
    };
  }

  private makeSpot(position: number): DigSpot {
    const T = CREEK_TUNING;
    const rng = this.rng;
    const quality = Math.exp(normal(rng) * T.qualitySigma);

    // Signs are evidence, not proof: richer ground shows more of them, but not reliably.
    const signChance = Math.min(0.85, Math.max(0.03, 0.25 + 0.3 * Math.log(quality)));
    const signs = GROUND_SIGNS.filter(() => rng.next() < signChance);

    const outcrop = signs.includes('bedrockOutcrop');
    const rockBoost = signs.includes('boulderTrap') ? 0.2 : 0;
    const thickness: Record<LayerKind, [number, number]> = {
      overburden: outcrop ? [1, 3] : [3, 7],
      gravel: [3, 7],
      payStreak: [2, 5],
      bedrock: [1, 3],
    };
    const kinds: LayerKind[] = ['overburden', 'gravel', 'payStreak', 'bedrock'];
    const layers = kinds.map((kind): Layer => {
      const [min, max] = thickness[kind];
      const loads = rng.int(min, max);
      return {
        kind,
        loads,
        initialLoads: loads,
        richness: T.baseRichness * quality * T.layerRichness[kind] * rng.range(0.7, 1.3),
        clayiness: T.layerClay[kind],
        rockiness: Math.min(1, T.layerRock[kind] + rockBoost),
      };
    });

    return {
      id: nextSpotId++,
      position,
      signs,
      layers,
      slumped: 0,
      boulder: null,
      water: 0,
      spoil: 0,
      waterTable: rng.range(0.4, 1.2),
      instability: rng.range(0.2, 1),
    };
  }
}

/** Standard normal sample (Box-Muller). */
function normal(rng: Rng): number {
  const u = Math.max(rng.next(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng.next());
}
