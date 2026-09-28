import type { Landmark } from './landmarks.ts';

/** Body parameters for a generated pose. Distances are in shoulder widths. */
export interface SynthParams {
  /** Body centre, fraction of frame width. */
  cx: number;
  /** Shoulder height, fraction of frame height. */
  sy: number;
  /** Shoulder width, fraction of frame height. */
  sw: number;
  /** Degrees, positive = leaning to the person's own left. */
  tilt: number;
  /** Shoulders below standing height. */
  drop: number;
  rUp: number;
  rOut: number;
  lUp: number;
  lOut: number;
  /** Visibility of every landmark. */
  vis: number;
}

export const NEUTRAL: SynthParams = {
  cx: 0.5, sy: 0.42, sw: 0.22, tilt: 0, drop: 0, rUp: -1.4, rOut: 0.15, lUp: -1.4, lOut: 0.15, vis: 1,
};

export const SYNTH_ASPECT = 4 / 3;

/**
 * Builds MediaPipe-shaped landmarks (raw camera image, not mirrored) from body parameters.
 * `noise` adds uniform jitter to every coordinate, as a fraction of the frame, to mimic a real camera.
 */
export function synthPose(p: SynthParams, noise = 0, random: () => number = Math.random): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.1 }));
  const sw = p.sw, a = (p.tilt * Math.PI) / 180;
  const up = { x: Math.sin(a), y: -Math.cos(a) };
  const hip = { x: p.cx * SYNTH_ASPECT, y: p.sy + 1.5 * sw + p.drop * sw };
  const mid = { x: hip.x + up.x * 1.5 * sw, y: hip.y + up.y * 1.5 * sw };
  const hx = (Math.cos(a) * sw) / 2, hy = (Math.sin(a) * sw) / 2;
  const LS = { x: mid.x + hx, y: mid.y + hy }, RS = { x: mid.x - hx, y: mid.y - hy };
  const nose = { x: mid.x + up.x * 0.65 * sw, y: mid.y + up.y * 0.65 * sw };

  const arm = (S: { x: number; y: number }, raise: number, out: number, dir: 1 | -1) => {
    const L = 1.6 * sw;
    let W = { x: S.x + dir * out * sw, y: S.y - raise * sw };
    let d = Math.hypot(W.x - S.x, W.y - S.y);
    if (d > L) {
      W = { x: S.x + ((W.x - S.x) * L) / d, y: S.y + ((W.y - S.y) * L) / d };
      d = L;
    }
    const h = Math.sqrt(Math.max(0, (L / 2) ** 2 - (d / 2) ** 2));
    let n = { x: -(W.y - S.y) / d, y: (W.x - S.x) / d };
    if (n.y + n.x * dir * 0.5 < 0) n = { x: -n.x, y: -n.y };
    return { elbow: { x: (S.x + W.x) / 2 + n.x * h, y: (S.y + W.y) / 2 + n.y * h }, wrist: W };
  };
  const left = arm(LS, p.lUp, p.lOut, 1), right = arm(RS, p.rUp, p.rOut, -1);

  const jitter = () => (random() * 2 - 1) * noise;
  const put = (i: number, q: { x: number; y: number }) => {
    const x = q.x / SYNTH_ASPECT + jitter(), y = q.y + jitter();
    // Like MediaPipe: a point outside the frame still gets coordinates, but low visibility.
    const inside = x >= 0 && x <= 1 && y >= 0 && y <= 1;
    lm[i] = { x, y, visibility: inside ? p.vis : Math.min(p.vis, 0.1) };
  };
  put(0, nose);
  put(11, LS); put(12, RS);
  put(13, left.elbow); put(14, right.elbow);
  put(15, left.wrist); put(16, right.wrist);
  put(23, { x: hip.x + 0.35 * sw, y: hip.y }); put(24, { x: hip.x - 0.35 * sw, y: hip.y });
  return lm;
}

/** Seeded PRNG so noisy tests are repeatable. */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
