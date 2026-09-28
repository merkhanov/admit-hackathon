const NAME_KEY = 'motion-dance.playerName.v1';

export function loadPlayerName(storage: Storage = localStorage): string | null {
  try {
    const v = storage.getItem(NAME_KEY);
    return v && v.trim() ? v.trim().slice(0, 24) : null;
  } catch {
    return null;
  }
}

export function savePlayerName(name: string, storage: Storage = localStorage): void {
  try {
    storage.setItem(NAME_KEY, name.trim().slice(0, 24));
  } catch {
    // Storage can be unavailable (private mode); the name just won't persist.
  }
}

/** A short random id for this client, stable for the session. */
export function makePlayerId(): string {
  return `p${Math.random().toString(36).slice(2, 10)}`;
}
