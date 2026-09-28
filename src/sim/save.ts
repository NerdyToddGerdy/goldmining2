import { HOME_CREEK_PROFILE } from './creek';
import { Economy, type EconomySnapshot } from './economy';
import { MAGNET_TUNING } from './magnet';
import type { HighbankerSnapshot } from './highbanker';
import { Crew, crewFromV14, type CrewSnapshot } from './staffing';
import { Finance, type FinanceSnapshot } from './finance';
import { reservePanIds, type GoldPiece } from './pan';
import { PanningSession, type SessionSnapshot } from './panningSession';
import { Region, type RegionSnapshot } from './region';
import type { Rng } from './rng';

/**
 * Save data for a Home Creek game, as plain JSON-safe data. Storage (where the JSON goes) is
 * the game layer's job; this module only builds and checks the data.
 *
 * Bump SAVE_VERSION whenever the shape changes, and add a migration rather than discarding
 * old saves: losing a player's vial is worse than a little migration code.
 */
export const SAVE_VERSION = 23;

const SCREENS = ['creek', 'bank', 'pan', 'town', 'region', 'sluice', 'classifier', 'rocker', 'highbanker', 'drywasher', 'trommel'] as const;

/** Where the player was standing, so a reload puts them back there. */
export interface SavedPlace {
  readonly screen: (typeof SCREENS)[number];
  readonly creekId: number;
  readonly spotId: number | null;
}

export interface SaveData {
  readonly version: typeof SAVE_VERSION;
  readonly savedAt: number;
  readonly region: RegionSnapshot;
  readonly session: SessionSnapshot;
  readonly place: SavedPlace;
  readonly economy: EconomySnapshot;
  readonly crew: CrewSnapshot;
  readonly finance: FinanceSnapshot;
}

/** The clock, claims and crew. Optional so a save can be made without them (they start empty). */
export interface Operations {
  readonly economy: Economy;
  readonly crew: Crew;
  readonly finance?: Finance;
}

export function createSave(region: Region, session: PanningSession, place: SavedPlace, now: number, ops?: Operations): SaveData {
  return {
    version: SAVE_VERSION,
    savedAt: now,
    region: region.snapshot(),
    session: session.snapshot(),
    place,
    economy: ops?.economy.snapshot() ?? { clock: 0, claims: [] },
    crew: ops?.crew.snapshot() ?? EMPTY_CREW,
    finance: ops?.finance?.snapshot() ?? FRESH_FINANCE,
  };
}

const FRESH_FINANCE: FinanceSnapshot = { insolventSince: null, recovering: false, shutdowns: 0 };

const EMPTY_CREW: CrewSnapshot = crewFromV14({ hand: null, wagesOwed: 0, bucket: { blackSand: 0, gold: [] }, sluiceCreekId: null });

export interface LoadedGame {
  readonly region: Region;
  readonly session: PanningSession;
  readonly place: SavedPlace;
  readonly economy: Economy;
  readonly crew: Crew;
  readonly finance: Finance;
}

/**
 * Bring older saves up to the current version, one step at a time.
 * v1 → v2: money arrived; v1 players had none.
 * v2 → v3: the single creek became the Home Creek in a region of creeks and leads.
 * v3 → v4: sluice sites. Existing creeks and leads predate them, so they have none.
 * v4 → v5: owned gear. Nobody owned a sluice before the outfitter opened.
 * v5 → v6: other gear (the big jar). Nobody had any.
 * v6 → v7: the hand classifier. Nobody had one.
 * v7 → v8: sluice upgrades. No pump, no fuel, no thin-water sites on existing creeks; a
 *   sluice already set up keeps its site's slope.
 * v8 → v9: the game clock, claims and crew. The clock starts now, nobody has staff, and every
 *   found stretch is staked (on load) with nothing owed.
 * v9 → v10: the magnet. The jar's black sand is fresh (the usual magnetite share), and nothing is
 *   on the magnet.
 * v10 → v11: the rocker box. Nobody had one.
 * v11 → v12: site kinds. The Home Creek is the Home Creek; every other stretch was a plain
 *   stretch or, with sluice sites, a creek bend. Leads likewise.
 * v12 → v13: the highbanker. Nobody had one.
 * v13 → v14: the drywasher and wash tub. Nobody had either.
 * v14 → v15: a crew of hands with job lists, in place of the single hand. The old hand is on the
 *   sluice job wherever the sluice was set up, with the crew bucket there; with no sluice set up,
 *   they wait in town and their bucket comes back to town with them.
 * v15 → v16: financial decline and recovery. Nobody had been shut down.
 * v16 → v17: leads read the ground (kind, and any thin-water bench) instead of an optional hint.
 *   Older leads say nothing about it.
 * v17 → v18: crew policies. Every crewed stretch works steady.
 * v22 → v23: the trommel. Nobody has one.
 * v21 → v22: the crew's town station, settling tub and couriers. Nobody is stationed in town yet.
 * v20 → v21: machine wear, repair kits, and supplies for remote crews. Every machine is as good
 *   as new, and nobody carries a kit.
 * v19 → v20: worker traits and foremen. Everyone already hired is fair and steady, and nobody is
 *   looking for work until the next visit to town.
 * v18 → v19: the finishing pan and snuffer bottle. A pan in progress is the steel pan, with an
 *   empty bottle; its hidden pieces get places along the tail when it's restored.
 */
