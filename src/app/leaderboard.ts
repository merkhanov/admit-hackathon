export interface ScoreEntry {
  score: number;
  /** 0..5 */
  stars: number;
  /** ISO timestamp. */
  at: string;
  /** Who danced it. Tables saved before names existed have none. */
  name?: string;
}

const KEY = 'motion-dance.leaderboard.v1';
export const LEADERBOARD_SIZE = 5;

function isEntry(v: unknown): v is ScoreEntry {
  return typeof v === 'object' && v !== null
    && 'score' in v && typeof v.score === 'number'
    && 'stars' in v && typeof v.stars === 'number'
    && 'at' in v && typeof v.at === 'string'
    && (!('name' in v) || v.name === undefined || typeof v.name === 'string');
}

export function parseLeaderboard(raw: string | null): ScoreEntry[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    return Array.isArray(data) ? data.filter(isEntry).slice(0, LEADERBOARD_SIZE) : [];
  } catch {
    return [];
  }
}

/** Inserts an entry and returns the new table and the entry's place (0-based), or -1 if it didn't make it. */
export function insertScore(board: readonly ScoreEntry[], entry: ScoreEntry): { board: ScoreEntry[]; place: number } {
  const next = [...board, entry].sort((a, b) => b.score - a.score).slice(0, LEADERBOARD_SIZE);
  return { board: next, place: next.indexOf(entry) };
}

/** Each song keeps its own table. «Neon Steps» keeps the key it had before there were other songs. */
export const leaderboardKey = (songKey: string): string => (songKey === 'neon' ? KEY : `${KEY}.${songKey}`);

export function loadLeaderboard(songKey: string, storage: Storage = localStorage): ScoreEntry[] {
  return parseLeaderboard(storage.getItem(leaderboardKey(songKey)));
}

/** Adds a finished dance to the song's table on this device; returns the new table and place, as insertScore. */
export function recordScore(songKey: string, entry: ScoreEntry, storage: Storage = localStorage): { board: ScoreEntry[]; place: number } {
  const r = insertScore(loadLeaderboard(songKey, storage), entry);
  saveLeaderboard(r.board, songKey, storage);
  return r;
}

export function saveLeaderboard(board: readonly ScoreEntry[], songKey: string, storage: Storage = localStorage): void {
  storage.setItem(leaderboardKey(songKey), JSON.stringify(board));
}
