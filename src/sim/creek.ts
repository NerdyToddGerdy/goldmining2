import type { PanLoad } from './pan';
import { normal, type Rng } from './rng';

/**
 * A short stretch of creek with a handful of dig spots: the Home Creek, or a stretch found by
 * following a lead (see "Home Creek" in the design doc). Each spot has visible ground signs and
 * hidden layered reserves. Signs raise the odds that a spot is rich; only the pan confirms it.
 *
 * Side gullies join the creek. If one of them carries gold down from further up, spots just
 * downstream of its mouth are richer: panning along the creek shows a trail of colour, and a
 * test pan up the right gully turns it into a lead.
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

/** A side gully's test-pan spot. */
export interface Gully {
  /** Gold comes down this gully from a stretch further up. */
  readonly source: boolean;
  /** Its colour has already been followed to a lead. */
  traced: boolean;
}

export interface DigSpot {
  readonly id: number;
  /** Set when this spot is a test-pan spot up a side gully, not a spot on the creek itself. */
  readonly gully: Gully | null;
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
  /** The player's field notes: gravel pans from this spot and the gold they kept. Absent until the first pan. */
  notes?: { pans: number; mg: number };
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
      /** The shovel turned up a clue to ground elsewhere: an old tool, a stake, a note in a tin. */
      readonly clue: boolean;
    }
  | { readonly ok: false; readonly blocked: ShovelBlock };

export const CREEK_TUNING = {
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
  /** How much richer ground is just below a source gully's mouth, and how fast that fades downstream. */
  trailBoost: 1.8,
  trailFade: 0.2,
  /** Quality of a source gully's test-pan ground (relative to the creek), and of a barren one. */
  sourceGullyQuality: 1.2,
  barrenGullyQuality: 0.05,
  /** Chance per shovelful on the creek of turning up a clue. */
  clueChance: 0.012,
} as const;

/** What kind of stretch a creek is. */
export interface CreekProfile {
  readonly name: string;
  /** Multiplies every spot's hidden quality. */
  readonly richness: number;
  /** Only the Home Creek renews with high water; stretches found by leads are finite. */
  readonly renewing: boolean;
  readonly spotCount: number;
  readonly gullyCount: number;
  /** Chance that one of the gullies carries gold down from a further stretch. */
  readonly sourceChance: number;
}

export const HOME_CREEK_PROFILE: CreekProfile = {
  name: 'Home Creek',
  richness: 1,
  renewing: true,
  spotCount: 6,
  gullyCount: 2,
  sourceChance: 1,
};

let nextSpotId = 1;
let nextCreekId = 1;

/** The creek as plain data, for saving. */
export interface CreekSnapshot {
  readonly id: number;
  readonly profile: CreekProfile;
  readonly spots: readonly DigSpot[];
  readonly highWaterEvents: number;
}

export class Creek {
  readonly id: number;
  readonly profile: CreekProfile;
  readonly spots: DigSpot[];
  highWaterEvents = 0;

  /** A fresh creek of the given profile, or with `saved`, the creek exactly as it was left. */
  constructor(
    private readonly rng: Rng,
    saved?: CreekSnapshot,
    profile: CreekProfile = HOME_CREEK_PROFILE,
  ) {
    if (saved) {
      this.id = saved.id;
      this.profile = saved.profile;
      this.spots = structuredClone(saved.spots) as DigSpot[];
      this.highWaterEvents = saved.highWaterEvents;
      nextSpotId = Math.max(nextSpotId, ...this.spots.map((s) => s.id + 1));
      nextCreekId = Math.max(nextCreekId, this.id + 1);
      return;
    }
    this.id = nextCreekId++;
    this.profile = profile;
    const count = profile.spotCount;

    // Gullies join between spots. At most one is a source; spots below its mouth get the trail.
    const joins = shuffle(rng, Array.from({ length: count - 1 }, (_, i) => (i + 1) / count)).slice(0, profile.gullyCount);
    const sourceIndex = joins.length > 0 && rng.next() < profile.sourceChance ? rng.int(0, joins.length - 1) : -1;
    const sourceMouth = sourceIndex >= 0 ? joins[sourceIndex]! : null;

    this.spots = Array.from({ length: count }, (_, i) => {
      const position = (i + 0.5) / count;
      return this.makeSpot(position, trail(position, sourceMouth), null);
    });
    joins.forEach((position, i) => this.spots.push(this.makeGullySpot(position, i === sourceIndex)));
  }

