import { evaluate, type BodyAngles, type MoveEval, type PartId } from './judge.ts';
import { MOVES, type MoveId } from './moves.ts';
import { judgeWindow, type Song } from './song.ts';

export type Rating = 'perfect' | 'good' | 'ok' | 'miss';

export const RATING_POINTS: Record<Rating, number> = { perfect: 100, good: 70, ok: 40, miss: 0 };
export const RATING_NAMES: Record<Rating, string> = { perfect: 'Идеально!', good: 'Хорошо', ok: 'Неплохо', miss: 'Мимо' };

export function rate(score: number): Rating {
  if (score >= 0.85) return 'perfect';
  if (score >= 0.65) return 'good';
  if (score >= 0.4) return 'ok';
  return 'miss';
}

export interface Verdict {
  index: number;
  move: MoveId;
  rating: Rating;
  score: number;
  /** The correction for the worst part, or null when the move was clean. */
  hint: string | null;
  part: PartId | null;
}

export interface DanceState {
  /** Index of the step being judged next. */
  index: number;
  best: MoveEval | null;
  /** The latest frame of the window: where the player settled, which the correction describes. */
  last: MoveEval | null;
  points: number;
  combo: number;
  maxCombo: number;
  counts: Record<Rating, number>;
  /** Sum and count of each part's score at the best moment of every judged move. */
  parts: Partial<Record<PartId, { sum: number; n: number }>>;
  finished: boolean;
}

export const newDance = (): DanceState => ({
  index: 0, best: null, last: null, points: 0, combo: 0, maxCombo: 0,
  counts: { perfect: 0, good: 0, ok: 0, miss: 0 }, parts: {}, finished: false,
});

function finalize(s: DanceState, song: Song): Verdict {
  const step = song.steps[s.index];
  const best = s.best;
  const score = best?.score ?? 0;
  const rating = rate(score);
  s.points += RATING_POINTS[rating];
  s.counts[rating]++;
  s.combo = rating === 'perfect' || rating === 'good' ? s.combo + 1 : 0;
  s.maxCombo = Math.max(s.maxCombo, s.combo);
  if (best) {
    for (const p of best.parts) {
      const acc = s.parts[p.part] ?? { sum: 0, n: 0 };
      s.parts[p.part] = { sum: acc.sum + p.score, n: acc.n + 1 };
    }
  }
  // The rating rewards the best moment; the correction describes the pose the player held,
  // not a frame where the arms happened to sweep through the target.
  const worst = s.last?.worst ?? best?.worst ?? null;
  const hint = rating === 'perfect' ? null : worst?.hint ?? 'Не видно тебя в кадре: встань так, чтобы камера видела голову, плечи и руки';
  const verdict: Verdict = { index: s.index, move: step.move, rating, score, hint, part: rating === 'perfect' ? null : worst?.part ?? null };
  s.index++;
  s.best = null;
  s.last = null;
  if (s.index >= song.steps.length) s.finished = true;
  return verdict;
}

/**
 * Pure step: feeds one frame at song time `time` (seconds). Each move keeps its best match
 * inside its judging window; when the window closes the move gets a verdict.
 */
export function stepDance(state: DanceState, song: Song, time: number, body: BodyAngles | null): { state: DanceState; verdicts: Verdict[] } {
  const s: DanceState = structuredClone(state);
  const verdicts: Verdict[] = [];
  while (!s.finished) {
    const step = song.steps[s.index];
    const w = judgeWindow(song, step);
    if (time >= w.end) {
      verdicts.push(finalize(s, song));
      continue;
    }
    if (time >= w.start && body) {
      const e = evaluate(MOVES[step.move], body);
      if (!s.best || e.score > s.best.score) s.best = e;
      s.last = e;
    }
    break;
  }
  return { state: s, verdicts };
}

export const maxPoints = (song: Song) => song.steps.length * RATING_POINTS.perfect;

/** 0..5 stars from the share of the maximum score. */
export function stars(points: number, song: Song): number {
  const share = points / maxPoints(song);
  return [0.2, 0.4, 0.6, 0.75, 0.9].filter((t) => share >= t).length;
}
