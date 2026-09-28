import type { Side } from '../pose/features.ts';

/**
 * Where one arm should point, seen in the player's mirrored selfie view.
 * `dir` is the shoulder-to-wrist direction in degrees: 0 = down, 90 = out to the side,
 * 180 = straight up, negative = across the body. `elbow` is the elbow angle, 180 = straight.
 */
export interface ArmTarget {
  dir: number;
  elbow: number;
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
  | 'up' | 'vee' | 'wings' | 'leftUp' | 'rightUp' | 'discoL' | 'discoR' | 'muscles' | 'leanL' | 'leanR' | 'squat';

const arm = (dir: number, elbow = 180): ArmTarget => ({ dir, elbow });
const DOWN = arm(10);

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
};

export const MOVE_IDS: readonly MoveId[] = ['up', 'vee', 'wings', 'leftUp', 'rightUp', 'discoL', 'discoR', 'muscles', 'leanL', 'leanR', 'squat'];
