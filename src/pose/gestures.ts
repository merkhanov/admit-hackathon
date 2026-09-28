import type { Features, Side } from './features.ts';

type Tracked = Extract<Features, { present: true }>;

/** The only discrete gesture outside the song: a hand above the head starts and restarts a round. */
export type GestureId = 'jump';

export interface Calibration {
  midY: number;
  sw: number;
}

/**
 * How close the body is to a gesture. `p >= 1` means the gesture is done.
 * `hint` says what to change when the pose is close but not there.
 */
export interface Measure {
  p: number;
  hint?: string;
}

export interface GestureSpec {
  name: string;
  /** Progress where the "almost" zone starts. Hints only appear inside it. */
  nearP: number;
  /** Progress below which an active gesture is released (hysteresis). */
  exitP: number;
  measure: (f: Tracked) => Measure;
}

// Rough shoulder width in cm. Used only to phrase hints in human units.
const CM_PER_SW = 38;
/** Wrist above its own shoulder, in shoulder widths: about the top of the head. */
export const HAND_UP = 1.0;
/** How far a straight arm reaches sideways from the shoulder, in shoulder widths. */
const ARM_REACH = 1.6;

const cm = (shoulderWidths: number) => Math.max(1, Math.round(shoulderWidths * CM_PER_SW));
const ARM: Record<Side, string> = { L: 'левую', R: 'правую' };
const SIDES: readonly Side[] = ['R', 'L'];

function measureHandUp(f: Tracked): Measure {
  let best: Measure = { p: 0 };
  for (const s of SIDES) {
    const a = f.arms[s];
    if (!a.ok || a.out > 0.9) continue;
    const p = a.raise / HAND_UP;
    if (p > best.p) best = { p, hint: `Подними ${ARM[s]} руку выше головы, чтобы начать: не хватает ≈${cm(HAND_UP - a.raise)} см` };
  }
  return best;
}

export const GESTURES: Record<GestureId, GestureSpec> = {
  jump: { name: 'Рука вверх', nearP: 0.3, exitP: 0.7, measure: measureHandUp },
};

export const GESTURE_IDS: readonly GestureId[] = ['jump'];

/**
 * Largest shoulder width (fraction of frame height) at which a centred player's arms spread
 * sideways still fit in the frame: half the frame width must hold half the shoulders plus an arm.
 */
export const armsFitLimit = (aspect: number): number => aspect / 2 / (0.5 + ARM_REACH);

/** Returns a concrete framing problem, or null when the upper body is usable. */
export function framingProblem(f: Features): string | null {
  if (!f.present) return 'Не вижу тебя: встань перед камерой';
  if (f.vis < 0.5) return 'Не видно головы и плеч: отодвинься или наклони камеру, чтобы верх тела попал в кадр';
  if (f.sw > 0.8) return 'Слишком близко к камере: отодвинься, чтобы в кадр поместились поднятые руки';
  if (f.sw < 0.08) return 'Слишком далеко: подойди ближе к камере';
  return null;
}
