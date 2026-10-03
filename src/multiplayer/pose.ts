import type { BodyAngles } from '../dance/judge.ts';
import type { MoveTarget } from '../dance/moves.ts';
import { blendPose } from '../dance/motion.ts';
import type { CompactPose } from './types.ts';

/** Shoulder drop (in shoulder widths) that counts as a full squat, as in the judge. */
const FULL_SQUAT = 0.35;

/** A body as six rounded numbers, small enough to stream ten times a second. */
export function packPose(body: BodyAngles): CompactPose {
  const squat = body.drop === null ? 0 : Math.max(0, Math.min(1, body.drop / FULL_SQUAT));
  return [
    Math.round(body.arms.L.dir), Math.round(body.arms.L.elbow),
    Math.round(body.arms.R.dir), Math.round(body.arms.R.elbow),
    Math.round(body.tilt), Math.round(squat * 100),
  ];
}

/** The pose as a move target, so an avatar can be driven exactly like the coach. */
export function unpackPose([dirL, elbowL, dirR, elbowR, tilt, squat]: CompactPose): MoveTarget {
  return {
    name: '',
    arms: { L: { dir: dirL, elbow: elbowL }, R: { dir: dirR, elbow: elbowR } },
    tilt,
    squat: squat >= 50,
    depth: Math.max(0, Math.min(1, squat / 100)),
  };
}

/** A friend's pose as it arrived (ms, this machine's clock). */
export interface PoseSample { pose: CompactPose; at: number }

/**
 * A friend is drawn this long in the past, between the two poses that arrived around then (snapshot
 * interpolation, as networked games draw other players). Chasing each pose as it came, ~15 a second,
 * the avatar dashed to it and waited for the next: fast, slow, fast. One stream interval (66 ms) and
 * room for a late packet.
 */
export const POSE_DELAY_MS = 120;
/** Poses kept per friend: enough to span the delay, with late ones. */
const KEPT = 8;

/** Adds a pose that just arrived to a friend's recent poses, oldest first. */
export function keepPose(recent: readonly PoseSample[], sample: PoseSample): PoseSample[] {
  return [...recent, sample].slice(-KEPT);
}

/**
 * Where a friend was `POSE_DELAY_MS` before `now`, blended between the poses either side of that moment.
 * Past the newest pose it holds the newest one: a gap in the stream is never filled with a guess.
 */
export function poseAtTime(recent: readonly PoseSample[], now: number): MoveTarget | null {
  if (recent.length === 0) return null;
  const t = now - POSE_DELAY_MS;
  const after = recent.findIndex((s) => s.at > t);
  if (after === -1) return unpackPose(recent[recent.length - 1].pose);
  if (after === 0) return unpackPose(recent[0].pose);
  const a = recent[after - 1], b = recent[after];
  return blendPose(unpackPose(a.pose), unpackPose(b.pose), (t - a.at) / (b.at - a.at));
}