  snapshot(): CreekSnapshot {
    return structuredClone({ id: this.id, profile: this.profile, spots: this.spots, highWaterEvents: this.highWaterEvents });
  }

  /** Spots on the creek itself, upstream to downstream (gully test spots excluded). */
  get creekSpots(): DigSpot[] {
    return this.spots.filter((s) => !s.gully);
  }

  get gullySpots(): DigSpot[] {
    return this.spots.filter((s) => s.gully);
  }

  /**
   * Add side gullies to a creek that has none (saves from before gullies existed). There is no
   * colour trail below them, since the creek's spots were set long ago, but a test pan still works.
   */
  addGullies(): void {
    if (this.gullySpots.length > 0) return;
    const count = this.creekSpots.length;
    const joins = shuffle(this.rng, Array.from({ length: count - 1 }, (_, i) => (i + 1) / count)).slice(0, this.profile.gullyCount);
    const sourceIndex = joins.length > 0 ? this.rng.int(0, joins.length - 1) : -1;
    joins.forEach((position, i) => this.spots.push(this.makeGullySpot(position, i === sourceIndex)));
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
    let clue = false;

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

      if (!spot.gully && rng.next() < T.clueChance) clue = true;

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
    return { ok: true, from, load, event, clue };
  }

  /** Note a finished pan from this spot in the field notes. */
  recordPan(spotId: number, mg: number): void {
    const spot = this.spot(spotId);
    spot.notes = { pans: (spot.notes?.pans ?? 0) + 1, mg: (spot.notes?.mg ?? 0) + mg };
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
   * Anti-death-spiral guarantee: the Home Creek never runs dry. When every spot on it is worked
   * out, high water redeposits modest surface gravel along the creek. Other stretches are finite.
   */
  ensureWorkable(): void {
    if (!this.profile.renewing) return;
    if (this.creekSpots.some((spot) => !this.isWorkedOut(spot))) return;
    this.highWater();
  }

  highWater(): void {
    const T = CREEK_TUNING;
    this.highWaterEvents += 1;
    for (const spot of this.creekSpots) {
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

  private makeGullySpot(position: number, source: boolean): DigSpot {
    const T = CREEK_TUNING;
    const quality = (source ? T.sourceGullyQuality : T.barrenGullyQuality) * this.rng.range(0.7, 1.3);
    return this.makeSpot(position, quality / this.profile.richness, { source, traced: false });
  }

  /** `boost` multiplies the random quality (the colour trail below a source gully). */
  private makeSpot(position: number, boost: number, gully: Gully | null): DigSpot {
    const T = CREEK_TUNING;
    const rng = this.rng;
    const random = gully ? 1 : Math.exp(normal(rng) * T.qualitySigma);
    const quality = random * boost * this.profile.richness;

    // Signs are evidence, not proof: richer ground shows more of them, but not reliably.
    const signChance = Math.min(0.85, Math.max(0.03, 0.25 + 0.3 * Math.log(quality)));
    // A gully test spot is just the gravel in the gully floor: no bank signs to read.
    const signs = gully ? [] : GROUND_SIGNS.filter(() => rng.next() < signChance);

    const outcrop = signs.includes('bedrockOutcrop');
    const rockBoost = signs.includes('boulderTrap') ? 0.2 : 0;
    // Gully floors are shallow: a few test pans' worth.
    const thickness: Record<LayerKind, [number, number]> = gully
      ? { overburden: [1, 1], gravel: [2, 3], payStreak: [1, 2], bedrock: [1, 1] }
      : {
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
      gully,
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

/** Quality multiplier from gold coming down a source gully: strong just below its mouth, fading downstream. */
function trail(position: number, sourceMouth: number | null): number {
  if (sourceMouth === null || position < sourceMouth) return 1;
  return 1 + CREEK_TUNING.trailBoost * Math.exp(-(position - sourceMouth) / CREEK_TUNING.trailFade);
}

function shuffle<T>(rng: Rng, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}
