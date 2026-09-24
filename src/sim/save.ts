import { HomeCreek, type CreekSnapshot } from './creek';
import { reservePanIds } from './pan';
import { PanningSession, type SessionSnapshot } from './panningSession';
import type { Rng } from './rng';

/**
 * Save data for a Home Creek game, as plain JSON-safe data. Storage (where the JSON goes) is
 * the game layer's job; this module only builds and checks the data.
 *
 * Bump SAVE_VERSION whenever the shape changes, and add a migration rather than discarding
 * old saves: losing a player's vial is worse than a little migration code.
 */
export const SAVE_VERSION = 2;

/** Where the player was standing, so a reload puts them back there. */
export interface SavedPlace {
  readonly screen: 'creek' | 'bank' | 'pan' | 'town';
  readonly spotId: number | null;
}

export interface SaveData {
  readonly version: typeof SAVE_VERSION;
  readonly savedAt: number;
  readonly creek: CreekSnapshot;
  readonly session: SessionSnapshot;
  readonly place: SavedPlace;
}

export function createSave(creek: HomeCreek, session: PanningSession, place: SavedPlace, now: number): SaveData {
  return { version: SAVE_VERSION, savedAt: now, creek: creek.snapshot(), session: session.snapshot(), place };
}

export interface LoadedGame {
  readonly creek: HomeCreek;
  readonly session: PanningSession;
  readonly place: SavedPlace;
}

/**
 * Bring older saves up to the current version, one step at a time.
 * v1 → v2: money arrived; v1 players had none.
 */
function migrate(data: unknown): unknown {
  if (!isObject(data)) return data;
  let save: Record<string, unknown> = data;
  if (save.version === 1 && isObject(save.session)) {
    save = { ...save, version: 2, session: { ...save.session, cash: 0, earned: 0, soldMg: 0 } };
  }
  return save;
}

/** Rebuild a game from save data, or return null if the data isn't a save this version understands. */
export function loadSave(raw: unknown, rng: Rng): LoadedGame | null {
  const data = migrate(raw);
  if (!isSaveData(data)) return null;
  const creek = new HomeCreek(rng, data.creek);
  const session = new PanningSession(rng, data.session);
  reservePanIds(maxPieceId(data.session));
  const spotId = data.place.spotId !== null && creek.spots.some((s) => s.id === data.place.spotId) ? data.place.spotId : null;
  return { creek, session, place: { screen: data.place.screen, spotId } };
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
  const { creek, session, place } = data;
  if (!isObject(creek) || !Array.isArray(creek.spots) || creek.spots.length === 0) return false;
  if (!creek.spots.every((s) => isObject(s) && typeof s.id === 'number' && Array.isArray(s.layers))) return false;
  if (!isObject(session) || !Array.isArray(session.vial) || !isObject(session.jar)) return false;
  if (typeof session.jar.blackSand !== 'number' || !Array.isArray(session.jar.gold)) return false;
  if (typeof session.cash !== 'number' || typeof session.earned !== 'number' || typeof session.soldMg !== 'number') return false;
  if (session.pan !== null && !(isObject(session.pan) && typeof session.pan.phase === 'string')) return false;
  if (!isObject(place) || !['creek', 'bank', 'pan', 'town'].includes(place.screen as string)) return false;
  return true;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
