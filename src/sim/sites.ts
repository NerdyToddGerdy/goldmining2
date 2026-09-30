import type { LayerKind } from './creek';

/**
 * Site archetypes (see "Site archetypes" in the design doc). Every stretch the player finds is
 * one of these, and what it is decides what can be done there: how much room there is, whether
 * there is water, how rich and how deep the ground runs, what goes wrong. Gear is never unlocked
 * by level or cash; a site either has the room and water for it or it doesn't.
 */

export type SiteKind = 'homeCreek' | 'creekStretch' | 'creekBend' | 'gravelBar' | 'ravine' | 'dryWash' | 'oldDiggings';

type Range = readonly [number, number];

export interface SiteTraits {
  readonly label: string;
  /** Room on the bank: a narrow site has no flat ground for a rocker. */
  readonly footprint: 'narrow' | 'normal' | 'wide';
  /** Creek water to pan and sluice in, or none at all. */
  readonly water: 'creek' | 'dry';
  readonly spots: Range;
  readonly gullies: Range;
  readonly sourceChance: number;
  /** Sluice sites with steady water, and the chance of one thin-water bench needing a pump. */
  readonly sluiceSites: Range;
  readonly pumpSiteChance: number;
  readonly sluiceFlow: Range;
  readonly sluiceSlope: Range;
  /** Multiplies how many shovelfuls each layer holds, and how rich it is. */
  readonly layerLoads: Record<LayerKind, number>;
  readonly layerRichness: Record<LayerKind, number>;
  readonly instability: Range;
  readonly waterTable: Range;
  /** Multiplies the chance of hitting a boulder. */
  readonly boulders: number;
  /** Extra game seconds to walk in, on top of the usual trip between stretches. */
  readonly access: number;
  /** Chance per game day of high water sweeping the site. */
  readonly floodPerDay: number;
  /** Seconds to fill the rocker's bucket here. */
  readonly fetchSeconds: number;
  /** Holding fee per game day. */
  readonly fee: number;
  /** Most hired hands the ground has room and work for (see "Staff capacity by site scale"). */
  readonly crewMax: number;
  /** Dollars a day per crew member there for supplies packed in: food, tools, water to a dry wash. */
  readonly supplies: number;
  /** What ground like this means for the work, as a lead or the notebook puts it. */
  readonly groundNote: string;
  /** Worked-over ground: share of each layer's coarse gold already taken (see PanLoad.coarseTaken). */
  readonly coarseTaken?: Record<LayerKind, number>;
  /** Multiplies each layer's clay: washed tailings have little left. */
  readonly layerClay?: Record<LayerKind, number>;
  /** Multiplies the chance of the shovel turning up a clue. */
  readonly clues?: number;
  /** Dollars of salvage left lying about, found on reaching the site. */
  readonly salvage?: Range;
}

const EVEN: Record<LayerKind, number> = { overburden: 1, gravel: 1, payStreak: 1, bedrock: 1 };