function migrate(data: unknown): unknown {
  if (!isObject(data)) return data;
  let save: Record<string, unknown> = data;
  if (save.version === 1 && isObject(save.session)) {
    save = { ...save, version: 2, session: { ...save.session, cash: 0, earned: 0, soldMg: 0 } };
  }
  if (save.version === 2 && isObject(save.creek) && Array.isArray(save.creek.spots) && isObject(save.place)) {
    const { creek: oldCreek, ...rest } = save;
    const creek = oldCreek as { spots: unknown[]; highWaterEvents: unknown };
    const home = {
      id: 1,
      profile: HOME_CREEK_PROFILE,
      spots: creek.spots.map((spot) => (isObject(spot) ? { ...spot, gully: null } : spot)),
      highWaterEvents: creek.highWaterEvents,
    };
    save = {
      ...rest,
      version: 3,
      region: { creeks: [home], leads: [], offers: [], offersStockedAt: null },
      place: { ...save.place, creekId: 1 },
    };
  }
  if (save.version === 3 && isObject(save.region)) {
    const region = save.region;
    const creeks = Array.isArray(region.creeks) ? region.creeks : [];
    const leadV4 = (lead: unknown): unknown =>
      isObject(lead) && isObject(lead.truth) ? { ...lead, hint: null, truth: { ...lead.truth, bend: false } } : lead;
    save = {
      ...save,
      version: 4,
      region: {
        ...region,
        creeks: creeks.map((creek) =>
          isObject(creek) && isObject(creek.profile) && Array.isArray(creek.spots)
            ? {
                ...creek,
                profile: { ...creek.profile, sluiceSites: 0 },
                spots: creek.spots.map((spot) => (isObject(spot) ? { ...spot, sluiceSite: null } : spot)),
              }
            : creek,
        ),
        leads: Array.isArray(region.leads) ? region.leads.map(leadV4) : region.leads,
        offers: Array.isArray(region.offers)
          ? region.offers.map((offer) => (isObject(offer) ? { ...offer, lead: leadV4(offer.lead) } : offer))
          : region.offers,
      },
    };
  }
  if (save.version === 4 && isObject(save.session)) {
    save = { ...save, version: 5, session: { ...save.session, sluice: null } };
  }
  if (save.version === 5 && isObject(save.session)) {
    save = { ...save, version: 6, session: { ...save.session, gear: [] } };
  }
  if (save.version === 6 && isObject(save.session)) {
    save = { ...save, version: 7, session: { ...save.session, classifier: null } };
  }
  if (save.version === 7 && isObject(save.session) && isObject(save.region)) {
    const session = save.session;
    const sluice = isObject(session.sluice) ? session.sluice : null;
    const state = sluice && isObject(sluice.state) && isObject(sluice.state.site) ? sluice.state : null;
    const creeks = Array.isArray(save.region.creeks) ? save.region.creeks : [];
    save = {
      ...save,
      version: 8,
      region: {
        ...save.region,
        creeks: creeks.map((creek) =>
          isObject(creek) && isObject(creek.profile) ? { ...creek, profile: { ...creek.profile, pumpSites: 0 } } : creek,
        ),
      },
      session: {
        ...session,
        pumpFuel: 0,
        fuelCans: 0,
        sluice: sluice && state ? { ...sluice, state: { ...state, slope: (state.site as { slope: unknown }).slope } } : session.sluice,
      },
    };
  }
  if (save.version === 8) {
    save = { ...save, version: 9, economy: { clock: 0, claims: [] }, crew: EMPTY_CREW };
  }
  if (save.version === 9 && isObject(save.session) && isObject(save.session.jar)) {
    const jar = save.session.jar;
    const magnetite = typeof jar.blackSand === 'number' ? jar.blackSand * MAGNET_TUNING.share : 0;
    save = { ...save, version: 10, session: { ...save.session, jar: { ...jar, magnetite }, clump: { sand: 0, gold: [] } } };
  }
  if (save.version === 10 && isObject(save.session)) {
    save = { ...save, version: 11, session: { ...save.session, rocker: null } };
  }
  if (save.version === 11 && isObject(save.region) && Array.isArray(save.region.creeks)) {
    const region = save.region;
    const siteOf = (bend: unknown): string => (bend ? 'creekBend' : 'creekStretch');
    const leadV12 = (lead: unknown): unknown => {
      if (!isObject(lead) || !isObject(lead.truth)) return lead;
      const { bend, ...truth } = lead.truth;
      return { ...lead, truth: { ...truth, site: siteOf(bend) } };
    };
    save = {
      ...save,
      version: 12,
      region: {
        ...region,
        creeks: (region.creeks as unknown[]).map((creek, i) =>
          isObject(creek) && isObject(creek.profile)
            ? { ...creek, profile: { ...creek.profile, site: i === 0 ? 'homeCreek' : siteOf(Number(creek.profile.sluiceSites) > 0) } }
            : creek,
        ),
        leads: Array.isArray(region.leads) ? region.leads.map(leadV12) : region.leads,
        offers: Array.isArray(region.offers) ? region.offers.map((o) => (isObject(o) ? { ...o, lead: leadV12(o.lead) } : o)) : region.offers,
      },
    };
  }
  if (save.version === 12 && isObject(save.session)) {
    save = { ...save, version: 13, session: { ...save.session, highbanker: null } };
  }
  if (save.version === 13 && isObject(save.session)) {
    save = { ...save, version: 14, session: { ...save.session, drywasher: null, tub: null } };
  }
  if (save.version === 14 && isObject(save.session)) {
    const crew = isObject(save.crew) ? save.crew : {};
    const hand = isObject(crew.hand) ? (crew.hand as { name: string; wage: number }) : null;
    const bucket = isObject(crew.bucket) && typeof crew.bucket.blackSand === 'number' && Array.isArray(crew.bucket.gold)
      ? (crew.bucket as { blackSand: number; gold: GoldPiece[] })
      : { blackSand: 0, gold: [] };
    const sluice = isObject(save.session.sluice) && isObject(save.session.sluice.placedAt) ? save.session.sluice.placedAt : null;
    const sluiceCreekId = sluice && typeof sluice.creekId === 'number' ? sluice.creekId : null;
    const wagesOwed = typeof crew.wagesOwed === 'number' ? crew.wagesOwed : 0;
    save = { ...save, version: 15, crew: crewFromV14({ hand, wagesOwed, bucket, sluiceCreekId }) };
  }
  if (save.version === 15) {
    save = { ...save, version: 16, finance: FRESH_FINANCE };
  }
  if (save.version === 16 && isObject(save.region)) {
    const region = save.region;
    const leadV17 = (lead: unknown): unknown => {
      if (!isObject(lead)) return lead;
      const { hint: _hint, ...rest } = lead;
      return { ...rest, ground: null };
    };
    save = {
      ...save,
      version: 17,
      region: {
        ...region,
        leads: Array.isArray(region.leads) ? region.leads.map(leadV17) : region.leads,
        offers: Array.isArray(region.offers) ? region.offers.map((o) => (isObject(o) ? { ...o, lead: leadV17(o.lead) } : o)) : region.offers,
      },
    };
  }
  if (save.version === 17 && isObject(save.crew)) {
    const crew = save.crew;
    const sites = Array.isArray(crew.sites) ? crew.sites.map((s) => (isObject(s) ? { ...s, policy: 'steady' } : s)) : crew.sites;
    save = { ...save, version: 18, crew: { ...crew, sites } };
  }
  if (save.version === 18) {
    // Nothing to change: the new pan fields are optional and default to the steel pan.
    save = { ...save, version: 19 };
  }
  if (save.version === 19 && isObject(save.crew)) {
    const crew = save.crew;
    const workers = Array.isArray(crew.workers) ? crew.workers.map((w) => (isObject(w) ? { ...w, skill: 'fair', pace: 'steady' } : w)) : crew.workers;
    save = { ...save, version: 20, crew: { ...crew, workers, applicants: [], applicantsDay: -1 } };
  }
  if (save.version === 20 && isObject(save.session)) {
    save = { ...save, version: 21, session: { ...save.session, repairKits: 0 } };
  }
  if (save.version === 21) {
    // Nothing to change: the town station is just another crew site, set up when first used.
    save = { ...save, version: 22 };
  }
  if (save.version === 22 && isObject(save.session)) {
    save = { ...save, version: 23, session: { ...save.session, trommel: null } };
  }
  return save;
}

