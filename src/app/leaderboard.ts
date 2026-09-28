export interface ScoreEntry {
  score: number;
  coins: number;
  /** ISO timestamp. */
  at: string;
}

const KEY = 'motion-runner.leaderboard.v1';
export const LEADERBOARD_SIZE = 5;

function isEntry(v: unknown): v is ScoreEntry {
  return typeof v === 'object' && v !== null
    && 'score' in v && typeof v.score === 'number'
    && 'coins' in v && typeof v.coins === 'number'
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

export function loadLeaderboard(storage: Storage = localStorage): ScoreEntry[] {
  return parseLeaderboard(storage.getItem(KEY));
}

export function saveLeaderboard(board: readonly ScoreEntry[], storage: Storage = localStorage): void {
  storage.setItem(KEY, JSON.stringify(board));
}
