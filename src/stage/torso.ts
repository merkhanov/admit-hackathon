/**
 * The shape of a dancer's torso, measured from the model's own mesh: for each height, how far it
 * reaches to each side and how far forward its front is. The arms use it to pass in front of the
 * body instead of through it, whatever the character's build (Michelle's chest, a chibi's belly).
 *
 * Coordinates are in the chest's own frame, so the profile follows the dancer when she leans:
 * side (towards screen-right), up, and fwd (towards the camera).
 */
export interface BodyPoint {
  side: number;
  up: number;
  fwd: number;
}

interface Band {
  minSide: number;
  maxSide: number;
  front: number;
}

export interface TorsoProfile {
  bottom: number;
  step: number;
  bands: readonly (Band | null)[];
}

const BANDS = 18;

/** Builds the profile from the torso's vertices. */
export function measureTorso(points: readonly BodyPoint[]): TorsoProfile {
  let bottom = Infinity, top = -Infinity;
  for (const p of points) { bottom = Math.min(bottom, p.up); top = Math.max(top, p.up); }
  const step = (top - bottom) / BANDS || 1;
  const bands: (Band | null)[] = Array.from({ length: BANDS }, () => null);
  for (const p of points) {
    const i = Math.min(BANDS - 1, Math.floor((p.up - bottom) / step));
    const b = bands[i] ?? { minSide: Infinity, maxSide: -Infinity, front: -Infinity };
    b.minSide = Math.min(b.minSide, p.side);
    b.maxSide = Math.max(b.maxSide, p.side);
    b.front = Math.max(b.front, p.fwd);
    bands[i] = b;
  }
  return { bottom, step, bands };
}

/**
 * Whether the camera, looking at the dancer from the front, would see the point behind (or inside)
 * the torso. `margin` keeps a little air between the arm and the body. Neighbouring bands count too,
 * so a point near a band's edge is judged by the bulkier of the two.
 */
export function hiddenByTorso(p: BodyPoint, profile: TorsoProfile, margin: number): boolean {
  const i = Math.floor((p.up - profile.bottom) / profile.step);
  for (const j of [i - 1, i, i + 1]) {
    const b = profile.bands[j];
    if (!b) continue;
    if (p.side > b.minSide - margin && p.side < b.maxSide + margin && p.fwd < b.front + margin) return true;
  }
  return false;
}