export const SITE_TRAITS: Record<SiteKind, SiteTraits> = {
  homeCreek: {
    label: 'Home Creek',
    footprint: 'narrow',
    water: 'creek',
    spots: [6, 6],
    gullies: [2, 2],
    sourceChance: 1,
    sluiceSites: [0, 0],
    pumpSiteChance: 0,
    sluiceFlow: [0.6, 1],
    sluiceSlope: [0.3, 0.9],
    layerLoads: EVEN,
    layerRichness: EVEN,
    instability: [0.2, 1],
    waterTable: [0.4, 1.2],
    boulders: 1,
    access: 0,
    floodPerDay: 0,
    fetchSeconds: 3,
    fee: 0,
    crewMax: 0,
    supplies: 0,
    groundNote: 'shovel and pan ground',
  },
  creekStretch: {
    label: 'Creek stretch',
    footprint: 'normal',
    water: 'creek',
    spots: [3, 5],
    gullies: [0, 2],
    sourceChance: 0.5,
    sluiceSites: [0, 0],
    pumpSiteChance: 0.45,
    sluiceFlow: [0.1, 0.3],
    sluiceSlope: [0.15, 0.95],
    layerLoads: EVEN,
    layerRichness: EVEN,
    instability: [0.2, 1],
    waterTable: [0.4, 1.2],
    boulders: 1,
    access: 0,
    floodPerDay: 0,
    fetchSeconds: 7,
    fee: 1,
    crewMax: 2,
    supplies: 0,
    groundNote: 'shovel, pan and rocker ground, no steady water for a sluice',
  },
  creekBend: {
    label: 'Creek bend',
    footprint: 'normal',
    water: 'creek',
    spots: [3, 5],
    gullies: [0, 2],
    sourceChance: 0.5,
    sluiceSites: [1, 2],
    pumpSiteChance: 0,
    sluiceFlow: [0.6, 1],
    sluiceSlope: [0.15, 0.95],
    layerLoads: EVEN,
    layerRichness: EVEN,
    instability: [0.2, 1],
    waterTable: [0.4, 1.2],
    boulders: 1,
    access: 0,
    floodPerDay: 0,
    fetchSeconds: 3,
    fee: 2,
    crewMax: 2,
    supplies: 0,
    groundNote: 'steady water and room on the bank: sluice ground',
  },
  gravelBar: {
    label: 'Gravel bar',
    footprint: 'wide',
    water: 'creek',
    spots: [6, 8],
    gullies: [0, 1],
    sourceChance: 0.4,
    sluiceSites: [2, 3],
    pumpSiteChance: 0,
    sluiceFlow: [0.6, 0.95],
    sluiceSlope: [0.25, 0.7],
    // Shallow: little overburden, a broad gravel and pay layer, thin bedrock.
    layerLoads: { overburden: 0.4, gravel: 1.3, payStreak: 1.3, bedrock: 0.6 },
    layerRichness: { overburden: 1, gravel: 1.2, payStreak: 0.9, bedrock: 0.8 },
    instability: [0.3, 0.9],
    waterTable: [0.8, 1.4],
    boulders: 0.6,
    access: 0,
    floodPerDay: 0.2,
    fetchSeconds: 3,
    fee: 3,
    crewMax: 4,
    supplies: 0,
    groundNote: 'wide and shallow, with sluice sites and room for a big crew, but high water comes through',
  },
  ravine: {
    label: 'Narrow ravine',
    footprint: 'narrow',
    water: 'creek',
    spots: [2, 3],
    gullies: [0, 1],
    sourceChance: 0.5,
    sluiceSites: [0, 1],
    pumpSiteChance: 0,
    sluiceFlow: [0.85, 1],
    sluiceSlope: [0.7, 1],
    // Rich pockets on bedrock, under a lot of broken rock.
    layerLoads: { overburden: 1, gravel: 0.8, payStreak: 0.8, bedrock: 1.5 },
    layerRichness: { overburden: 1, gravel: 1, payStreak: 1.4, bedrock: 2.2 },
    instability: [0.7, 1.4],
    waterTable: [0.3, 0.8],
    boulders: 2,
    access: 150,
    floodPerDay: 0,
    fetchSeconds: 3,
    fee: 2,
    crewMax: 2,
    supplies: 3,
    groundNote: 'fast water and rich bedrock, but hard going and no room for a rocker',
  },
  dryWash: {
    label: 'Dry wash',
    footprint: 'normal',
    water: 'dry',
    spots: [4, 6],
    gullies: [1, 2],
    sourceChance: 0.5,
    sluiceSites: [0, 0],
    pumpSiteChance: 0,
    sluiceFlow: [0, 0],
    sluiceSlope: [0, 0],
    // Unworked for want of water: shallow and fairly rich.
    layerLoads: { overburden: 0.6, gravel: 1, payStreak: 1, bedrock: 0.8 },
    layerRichness: { overburden: 1, gravel: 1.3, payStreak: 1.3, bedrock: 1.2 },
    instability: [0.1, 0.5],
    waterTable: [0, 0],
    boulders: 1,
    access: 60,
    floodPerDay: 0,
    fetchSeconds: 20,
    fee: 1,
    crewMax: 3,
    supplies: 4,
    groundNote: 'good ground with no water: drywasher country',
  },
  oldDiggings: {
    label: 'Abandoned diggings',
    footprint: 'normal',
    water: 'creek',
    spots: [4, 6],
    gullies: [0, 1],
    sourceChance: 0.4,
    // The old-timers had the sluice ground; what they left is for the pan and the rocker.
    sluiceSites: [0, 0],
    pumpSiteChance: 0,
    sluiceFlow: [0, 0],
    sluiceSlope: [0, 0],
    // On top, their tailings heaps: easy digging, washed clean, and worth panning. Below, gravel
    // they skimmed, a pay streak mostly taken, and bedrock they swept (a missed crack or two).
    layerLoads: { overburden: 1.6, gravel: 0.8, payStreak: 0.4, bedrock: 0.6 },
    layerRichness: { overburden: 11, gravel: 0.8, payStreak: 0.4, bedrock: 0.45 },
    layerClay: { overburden: 0.25, gravel: 1, payStreak: 1, bedrock: 1 },
    // Their riffles kept the coarse gold and let the fines go into the tailings.
    coarseTaken: { overburden: 0.9, gravel: 0.5, payStreak: 0.7, bedrock: 0.6 },
    // Old cuts and drifts: the walls give way.
    instability: [0.7, 1.3],
    waterTable: [0.4, 1.1],
    boulders: 0.5,
    access: 0,
    floodPerDay: 0,
    fetchSeconds: 7,
    fee: 1,
    crewMax: 2,
    supplies: 0,
    groundNote: 'old workings: tailings heaps of fine gold the old-timers lost, for a careful pan or a rocker, and not much left below',
    clues: 3,
    salvage: [2, 7],
  },
};