/** Rebuild a game from save data, or return null if the data isn't a save this version understands. */
export function loadSave(raw: unknown, rng: Rng): LoadedGame | null {
  const data = migrate(raw);
  if (!isSaveData(data)) return null;
  const region = new Region(rng, data.region);
  // Creeks saved before gullies existed get them now, so the Home Creek can still lead somewhere.
  region.home.addGullies();
  const session = new PanningSession(rng, data.session);
  const economy = new Economy(data.economy);
  economy.stakeFound(region);
  const crew = new Crew(rng, data.crew);
  reservePanIds(maxPieceId(data.session, data.crew));
  const creek = region.creeks.find((c) => c.id === data.place.creekId) ?? region.home;
  const spotId = data.place.spotId !== null && creek.spots.some((s) => s.id === data.place.spotId) ? data.place.spotId : null;
  return { region, session, place: { screen: data.place.screen, creekId: creek.id, spotId }, economy, crew, finance: new Finance(data.finance) };
}

function maxPieceId(session: SessionSnapshot, crew: CrewSnapshot): number {
  const pan = session.pan;
  const ids = [
    ...session.vial,
    ...session.jar.gold,
    ...session.clump.gold,
    ...(session.rocker ? [...session.rocker.apron.gold, ...session.rocker.hopper.gold, ...session.rocker.hopper.rocks] : []),
    ...(session.highbanker?.state ? highbankerIds(session.highbanker.state) : []),
    ...(session.drywasher ? [...session.drywasher.drawer.gold, ...session.drywasher.hopper.gold, ...session.drywasher.hopper.rocks] : []),
    ...crewPieces(crew),
    ...(pan ? [...pan.gold, ...pan.visible, ...pan.hidden, ...pan.rocks] : []),
  ].map((item) => item.id);
  return Math.max(0, ...ids);
}

