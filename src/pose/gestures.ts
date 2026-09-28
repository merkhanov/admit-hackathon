import type { Features, Side } from './features.ts';

type Tracked = Extract<Features, { present: true }>;

export type GestureId = 'jump' | 'punch' | 'duck' | 'leanL' | 'leanR';

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
  /** Held gestures emit Start/End events instead of a single event. */
  held: boolean;
  measure: (f: Tracked, calib: Calibration | null) => Measure;
}

// Rough shoulder width in cm. Used only to phrase hints in human units.
const CM_PER_SW = 38;
export const JUMP_UP = 1.0;
export const PUNCH_OUT = 1.2;
export const PUNCH_ELBOW = 150;
export const PUNCH_BAND = 0.5;
export const DUCK_DROP = 0.45;
export const LEAN_DEG = 14;

const cm = (shoulderWidths: number) => Math.max(1, Math.round(shoulderWidths * CM_PER_SW));
const ARM: Record<Side, string> = { L: 'левую', R: 'правую' };
const ELBOW: Record<Side, string> = { L: 'левый', R: 'правый' };
const SIDES: readonly Side[] = ['R', 'L'];

function measureJump(f: Tracked): Measure {
  let best: Measure = { p: 0 };
  for (const s of SIDES) {
    const a = f.arms[s];
    if (!a.ok || a.out > 0.9) continue; // a sideways arm belongs to the punch
    const p = a.raise / JUMP_UP;
    if (p > best.p) {
      best = { p, hint: `Подними ${ARM[s]} руку выше головы, чтобы прыгнуть: не хватает ≈${cm(JUMP_UP - a.raise)} см` };
    }
  }
  return best;
}

function measurePunch(f: Tracked): Measure {
  let best: Measure = { p: 0 };
  for (const s of SIDES) {
    const a = f.arms[s];
    if (!a.ok || Math.abs(a.raise) >= 1.0 || a.out < 0.5) continue;
    let p = Math.min(a.out / PUNCH_OUT, 1);
    let hint: string | undefined;
    if (Math.abs(a.raise) >= PUNCH_BAND) {
      hint = a.raise > 0
        ? `Опусти ${ARM[s]} руку до уровня плеча: сейчас выше на ≈${cm(a.raise)} см`
        : `Подними ${ARM[s]} руку до уровня плеча: сейчас ниже на ≈${cm(-a.raise)} см`;
    } else if (a.elbow < PUNCH_ELBOW) {
      hint = `Выпрями ${ELBOW[s]} локоть: рука согнута на ${Math.round(180 - a.elbow)}°, для удара нужна прямая`;
    } else if (a.out < PUNCH_OUT) {
      hint = `Вытяни ${ARM[s]} руку дальше в сторону: ещё ≈${cm(PUNCH_OUT - a.out)} см`;
    }
    if (hint) p = Math.min(p, 0.99);
    if (p > best.p) best = { p, hint };
  }
  return best;
}

function measureDuck(f: Tracked, calib: Calibration | null): Measure {
  if (!calib) return { p: 0 };
  const drop = (f.midY - calib.midY) / calib.sw;
  return { p: drop / DUCK_DROP, hint: `Присядь ниже, чтобы пригнуться: ещё ≈${cm(DUCK_DROP - drop)} см` };
}

const measureLean = (dir: Side) => (f: Tracked): Measure => {
  const deg = dir === 'L' ? f.tilt : -f.tilt;
  return {
    p: deg / LEAN_DEG,
    hint: `Наклонись сильнее ${dir === 'L' ? 'влево' : 'вправо'}: сейчас ${Math.round(Math.max(0, deg))}°, нужно ${LEAN_DEG}°`,
  };
};

export const GESTURES: Record<GestureId, GestureSpec> = {
  jump: { name: 'Прыжок', nearP: 0.3, exitP: 0.7, held: false, measure: measureJump },
  punch: { name: 'Удар', nearP: 0.58, exitP: 0.8, held: false, measure: measurePunch },
  duck: { name: 'Присед', nearP: 0.4, exitP: 0.67, held: true, measure: measureDuck },
  leanL: { name: 'Наклон влево', nearP: 0.45, exitP: 0.65, held: false, measure: measureLean('L') },
  leanR: { name: 'Наклон вправо', nearP: 0.45, exitP: 0.65, held: false, measure: measureLean('R') },
};

export const GESTURE_IDS: readonly GestureId[] = ['jump', 'punch', 'duck', 'leanL', 'leanR'];

/** Raising one arm tilts the shoulders, so leans don't count while an arm is busy. */
export function armBusy(f: Tracked): boolean {
  return SIDES.some((s) => f.arms[s].ok && (f.arms[s].raise > 0.3 || f.arms[s].out > 0.7));
}

/** Returns a concrete framing problem, or null when the upper body is usable. */
export function framingProblem(f: Features): string | null {
  if (!f.present) return 'Не вижу тебя: встань перед камерой';
  if (f.vis < 0.5) return 'Не видно головы и плеч: отодвинься или наклони камеру, чтобы верх тела попал в кадр';
  if (f.sw > 0.8) return 'Слишком близко к камере: отодвинься, чтобы в кадр поместились поднятые руки';
  if (f.sw < 0.08) return 'Слишком далеко: подойди ближе к камере';
  return null;
}
