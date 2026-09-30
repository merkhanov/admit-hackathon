export interface ScoreEntry {
  score: number;
  /** 0..5 */
  stars: number;
  /** ISO timestamp. */
  at: string;
}

const KEY = 'motion-dance.leaderboard.v1';
export const LEADERBOARD_SIZE = 5;

function isEntry(v: unknown): v is ScoreEntry {
  return typeof v === 'object' && v !== null
    && 'score' in v && typeof v.score === 'number'
    && 'stars' in v && typeof v.stars === 'number'
    && 'at' in v && typeof v.at === 'string';
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

export function saveLeaderboard(board: readonly ScoreEntry[], songKey: string, storage: Storage = localStorage): void {
  storage.setItem(leaderboardKey(songKey), JSON.stringify(board));
}
