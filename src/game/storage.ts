/**
 * Browser persistence for the save file. On itch.io every game shares one origin, so the key
 * carries a game-specific prefix. Storage can be unavailable (private windows, blocked
 * third-party storage inside the itch.io iframe), so every access is guarded.
 */
const SAVE_KEY = 'gold-prospecting:home-creek:save';

export function readSave(): unknown {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

/** Returns false if the browser would not store it. */
export function writeSave(data: unknown): boolean {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing stored, nothing to clear.
  }
}
