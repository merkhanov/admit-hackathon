import { angleDiff, evaluate, type BodyAngles, type MoveEval, type PartId } from './judge.ts';
import type { MoveId } from './moves.ts';
import { poseAt } from './motion.ts';
import { INPUT_LAG_S, judgeWindow, type Song } from './song.ts';

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
  /** The frame that matched worst: the mistake the player kept making, which the correction describes. */
  worst: MoveEval | null;
  /** Every frame's match in the window: a move is danced through, not struck once. Out of frame is 0. */
  scores: number[];
  /** How far the player's body and the coach's travelled during the window. */
  moved: Travel | null;
  shown: Travel | null;
  points: number;
  combo: number;
  maxCombo: number;
  counts: Record<Rating, number>;
  /** Sum and count of each part's score at the best moment of every judged move. */
  parts: Partial<Record<PartId, { sum: number; n: number }>>;
  finished: boolean;
}

/** The range each body channel covered in a window, relative to where it started. */
interface Travel {
  ref: number[];
  lo: number[];
  hi: number[];
}

export const newDance = (): DanceState => ({
  index: 0, best: null, worst: null, scores: [], moved: null, shown: null, points: 0, combo: 0, maxCombo: 0,
  counts: { perfect: 0, good: 0, ok: 0, miss: 0 }, parts: {}, finished: false,
});

/** A move's score is the average of its frames without the worst share, forgiving a single stumble. */
export const DROP_WORST = 0.2;
/** A player who stands still keeps at most this share of the score: dancing means moving. */
export const STILL_FLOOR = 0.65;
/** Moving this share of the coach's range already counts as moving with the coach. */
export const MOVE_ENOUGH = 0.6;
/** Coach motion smaller than this (summed over channels) doesn't ask the player to move. */
const MIN_TRAVEL = 20;
const FULL_SQUAT = 0.35;
/** Movement is measured from this long after a window opens: after the player arrives in the move. */
const SETTLE_S = 0.3;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Arm directions in degrees, elbows and lean weighted so each channel moves about as much in a real dance. */
function channels(dirL: number, dirR: number, elbowL: number, elbowR: number, tilt: number, depth: number): number[] {
  return [dirL, dirR, elbowL * 0.5, elbowR * 0.5, tilt * 2, depth * 60];
}

function travel(t: Travel | null, v: number[]): Travel {
  if (!t) return { ref: v, lo: v.map(() => 0), hi: v.map(() => 0) };
  // Arm directions go round the circle, so measure them the short way from where they started.
  const rel = v.map((x, i) => (i < 2 ? angleDiff(x, t.ref[i]) : x - t.ref[i]));
  return { ref: t.ref, lo: t.lo.map((l, i) => Math.min(l, rel[i])), hi: t.hi.map((h, i) => Math.max(h, rel[i])) };
}

const spread = (t: Travel | null) => (t ? t.hi.reduce((sum, h, i) => sum + h - t.lo[i], 0) : 0);

/** 0..1: did the player move as much as the coach did? */
export function movedEnough(moved: number, shown: number): number {
  return shown < MIN_TRAVEL ? 1 : clamp01(moved / (MOVE_ENOUGH * shown));
}

function followScore(scores: readonly number[]): number {
  if (scores.length === 0) return 0;
  const kept = [...scores].sort((a, b) => b - a).slice(0, Math.max(1, Math.ceil(scores.length * (1 - DROP_WORST))));
  return kept.reduce((sum, v) => sum + v, 0) / kept.length;
}

const STILL_HINT = 'Не замирай в позе: двигайся вместе с тренером на каждый бит';

function finalize(s: DanceState, song: Song): Verdict {
  const step = song.steps[s.index];
  const best = s.best;
  const moving = movedEnough(spread(s.moved), spread(s.shown));
  const score = best ? followScore(s.scores) * (STILL_FLOOR + (1 - STILL_FLOOR) * moving) : 0;
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
  const worst = s.worst?.worst ?? best?.worst ?? null;
  const still = best !== null && moving < 0.6;
  let hint: string | null = null;
  let part: PartId | null = null;
  if (rating !== 'perfect') {
    // Standing still is the thing to fix unless a part was clearly wrong; out of frame comes first.
    if (!best) hint = 'Не видно тебя в кадре: встань так, чтобы камера видела голову, плечи и руки';
    else if (still && (!worst || worst.score > 0.3)) hint = STILL_HINT;
    else { hint = worst?.hint ?? STILL_HINT; part = worst?.part ?? null; }
  }
  const verdict: Verdict = { index: s.index, move: step.move, rating, score, hint, part };
  s.index++;
  s.best = null;
  s.worst = null;
  s.scores = [];
  s.moved = null;
  s.shown = null;
  if (s.index >= song.steps.length) s.finished = true;
  return verdict;
}

/** A player this much ahead of or behind the coach still counts as on time. */
export const TIMING_SLACK_S = 0.12;

/** How well the body matches the moving choreography at `time`, forgiving a little early or late. */
export function followEval(song: Song, time: number, body: BodyAngles): MoveEval | null {
  let best: MoveEval | null = null;
  // The player's pose arrives INPUT_LAG_S late, so compare it with what the coach showed then.
  for (const dt of [-TIMING_SLACK_S, 0, TIMING_SLACK_S]) {
    const target = poseAt(song, time - INPUT_LAG_S + dt);
    if (!target) continue;
    const e = evaluate(target, body);
    if (!best || e.score > best.score) best = e;
  }
  return best;
}

/**
 * Pure step: feeds one frame at song time `time` (seconds). Each frame in a move's judging
 * window is matched against the moving choreography; when the window closes the move gets a verdict.
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
    if (time < w.start) break;
    // Movement counts once the move is underway, so snapping from the last move's pose isn't dancing this one.
    const settled = time >= w.start + SETTLE_S;
    const target = poseAt(song, time - INPUT_LAG_S);
    if (target && settled) {
      s.shown = travel(s.shown, channels(target.arms.L.dir, target.arms.R.dir, target.arms.L.elbow, target.arms.R.elbow, target.tilt, target.depth ?? (target.squat ? 1 : 0)));
    }
    const e = body ? followEval(song, time, body) : null;
    if (!body || !e) {
      // Out of frame counts as not dancing.
      s.scores.push(0);
      break;
    }
    if (!s.best || e.score > s.best.score) s.best = e;
    if (!s.worst || e.score < s.worst.score) s.worst = e;
    s.scores.push(e.score);
    const { L, R } = body.arms;
    // A hidden arm doesn't move as far as we can tell; it just doesn't add travel.
    if (settled && L.ok && R.ok) {
      s.moved = travel(s.moved, channels(L.dir, R.dir, L.elbow, R.elbow, body.tilt, clamp01((body.drop ?? 0) / FULL_SQUAT)));
    }
    break;
  }
  return { state: s, verdicts };
}

export const maxPoints = (song: Song) => song.steps.length * RATING_POINTS.perfect;

/** Share of the maximum score at which each of the five stars lights up. */
export const STAR_THRESHOLDS: readonly number[] = [0.2, 0.4, 0.6, 0.75, 0.9];

/** 0..5 stars from the share of the maximum score. */
export function stars(points: number, song: Song): number {
  const share = points / maxPoints(song);
  return STAR_THRESHOLDS.filter((t) => share >= t).length;
}
