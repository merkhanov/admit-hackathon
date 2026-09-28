import type { MoveTarget } from '../dance/moves.ts';
import type { Side } from '../pose/features.ts';

const RAD = Math.PI / 180;

interface Seg { x1: number; y1: number; x2: number; y2: number }

/**
 * Stick-figure geometry of a move in a 64x64 box, as the player sees the coach:
 * target arm "L" is drawn on the left. Shared by the SVG pictograms and the 2D fallback.
 */
export function figureSegments(move: MoveTarget): { segs: Seg[]; head: { x: number; y: number }; tilt: number } {
  const squat = move.squat;
  const hipY = squat ? 44 : 40;
  const segs: Seg[] = [];
  // Legs.
  if (squat) {
    segs.push({ x1: 32, y1: hipY, x2: 22, y2: 52 }, { x1: 22, y1: 52, x2: 24, y2: 60 });
    segs.push({ x1: 32, y1: hipY, x2: 42, y2: 52 }, { x1: 42, y1: 52, x2: 40, y2: 60 });
  } else {
    segs.push({ x1: 32, y1: hipY, x2: 25, y2: 60 }, { x1: 32, y1: hipY, x2: 39, y2: 60 });
  }
  // Torso and arms, before tilting around the hips.
  const neckY = hipY - 20;
  segs.push({ x1: 32, y1: hipY, x2: 32, y2: neckY });
  for (const s of ['L', 'R'] as const satisfies readonly Side[]) {
    const sign = s === 'L' ? -1 : 1;
    const sx = 32 + sign * 6, sy = neckY + 2;
    const { dir, elbow } = move.arms[s];
    const bend = 180 - elbow;
    const upper = (dir - bend / 2) * RAD, fore = (dir + bend / 2) * RAD;
    const ex = sx + sign * Math.sin(upper) * 9, ey = sy + Math.cos(upper) * 9;
    segs.push({ x1: sx, y1: sy, x2: ex, y2: ey });
    segs.push({ x1: ex, y1: ey, x2: ex + sign * Math.sin(fore) * 9, y2: ey + Math.cos(fore) * 9 });
    segs.push({ x1: 32, y1: neckY + 2, x2: sx, y2: sy });
  }
  return { segs, head: { x: 32, y: neckY - 6 }, tilt: move.tilt };
}

/** SVG pictogram for the move strip and the warm-up card. */
export function pictogramSvg(move: MoveTarget, color = 'currentColor'): string {
  const { segs, head, tilt } = figureSegments(move);
  const hipY = move.squat ? 44 : 40;
  const legs = segs.slice(0, move.squat ? 4 : 2);
  const upper = segs.slice(move.squat ? 4 : 2);
  const line = (s: Seg) => `<line x1="${s.x1.toFixed(1)}" y1="${s.y1.toFixed(1)}" x2="${s.x2.toFixed(1)}" y2="${s.y2.toFixed(1)}"/>`;
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="${color}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round">
    ${legs.map(line).join('')}
    <g transform="rotate(${-tilt} 32 ${hipY})">${upper.map(line).join('')}<circle cx="${head.x}" cy="${head.y}" r="5" fill="${color}"/></g>
  </g></svg>`;
}
