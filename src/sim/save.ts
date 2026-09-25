import { HOME_CREEK_PROFILE } from './creek';
import { reservePanIds } from './pan';
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
export const SAVE_VERSION = 5;

const SCREENS = ['creek', 'bank', 'pan', 'town', 'region'] as const;

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
}

export function createSave(region: Region, session: PanningSession, place: SavedPlace, now: number): SaveData {
  return { version: SAVE_VERSION, savedAt: now, region: region.snapshot(), session: session.snapshot(), place };
}

export interface LoadedGame {
  readonly region: Region;
  readonly session: PanningSession;
  readonly place: SavedPlace;
}

/**
 * Bring older saves up to the current version, one step at a time.
 * v1 → v2: money arrived; v1 players had none.
 * v2 → v3: the single creek became the Home Creek in a region of creeks and leads.
 * v3 → v4: sluice sites. Existing creeks and leads predate them, so they have none.
 * v4 → v5: owned gear. Nobody owned a sluice before the outfitter opened.
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
  reservePanIds(maxPieceId(data.session));
  const creek = region.creeks.find((c) => c.id === data.place.creekId) ?? region.home;
  const spotId = data.place.spotId !== null && creek.spots.some((s) => s.id === data.place.spotId) ? data.place.spotId : null;
  return { region, session, place: { screen: data.place.screen, creekId: creek.id, spotId } };
}

function maxPieceId(session: SessionSnapshot): number {
  const pan = session.pan;
  const ids = [
    ...session.vial,
    ...session.jar.gold,
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
  if (typeof session.jar.blackSand !== 'number' || !Array.isArray(session.jar.gold)) return false;
  if (typeof session.cash !== 'number' || typeof session.earned !== 'number' || typeof session.soldMg !== 'number') return false;
  if (session.sluice !== null && !(isObject(session.sluice) && 'placedAt' in session.sluice && 'state' in session.sluice)) return false;
  if (session.pan !== null && !(isObject(session.pan) && typeof session.pan.phase === 'string')) return false;
  if (!isObject(place) || !(SCREENS as readonly unknown[]).includes(place.screen) || typeof place.creekId !== 'number') return false;
  return true;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
