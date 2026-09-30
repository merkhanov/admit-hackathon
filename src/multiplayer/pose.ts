import type { BodyAngles } from '../dance/judge.ts';
import type { MoveTarget } from '../dance/moves.ts';
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
