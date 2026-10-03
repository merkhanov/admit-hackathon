import { seen } from './features.ts';
import { IDX, type Landmark, type Pose } from './landmarks.ts';

/**
 * Keeps the model's arm mistakes out of the game, before smoothing. MediaPipe has no fix for any of
 * them: it calls occluded limbs out of scope (google-ai-edge/mediapipe#5806) and can rate a hidden
 * joint 0.99 visible (#5197). Three rules taken from projects that hit the same problems:
 *
 * 1. Left/right swap: the two arms are relabelled together, from the elbow down, when the swapped
 *    labels fit where each arm was heading far better than the given ones. Heading, not just the last
 *    frame, is what tells a swap from arms crossing (PanopticPigskin, keypoint_filter.py fix_lr_flips).
 * 2. A joint that moves faster than a body can, or ends up too far from its parent joint, isn't
 *    trusted (motion5, gap-detector.ts: speed in bone lengths per second).
 * 3. An untrusted joint holds its last trusted position for a moment, then is reported lost. It
 *    stays where it was and is never placed somewhere new (motion5, hold-filler.ts).
 */

/** An arm from the elbow down, hand included: [left, right] landmark pairs, swapped together. */
const ARM_PAIRS: readonly (readonly [number, number])[] = [
  [IDX.LEFT_ELBOW, IDX.RIGHT_ELBOW], [IDX.LEFT_WRIST, IDX.RIGHT_WRIST], [17, 18], [19, 20], [21, 22],
];
/** The joints the guard vouches for, each after its parent. Shoulders belong to the torso, which the model rarely gets wrong. */
const PARENT: readonly (readonly [number, number])[] = [
  [IDX.LEFT_ELBOW, IDX.LEFT_SHOULDER], [IDX.RIGHT_ELBOW, IDX.RIGHT_SHOULDER],
  [IDX.LEFT_WRIST, IDX.LEFT_ELBOW], [IDX.RIGHT_WRIST, IDX.RIGHT_ELBOW],
];
/** Swap when the swapped fit is under 70% of the given one, minus a margin (PanopticPigskin: 0.3 and 8 px). */
const SWAP_GAIN = 0.7;
const SWAP_MARGIN = 0.1; // shoulder widths
/**
 * A correction is checked against the guard's own past, so a wrong one could last forever. When the
 * model has insisted on its labels this long, it wins and the guard starts over: its glitches last a
 * few frames, so a real swap is still undone, and a wrong correction is gone within one beat.
 */
const MAX_SWAP_MS = 500;
/** motion5 allows 20 bone lengths a second; an upper arm or forearm is about 0.8 shoulder widths. */
const MAX_SPEED = 16; // shoulder widths per second
/** Upper arm and forearm are under a shoulder width; past this the joint is detached from its parent. */
const MAX_BONE = 1.4; // shoulder widths
/** How long an untrusted joint holds its place and still counts as seen: a short occlusion, not a beat. */
export const LOST_AFTER_MS = 250;

export interface ArmGuard {
  /** Guarded pose of the last frame, and of the one before, for the heading of each arm. */
  last: Landmark[];
  prev: Landmark[] | null;
  lastT: number;
  prevT: number;
  /** When each landmark was last trusted (ms). */
  trustedAt: number[];
  /** Since when every frame's arm labels have been swapped, or null. */
  swappedSince: number | null;
}

const start = (pose: Landmark[], t: number) => ({
  pose, guard: { last: pose, prev: null, lastT: t, prevT: t, trustedAt: pose.map(() => t), swappedSince: null },
});

export function guardArms(g: ArmGuard | null, raw: Pose | null, t: number, aspect: number, calibSw: number | null): { pose: Landmark[] | null; guard: ArmGuard | null } {
  if (!raw) return { pose: null, guard: null };
  const cur = raw.map((p) => ({ ...p }));
  // After a gap (a background tab) the old heading points anywhere, and every joint would be lost anyway.
  if (!g || g.last.length !== cur.length || t - g.lastT > LOST_AFTER_MS) return start(cur, t);
  const dist = (a: Landmark, b: Landmark) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
  // Turning sideways narrows the shoulders, not the arms: the calibrated width keeps the limits fair.
  const sw = Math.max(dist(cur[IDX.LEFT_SHOULDER], cur[IDX.RIGHT_SHOULDER]), calibSw ?? 0) || 1e-6;

  const { last, prev } = g;
  const ahead = prev && g.lastT > g.prevT ? (t - g.lastT) / (g.lastT - g.prevT) : 0;
  const predict = (i: number): Landmark => prev
    ? { x: last[i].x + (last[i].x - prev[i].x) * ahead, y: last[i].y + (last[i].y - prev[i].y) * ahead }
    : last[i];
  const fit = (from: 0 | 1, to: 0 | 1) => ARM_PAIRS.slice(0, 2).reduce((s, pair) => s + dist(cur[pair[from]], predict(pair[to])), 0);
  const swapped = ARM_PAIRS.slice(0, 2).every(([l, r]) => seen(cur[l]) && seen(cur[r]))
    && fit(0, 1) + fit(1, 0) < (fit(0, 0) + fit(1, 1)) * SWAP_GAIN - SWAP_MARGIN * sw;
  const swappedSince = swapped ? g.swappedSince ?? t : null;
  if (swappedSince !== null && t - swappedSince > MAX_SWAP_MS) return start(cur, t);
  if (swapped) for (const [l, r] of ARM_PAIRS) [cur[l], cur[r]] = [cur[r], cur[l]];

  const trustedAt = [...g.trustedAt];
  const held = new Set<number>();
  for (const [i, parent] of PARENT) {
    const p = cur[i];
    const sinceTrust = (t - g.trustedAt[i]) / 1000;
    // A held parent is an old position: measuring a joint from it would freeze a joint the model sees well.
    const attached = held.has(parent) || dist(p, cur[parent]) <= MAX_BONE * sw;
    if (seen(p) && attached && dist(p, last[i]) <= MAX_SPEED * sw * sinceTrust) {
      trustedAt[i] = t;
      continue;
    }
    held.add(i);
    if (t - g.trustedAt[i] <= LOST_AFTER_MS) cur[i] = { ...last[i] };
    // Lost. Above the top edge a joint counts as seen whatever its visibility (a raised hand), so there
    // it can't be held: the model's own guess takes over, and it isn't seen.
    else if (last[i].y >= 0.05) cur[i] = { ...last[i], visibility: 0 };
  }
  return { pose: cur, guard: { last: cur, prev: last, lastT: t, prevT: g.lastT, trustedAt, swappedSince } };
}