function isSaveData(data: unknown): data is SaveData {
  if (!isObject(data) || data.version !== SAVE_VERSION) return false;
  const { region, session, place } = data;
  if (!isObject(region) || !Array.isArray(region.creeks) || region.creeks.length === 0) return false;
  if (!Array.isArray(region.leads) || !Array.isArray(region.offers)) return false;
  for (const creek of region.creeks) {
    if (!isObject(creek) || typeof creek.id !== 'number' || !isObject(creek.profile) || !Array.isArray(creek.spots)) return false;
    if (!creek.spots.every((s) => isObject(s) && typeof s.id === 'number' && Array.isArray(s.layers))) return false;
  }
  if (!isObject(session) || !Array.isArray(session.vial) || !isObject(session.jar)) return false;
  if (typeof session.jar.blackSand !== 'number' || typeof session.jar.magnetite !== 'number' || !Array.isArray(session.jar.gold)) return false;
  if (!isObject(session.clump) || !Array.isArray(session.clump.gold)) return false;
  if (typeof session.cash !== 'number' || typeof session.earned !== 'number' || typeof session.soldMg !== 'number') return false;
  if (!Array.isArray(session.gear)) return false;
  if (typeof session.pumpFuel !== 'number' || typeof session.fuelCans !== 'number') return false;
  if (session.classifier !== null && !(isObject(session.classifier) && 'bucket' in session.classifier)) return false;
  if (session.rocker !== null && !(isObject(session.rocker) && 'hopper' in session.rocker)) return false;
  if (session.highbanker !== null && !(isObject(session.highbanker) && 'placedAt' in session.highbanker)) return false;
  if (session.drywasher !== null && !(isObject(session.drywasher) && 'drawer' in session.drywasher)) return false;
  if (session.tub !== null && !(isObject(session.tub) && typeof session.tub.water === 'number')) return false;
  if (session.sluice !== null && !(isObject(session.sluice) && 'placedAt' in session.sluice && 'state' in session.sluice)) return false;
  if (session.pan !== null && !(isObject(session.pan) && typeof session.pan.phase === 'string')) return false;
  if (!isObject(place) || !(SCREENS as readonly unknown[]).includes(place.screen) || typeof place.creekId !== 'number') return false;
  const { economy, crew } = data;
  if (!isObject(economy) || typeof economy.clock !== 'number' || !Array.isArray(economy.claims)) return false;
  if (!isObject(data.finance) || typeof data.finance.recovering !== 'boolean') return false;
  if (!isObject(crew) || typeof crew.wagesOwed !== 'number' || !Array.isArray(crew.workers) || !Array.isArray(crew.sites) || !isObject(crew.returned)) return false;
  return true;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function highbankerIds(state: HighbankerSnapshot): { id: number }[] {
  const { sluice, hopper } = state;
  return [...hopper.gold, ...hopper.rocks, ...sluice.moss.gold, ...sluice.header.gold, ...sluice.header.rocks, ...sluice.lost];
}

/** Every gold piece and rock the crew holds anywhere (buckets, pokes, pans, machines), for id reservation. */
function crewPieces(crew: CrewSnapshot): { id: number }[] {
  const found: { id: number }[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (isObject(value)) {
      if (typeof value.id === 'number' && ('mg' in value || 'stuckPicker' in value)) found.push(value as { id: number });
      Object.values(value).forEach(walk);
    }
  };
  walk(crew);
  return found;
}
