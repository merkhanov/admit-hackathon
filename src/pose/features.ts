import { IDX, type Pose } from './landmarks.ts';

export type Side = 'L' | 'R';

export interface ArmFeatures {
  /** Wrist is visible, or above the top edge of the frame (a raised hand still counts). */
  ok: boolean;
  /** Wrist height above its own shoulder, in shoulder widths. */
  raise: number;
  /** Wrist distance outward from its own shoulder, in shoulder widths. */
  out: number;
  /** Angle at the elbow in degrees, 180 = straight arm. */
  elbow: number;
  /** The wrist is past the left or right edge of the frame. */
  offSide: boolean;
  /** The wrist is below the bottom edge (common when seated or far back). */
  offBottom: boolean;
}

export type Features =
  | { present: false }
  | {
      present: true;
      /** Lowest visibility among nose and both shoulders. */
      vis: number;
      /** Shoulder width as a fraction of the frame height. */
      sw: number;
      /** Shoulder line tilt in degrees, positive when the person leans to their own left. */
      tilt: number;
      /** Shoulder midpoint height as a fraction of the frame height. */
      midY: number;
      /** Frame width / height. */
      aspect: number;
      arms: Record<Side, ArmFeatures>;
    };

interface Point { x: number; y: number; v: number }

/** A wrist this sure is seen, wherever it is. */
const SURE = 0.5;
/**
 * The light pose model is shy about wrists: on real dancing it often rates a correctly placed wrist
 * 0.3–0.5, and the game used to say "can't see your arm" while it was plainly in view. Measured
 * against MediaPipe's most accurate model, wrists in that range inside the frame point the right way
 * almost every time, so they count. Outside the frame such a wrist is a guess and still doesn't.
 */
const LIKELY = 0.3;
const inFrame = (x: number, y: number) => x >= 0.02 && x <= 0.98 && y >= 0 && y <= 0.98;

const visibility = (v: number | undefined) => v ?? 1;

function angleAt(a: Point, b: Point, c: Point): number {
  const v1x = a.x - b.x, v1y = a.y - b.y, v2x = c.x - b.x, v2y = c.y - b.y;
  const d = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y) || 1;
  const cos = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / d));
  return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * Turns raw landmarks into body measurements that don't depend on distance to the camera.
 * `aspect` is frame width / height, so x and y are measured in the same units.
 */
export function features(pose: Pose | null, aspect: number): Features {
  if (!pose) return { present: false };
  const P = (i: number): Point => ({ x: pose[i].x * aspect, y: pose[i].y, v: visibility(pose[i].visibility) });
  const ls = P(IDX.LEFT_SHOULDER), rs = P(IDX.RIGHT_SHOULDER), nose = P(IDX.NOSE);
  const sw = Math.hypot(ls.x - rs.x, ls.y - rs.y) || 1e-6;
  // In the raw (unmirrored) image the person's left shoulder is on the right.
  // Leaning to their own left pushes that shoulder down.
  const tilt = (Math.atan2(ls.y - rs.y, Math.abs(ls.x - rs.x)) * 180) / Math.PI;

  const arm = (s: number, e: number, w: number, outward: 1 | -1): ArmFeatures => {
    const S = P(s), E = P(e), W = P(w);
    return {
      ok: W.v >= SURE || (W.v >= LIKELY && inFrame(pose[w].x, pose[w].y)) || W.y < 0.05,
      raise: (S.y - W.y) / sw,
      out: (outward * (W.x - S.x)) / sw,
      elbow: angleAt(S, E, W),
      offSide: pose[w].x < 0.01 || pose[w].x > 0.99,
      offBottom: pose[w].y > 0.99,
    };
  };

  return {
    present: true,
    vis: Math.min(nose.v, ls.v, rs.v),
    sw,
    tilt,
    midY: (ls.y + rs.y) / 2,
    aspect,
    arms: {
      L: arm(IDX.LEFT_SHOULDER, IDX.LEFT_ELBOW, IDX.LEFT_WRIST, 1),
      R: arm(IDX.RIGHT_SHOULDER, IDX.RIGHT_ELBOW, IDX.RIGHT_WRIST, -1),
    },
  };
}
