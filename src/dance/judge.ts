import type { Features, Side } from '../pose/features.ts';
import type { Calibration } from '../pose/gestures.ts';
import { t } from '../i18n.ts';
import type { MoveTarget } from './moves.ts';

export type PartId = 'armL' | 'armR' | 'elbowL' | 'elbowR' | 'tilt' | 'squat';

export const PART_IDS: readonly PartId[] = ['armL', 'armR', 'elbowL', 'elbowR', 'tilt', 'squat'];

/** A body part's name in the current language. */
export const partName = (part: PartId): string => t(`part.${part}`);

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

/**
 * Which way to move, as the player sees it on screen (the view is a mirror, so the player's left is
 * screen-left). Drawn as a big arrow next to the hint, so it reads at a glance from across the room.
 */
export type Cue = 'up' | 'down' | 'left' | 'right' | 'bend' | 'straighten' | 'look';

export interface PartScore {
  part: PartId;
  /** 0..1 */
  score: number;
  /** What to change, in the player's terms. */
  hint: string;
  cue?: Cue;
}

export interface MoveEval {
  score: number;
  parts: PartScore[];
  /** The part to fix first, or null when every part is on target. */
  worst: PartScore | null;
}

const SIDES: readonly Side[] = ['L', 'R'];
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

/**
 * With the elbow folded the hand stays near the shoulder, and the shoulder-to-wrist direction swings
 * wildly for small movements, for the camera as much as for the dancer. The tolerance widens with the bend.
 */
const foldSlack = (elbow: number) => 1 + Math.max(0, 120 - elbow) / 60;

function armPart(s: Side, target: number, arm: ArmAngles, targetElbow: number, recorded: boolean): PartScore {
  if (!arm.ok && arm.offBottom) {
    return Math.abs(target) <= DOWN_DEG
      ? { part: PART_ARM[s], score: 1, hint: '' }
      : { part: PART_ARM[s], score: 0, hint: t(`hint.armBelow.${s}`), cue: 'up' };
  }
  if (!arm.ok) return { part: PART_ARM[s], score: 0, hint: t(`hint.armLost.${s}`), cue: 'look' };
  const err = Math.abs(angleDiff(arm.dir, target));
  // Speak in terms of the arc a person feels: across the body, out to the side, higher or lower.
  let action: 'down' | 'head' | 'across' | 'out' | 'up' | 'lower';
  if (Math.abs(target) <= DOWN_DEG) action = 'down';
  else if (target < -120 && arm.dir > 90) action = 'head';
  else if (target < -15 && arm.dir > 0) action = 'across';
  else if (target > 15 && arm.dir < -15) action = 'out';
  else action = Math.abs(target) > Math.abs(arm.dir) ? 'up' : 'lower';
  const slack = recorded ? foldSlack(targetElbow) : 1;
  const score = clamp01(1 - (err - ARM_FULL_DEG * slack) / ((ARM_ZERO_DEG - ARM_FULL_DEG) * slack));
  // The player's left arm is on screen-left: moving it out goes left, across the body goes right.
  const outward: Cue = s === 'L' ? 'left' : 'right', inward: Cue = s === 'L' ? 'right' : 'left';
  const cue: Cue = action === 'up' || action === 'head' ? 'up' : action === 'out' ? outward : action === 'across' ? inward : 'down';
  return { part: PART_ARM[s], score, hint: t(`hint.arm.${s}`, { action: t(`action.${action}`), deg: Math.round(err) }), cue };
}

function elbowPart(s: Side, target: number, arm: ArmAngles): PartScore | null {
  if (!arm.ok) return null;
  const err = Math.abs(arm.elbow - target);
  const straighten = arm.elbow < target;
  const hint = straighten
    ? t(`hint.straighten.${s}`, { now: Math.round(arm.elbow) })
    : t(`hint.bend.${s}`, { now: Math.round(arm.elbow), target: Math.round(target) });
  return { part: PART_ELBOW[s], score: clamp01(1 - (err - 30) / 50), hint, cue: straighten ? 'straighten' : 'bend' };
}

function tiltPart(target: number, tilt: number): PartScore {
  const err = Math.abs(tilt - target);
  if (target === 0) {
    // Generous: raising one arm hikes that shoulder by itself.
    return { part: 'tilt', score: clamp01(1 - (err - 15) / 20), hint: t(tilt > 0 ? 'hint.upright.left' : 'hint.upright.right', { deg: Math.round(err) }), cue: tilt > 0 ? 'right' : 'left' };
  }
  const need = target - tilt;
  const key = need > 0 ? 'hint.lean.left' : 'hint.lean.right';
  return { part: 'tilt', score: clamp01(1 - (err - 6) / 14), hint: t(key, { now: Math.round(Math.abs(tilt)), target: Math.round(Math.abs(target)) }), cue: need > 0 ? 'left' : 'right' };
}

function squatPart(squat: boolean, drop: number): PartScore {
  return squat
    ? { part: 'squat', score: clamp01(drop / 0.35), hint: t('hint.squatLower'), cue: 'down' }
    : { part: 'squat', score: 1 - clamp01((drop - 0.25) / 0.3), hint: t('hint.standUp'), cue: 'up' };
}

/**
 * How well the body matches a move, 0..1. Half the average of the parts, half the worst part,
 * so one arm completely off can't hide behind three perfect parts. A `recorded` dance forgives the
 * direction of a folded arm (see foldSlack); the built-in moves stay strict so they can be told apart.
 */
export function evaluate(target: MoveTarget, body: BodyAngles, { recorded = false } = {}): MoveEval {
  const parts: PartScore[] = [];
  for (const s of SIDES) {
    parts.push(armPart(s, target.arms[s].dir, body.arms[s], target.arms[s].elbow, recorded));
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