/** How often each kind turns up at the end of a lead (the Home Creek never does). */
export const SITE_ODDS: readonly (readonly [SiteKind, number])[] = [
  ['creekStretch', 0.28],
  ['creekBend', 0.3],
  ['gravelBar', 0.11],
  ['ravine', 0.11],
  ['dryWash', 0.1],
  ['oldDiggings', 0.1],
];

export function traitsOf(site: SiteKind | undefined): SiteTraits {
  return SITE_TRAITS[site ?? 'creekStretch'];
}

/** Whether the top layer is worth washing (old tailings) rather than topsoil to toss aside. */
export function topLayerPays(site: SiteKind | undefined): boolean {
  return (traitsOf(site).coarseTaken?.overburden ?? 0) > 0;
}

/** Whether the ground has room and water for a piece of hand gear. */
export type SiteGear = 'pan' | 'classifier' | 'rocker' | 'magnet' | 'highbanker' | 'drywasher' | 'washTub' | 'trommel' | 'spiralWheel';

export function siteAllows(site: SiteKind | undefined, gear: SiteGear): boolean {
  const traits = traitsOf(site);
  if (gear === 'pan') return traits.water === 'creek';
  if (site === 'homeCreek') return false;
  // Dry gear is for ground with no water; a creek doesn't need it.
  if (gear === 'drywasher' || gear === 'washTub') return traits.water === 'dry';
  // A highbanker needs strong water to pump from and room on the bank for its stand; a ravine
  // takes the compact one.
  if (gear === 'highbanker') return site === 'creekBend' || site === 'gravelBar' || site === 'ravine';
  // A trommel needs a wide, level bar to stand on and a big pile to feed it: gravel bars only.
  if (gear === 'trommel') return site === 'gravelBar';
  if (gear === 'rocker') return traits.footprint !== 'narrow';
  // The spiral wheel's spray needs water, and its stand needs room.
  if (gear === 'spiralWheel') return traits.water === 'creek' && traits.footprint !== 'narrow';
  return true;
}
