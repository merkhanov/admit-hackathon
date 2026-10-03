/**
 * How a rigged arm turns its palm without breaking. Characters are skinned without twist bones, so a
 * forearm turned 180° about its length squeezes the elbow's skin to nothing and the arm looks snapped.
 * The turn is shared the way a real arm shares it, between the shoulder (the upper arm turns in its
 * socket), the forearm and the wrist, and each takes no more than its skin can bear.
 */

const RAD = Math.PI / 180;

/**
 * Most each joint turns about the arm's length (radians). Past these the skin pinches. The upper arm's
 * includes the turn that points the elbow's crease the way it bends.
 */
export const TWIST_MAX = { upper: 100 * RAD, fore: 75 * RAD, hand: 40 * RAD };
/** Share of the turn each joint carries; the wrist takes what's left. */
export const TWIST_SHARE = { upper: 0.35, fore: 0.6 };
/**
 * A turn may run past half a circle this far before taking the other way round, so a palm that should
 * face back over a raised arm doesn't spin a whole turn between two frames when it crosses 180°.
 */
const WRAP = 1.25 * Math.PI;

export const clampTurn = (angle: number, max: number): number => Math.max(-max, Math.min(max, angle));

/** `angle`, or the same direction a full circle either way, whichever is nearest `prev` within ±WRAP. */
export function continuousTurn(angle: number, prev: number | null): number {
  if (prev === null) return angle;
  let best = angle;
  for (const c of [angle - 2 * Math.PI, angle + 2 * Math.PI]) {
    if (Math.abs(c) <= WRAP && Math.abs(c - prev) < Math.abs(best - prev)) best = c;
  }
  return best;
}

/** 0 for a straight elbow, 1 once it bends past about 35°: how much the elbow's hinge decides the upper arm's turn. */
export function hingeWeight(sinBend: number): number {
  const t = Math.max(0, Math.min(1, (sinBend - 0.17) / (0.57 - 0.17)));
  return t * t * (3 - 2 * t);
}
