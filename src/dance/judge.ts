import type { Features, Side } from '../pose/features.ts';
import type { Calibration } from '../pose/gestures.ts';
import type { MoveTarget } from './moves.ts';

export type PartId = 'armL' | 'armR' | 'elbowL' | 'elbowR' | 'tilt' | 'squat';

export const PART_NAMES: Record<PartId, string> = {
  armL: 'Левая рука', armR: 'Правая рука', elbowL: 'Левый локоть', elbowR: 'Правый локоть', tilt: 'Наклон корпуса', squat: 'Присед',
};

export interface ArmAngles {
  ok: boolean;
  /** Wrist below the bottom edge of the frame. */
  offBottom: boolean;
  /** Shoulder-to-wrist direction: 0 = down, 90 = out, 180 = up, negative = across the body. */
  dir: number;
  elbow: number;
}

export interface BodyAngles {
  arms: Record<Side, ArmAngles>;
  tilt: number;
  /** Shoulder drop below the calibrated standing pose, in shoulder widths. Null before calibration. */
  drop: number | null;
}

export interface PartScore {
  part: PartId;
  /** 0..1 */
  score: number;
  /** What to change, in the player's terms. */
  hint: string;
}

export interface MoveEval {
  score: number;
  parts: PartScore[];
  /** The part to fix first, or null when every part is on target. */
  worst: PartScore | null;
}

const SIDES: readonly Side[] = ['L', 'R'];
const ARM: Record<Side, string> = { L: 'Левая', R: 'Правая' };
const ARM_ACC: Record<Side, string> = { L: 'левую', R: 'правую' };
const ELBOW: Record<Side, string> = { L: 'левый', R: 'правый' };
const PART_ARM: Record<Side, PartId> = { L: 'armL', R: 'armR' };
const PART_ELBOW: Record<Side, PartId> = { L: 'elbowL', R: 'elbowR' };

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const deg = (rad: number) => (rad * 180) / Math.PI;
/** Signed smallest difference a - b in degrees, in (-180, 180]. */
export const angleDiff = (a: number, b: number) => ((((a - b) % 360) + 540) % 360) - 180;

/** Arm and torso angles from the tracker's measurements. Null when nobody is in frame. */
export function bodyAngles(f: Features, calib: Calibration | null): BodyAngles | null {
  if (!f.present) return null;
  const arm = (s: Side): ArmAngles => {
    const a = f.arms[s];
    return { ok: a.ok, offBottom: a.offBottom, dir: deg(Math.atan2(a.out, -a.raise)), elbow: a.elbow };
  };
  return {
    arms: { L: arm('L'), R: arm('R') },
    tilt: f.tilt,
    drop: calib ? (f.midY - calib.midY) / calib.sw : null,
  };
}

/** Full credit within this many degrees of the target arm direction, none beyond ARM_ZERO_DEG. */
export const ARM_FULL_DEG = 18;
export const ARM_ZERO_DEG = 50;

/** A lowered arm that hangs below the frame is where a "down" target wants it. */
const DOWN_DEG = 25;

function armPart(s: Side, target: number, arm: ArmAngles): PartScore {
  if (!arm.ok && arm.offBottom) {
    return Math.abs(target) <= DOWN_DEG
      ? { part: PART_ARM[s], score: 1, hint: '' }
      : { part: PART_ARM[s], score: 0, hint: `${ARM[s]} рука ниже кадра: подними её, как у тренера` };
  }
  if (!arm.ok) return { part: PART_ARM[s], score: 0, hint: `Не вижу ${ARM_ACC[s]} руку: держи её в кадре` };
  const err = Math.abs(angleDiff(arm.dir, target));
  // Speak in terms of the arc a person feels: across the body, out to the side, higher or lower.
  let action: string;
  if (Math.abs(target) <= DOWN_DEG) action = 'опусти вдоль тела';
  else if (target < -15 && arm.dir > 0) action = 'уведи через тело к другому боку';
  else if (target > 15 && arm.dir < -15) action = 'отведи в сторону от тела';
  else action = Math.abs(target) > Math.abs(arm.dir) ? 'подними выше' : 'опусти ниже';
  const score = clamp01(1 - (err - ARM_FULL_DEG) / (ARM_ZERO_DEG - ARM_FULL_DEG));
  return { part: PART_ARM[s], score, hint: `${ARM[s]} рука: ${action} на ${Math.round(err)}°` };
}

function elbowPart(s: Side, target: number, arm: ArmAngles): PartScore | null {
  if (!arm.ok) return null;
  const err = Math.abs(arm.elbow - target);
  const hint = arm.elbow < target
    ? `Выпрями ${ELBOW[s]} локоть: сейчас ${Math.round(arm.elbow)}°`
    : `Согни ${ELBOW[s]} локоть: сейчас ${Math.round(arm.elbow)}°, нужно около ${target}°`;
  return { part: PART_ELBOW[s], score: clamp01(1 - (err - 30) / 50), hint };
}

function tiltPart(target: number, tilt: number): PartScore {
  const err = Math.abs(tilt - target);
  if (target === 0) {
    // Generous: raising one arm hikes that shoulder by itself.
    return { part: 'tilt', score: clamp01(1 - (err - 15) / 20), hint: `Выпрямись: плечи наклонены ${tilt > 0 ? 'влево' : 'вправо'} на ${Math.round(err)}°` };
  }
  const need = target - tilt;
  const side = need > 0 ? 'влево' : 'вправо';
  return { part: 'tilt', score: clamp01(1 - (err - 6) / 14), hint: `Наклонись ${side} сильнее: сейчас ${Math.round(Math.abs(tilt))}°, нужно ${Math.abs(target)}°` };
}

function squatPart(squat: boolean, drop: number): PartScore {
  return squat
    ? { part: 'squat', score: clamp01(drop / 0.35), hint: 'Присядь ниже: плечи должны опуститься' }
    : { part: 'squat', score: 1 - clamp01((drop - 0.25) / 0.3), hint: 'Встань ровно, здесь приседать не нужно' };
}

/**
 * How well the body matches a move, 0..1. Half the average of the parts, half the worst part,
 * so one arm completely off can't hide behind three perfect parts.
 */
export function evaluate(target: MoveTarget, body: BodyAngles): MoveEval {
  const parts: PartScore[] = [];
  for (const s of SIDES) {
    parts.push(armPart(s, target.arms[s].dir, body.arms[s]));
    const e = elbowPart(s, target.arms[s].elbow, body.arms[s]);
    if (e) parts.push(e);
  }
  parts.push(tiltPart(target.tilt, body.tilt));
  if (body.drop !== null) parts.push(squatPart(target.squat, body.drop));

  const mean = parts.reduce((sum, p) => sum + p.score, 0) / parts.length;
  let worst: PartScore | null = null;
  for (const p of parts) if (p.score < 0.999 && (!worst || p.score < worst.score)) worst = p;
  const min = worst ? worst.score : 1;
  return { score: 0.5 * mean + 0.5 * min, parts, worst };
}
