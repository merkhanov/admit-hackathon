import type { Side } from '../pose/features.ts';
import type { SynthParams } from '../pose/synthetic.ts';
import type { MoveTarget } from './moves.ts';

const ARM_LENGTH = 1.6; // shoulder widths, matches synthPose

/** Synthetic body parameters that perform a move exactly. Used by tests and the ?demo auto-dancer. */
export function paramsFor(move: MoveTarget, errors: Partial<Record<Side, number>> = {}): Partial<SynthParams> {
  const arm = (s: Side) => {
    const { dir, elbow } = move.arms[s];
    const d = ARM_LENGTH * Math.sin(((elbow / 2) * Math.PI) / 180);
    const a = ((dir + (errors[s] ?? 0)) * Math.PI) / 180;
    return { up: -Math.cos(a) * d, out: Math.sin(a) * d };
  };
  const L = arm('L'), R = arm('R');
  return { lUp: L.up, lOut: L.out, rUp: R.up, rOut: R.out, tilt: move.tilt, drop: move.squat ? 0.6 : 0 };
}
