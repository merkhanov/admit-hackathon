import type { Side } from '../pose/features.ts';

/**
 * Where one arm should point, seen in the player's mirrored selfie view.
 * `dir` is the shoulder-to-wrist direction in degrees: 0 = down, 90 = out to the side,
 * 180 = straight up, negative = across the body. `elbow` is the elbow angle, 180 = straight.
 */
export interface ArmTarget {
  dir: number;
  elbow: number;
  /**
   * The elbow sits on the low side of the shoulder-to-wrist line (hands on hips, arms crossed,
   * fists holding reins) instead of the high side. Only the coach and pictograms use it:
   * the judge scores the elbow angle, which is the same either way.
   */
  low?: boolean;
}

export interface MoveTarget {
  name: string;
  /** Keyed by the player's own side, which is also the screen side in the mirrored view. */
  arms: Record<Side, ArmTarget>;
  /** Shoulder tilt in degrees, positive = leaning to the player's own left. */
  tilt: number;
  squat: boolean;
}

export type MoveId =
  | 'up' | 'vee' | 'wings' | 'leftUp' | 'rightUp' | 'discoL' | 'discoR' | 'muscles' | 'leanL' | 'leanR' | 'squat'
  | 'hips' | 'cross' | 'headHands' | 'letterC' | 'flossL' | 'flossR' | 'dabL' | 'dabR'
  | 'prisyadka' | 'hankyL' | 'hankyR' | 'rider' | 'whipL' | 'whipR';

const arm = (dir: number, elbow = 180, low = false): ArmTarget => (low ? { dir, elbow, low } : { dir, elbow });
const DOWN = arm(10);
/** Hand on the hip, elbow out to the side. */
const HIP = arm(0, 60, true);
/** Hand on the opposite shoulder, forearm across the chest. */
const CROSS = arm(-90, 75, true);
/** Hands on top of the head, elbows out. */
const HEAD = arm(-150, 60);
/** Fists in front of the chest, holding reins. */
const REINS = arm(-50, 50, true);

export const MOVES: Record<MoveId, MoveTarget> = {
  up: { name: 'Руки вверх', arms: { L: arm(180), R: arm(180) }, tilt: 0, squat: false },
  vee: { name: 'Звезда', arms: { L: arm(135), R: arm(135) }, tilt: 0, squat: false },
  wings: { name: 'Самолёт', arms: { L: arm(90), R: arm(90) }, tilt: 0, squat: false },
  leftUp: { name: 'Левая вверх', arms: { L: arm(180), R: DOWN }, tilt: 0, squat: false },
  rightUp: { name: 'Правая вверх', arms: { L: DOWN, R: arm(180) }, tilt: 0, squat: false },
  discoL: { name: 'Диско влево', arms: { L: arm(140), R: arm(-35) }, tilt: 0, squat: false },
  discoR: { name: 'Диско вправо', arms: { L: arm(-35), R: arm(140) }, tilt: 0, squat: false },
  muscles: { name: 'Бицепсы', arms: { L: arm(115, 80), R: arm(115, 80) }, tilt: 0, squat: false },
  leanL: { name: 'Наклон влево', arms: { L: arm(90), R: arm(170) }, tilt: 15, squat: false },
  leanR: { name: 'Наклон вправо', arms: { L: arm(170), R: arm(90) }, tilt: -15, squat: false },
  squat: { name: 'Присед', arms: { L: arm(90), R: arm(90) }, tilt: 0, squat: true },

  // Poses from well-known dances. Only the shapes are borrowed, never music or footage.
  hips: { name: 'Руки в боки', arms: { L: HIP, R: HIP }, tilt: 0, squat: false },
  cross: { name: 'Руки крест-накрест', arms: { L: CROSS, R: CROSS }, tilt: 0, squat: false },
  headHands: { name: 'Руки на голову', arms: { L: HEAD, R: HEAD }, tilt: 0, squat: false },
  letterC: { name: 'Буква C', arms: { L: arm(155, 120), R: arm(-75, 150) }, tilt: 0, squat: false },
  flossL: { name: 'Флосс влево', arms: { L: arm(50, 170), R: arm(-50, 170) }, tilt: 0, squat: false },
  flossR: { name: 'Флосс вправо', arms: { L: arm(-50, 170), R: arm(50, 170) }, tilt: 0, squat: false },
  dabL: { name: 'Дэб влево', arms: { L: arm(130), R: arm(-115, 70) }, tilt: 0, squat: false },
  dabR: { name: 'Дэб вправо', arms: { L: arm(-115, 70), R: arm(130) }, tilt: 0, squat: false },
  prisyadka: { name: 'Присядка', arms: { L: CROSS, R: CROSS }, tilt: 0, squat: true },
  hankyL: { name: 'Платочек слева', arms: { L: arm(150, 160), R: HIP }, tilt: 0, squat: false },
  hankyR: { name: 'Платочек справа', arms: { L: HIP, R: arm(150, 160) }, tilt: 0, squat: false },
  rider: { name: 'Всадник', arms: { L: REINS, R: REINS }, tilt: 0, squat: false },
  whipL: { name: 'Камча слева', arms: { L: arm(165, 110), R: REINS }, tilt: 0, squat: false },
  whipR: { name: 'Камча справа', arms: { L: REINS, R: arm(165, 110) }, tilt: 0, squat: false },
};

/**
 * Signed elbow bend for drawing: the upper arm points at `dir - bend / 2`, the forearm at `dir + bend / 2`.
 * A negative bend puts the elbow on the low side.
 */
export const drawBend = (a: ArmTarget): number => (a.low ? -1 : 1) * (180 - a.elbow);

export const MOVE_IDS = Object.keys(MOVES) as readonly MoveId[];
