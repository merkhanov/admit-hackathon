import { angleDiff } from './judge.ts';
import { MOVES, type ArmTarget, type MoveId, type MoveTarget } from './moves.ts';
import { clipSeconds, mocapPose } from './mocap.ts';
import { beatLength, type Song } from './song.ts';

/**
 * A move as a dancer does it: poses hit one per beat, flowing from one to the next.
 * The first pose is the move's pictogram; the rest keep the body moving to the music,
 * so standing still in the pictogram's pose isn't dancing.
 */
export interface Motion {
  poses: readonly MoveTarget[];
}

interface Tweak {
  L?: Partial<ArmTarget>;
  R?: Partial<ArmTarget>;
  tilt?: number;
  depth?: number;
}

/** The move's pose with some parts changed. */
function vary(id: MoveId, t: Tweak): MoveTarget {
  const m = MOVES[id];
  const depth = t.depth ?? (m.squat ? 1 : 0);
  return {
    ...m,
    arms: { L: { ...m.arms.L, ...t.L }, R: { ...m.arms.R, ...t.R } },
    tilt: t.tilt ?? m.tilt,
    squat: depth >= 0.5,
    depth,
  };
}

const motion = (id: MoveId, ...beats: Tweak[]): Motion => ({ poses: [MOVES[id], ...beats.map((t) => vary(id, t))] });

export const MOTIONS: Record<MoveId, Motion> = {
  // Raise the roof: arms punch up, elbows drop, punch again.
  up: motion('up', { L: { dir: 150, elbow: 110 }, R: { dir: 150, elbow: 110 } }),
  // A star that sways, arms riding a little higher on the way back.
  vee: motion('vee', { L: { dir: 150 }, R: { dir: 120 }, tilt: -7 }),
  // An aeroplane banking left and right.
  wings: motion('wings', { L: { dir: 70 }, R: { dir: 110 }, tilt: -9 }),
  // Pump the raised fist.
  leftUp: motion('leftUp', { L: { dir: 150, elbow: 110 } }),
  rightUp: motion('rightUp', { R: { dir: 150, elbow: 110 } }),
  // Disco point: finger up to the sky, then down across the body.
  discoL: motion('discoL', { L: { dir: -30 } }),
  discoR: motion('discoR', { R: { dir: -30 } }),
  // Flex, relax, flex.
  muscles: motion('muscles', { L: { dir: 100, elbow: 130 }, R: { dir: 100, elbow: 130 } }),
  // Lean into it, come halfway back, lean again.
  leanL: motion('leanL', { L: { dir: 110 }, R: { dir: 150 }, tilt: 6 }),
  leanR: motion('leanR', { L: { dir: 150 }, R: { dir: 110 }, tilt: -6 }),
  // Bounce in the squat.
  squat: motion('squat', { depth: 0.55, L: { dir: 110 }, R: { dir: 110 } }),

  // Hands on hips, shoulders shimmy side to side.
  hips: motion('hips', { tilt: 8 }, { tilt: -8 }),
  cross: motion('cross', { tilt: 7 }, { tilt: -7 }),
  headHands: motion('headHands', { tilt: 9 }, { tilt: -9 }),
  letterC: motion('letterC', { L: { dir: 140, elbow: 100 }, R: { dir: -60, elbow: 130 }, tilt: 5 }),
  // The floss swings the straight arms from one side of the body to the other on every beat.
  flossL: motion('flossL', { L: { dir: -50 }, R: { dir: 50 } }),
  flossR: motion('flossR', { L: { dir: 50 }, R: { dir: -50 } }),
  // Hit the dab, pull out of it, hit it again.
  dabL: motion('dabL', { L: { dir: 100 }, R: { dir: -80, elbow: 100 } }),
  dabR: motion('dabR', { L: { dir: -80, elbow: 100 }, R: { dir: 100 } }),
  // Bob in the squat with the arms crossed.
  prisyadka: motion('prisyadka', { depth: 0.55 }),
  // Wave the handkerchief overhead.
  hankyL: motion('hankyL', { L: { dir: 120, elbow: 130 }, tilt: 5 }),
  hankyR: motion('hankyR', { R: { dir: 120, elbow: 130 }, tilt: -5 }),
  // The rider's trot: fists bob on the reins, shoulders rock.
  rider: motion('rider', { L: { dir: -35, elbow: 70 }, R: { dir: -35, elbow: 70 }, tilt: 6 }, { tilt: -6 }),
  // Swing the whip overhead, then crack it out to the side.
  whipL: motion('whipL', { L: { dir: 115, elbow: 160 }, tilt: 6 }),
  whipR: motion('whipR', { R: { dir: 115, elbow: 160 }, tilt: -6 }),
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** Holds the pose just hit for a moment, then flows into the next one, arriving on the beat. */
const flow = (f: number) => {
  const g = clamp01((f - 0.25) / 0.75);
  return g * g * (3 - 2 * g);
};

const depthOf = (m: MoveTarget) => m.depth ?? (m.squat ? 1 : 0);

function blendArm(a: ArmTarget, b: ArmTarget, g: number): ArmTarget {
  const low = g < 0.5 ? a.low : b.low;
  const arm: ArmTarget = { dir: a.dir + angleDiff(b.dir, a.dir) * g, elbow: a.elbow + (b.elbow - a.elbow) * g };
  return low ? { ...arm, low } : arm;
}

/** A pose `g` of the way from `a` to `b`: arms swing the short way round, never through the body. */
export function blendPose(a: MoveTarget, b: MoveTarget, g: number): MoveTarget {
  const depth = depthOf(a) + (depthOf(b) - depthOf(a)) * g;
  return {
    name: g < 0.5 ? a.name : b.name,
    arms: { L: blendArm(a.arms.L, b.arms.L, g), R: blendArm(a.arms.R, b.arms.R, g) },
    tilt: a.tilt + (b.tilt - a.tilt) * g,
    squat: depth >= 0.5,
    depth,
  };
}

/**
 * The pose the choreography wants at song time `time` (seconds), moving continuously:
 * every beat of a step hits the next pose of its motion, and the step's last beat flows
 * into the next step's first pose. Null in the intro and outro.
 */
export function poseAt(song: Song, time: number): MoveTarget | null {
  const beat = time / beatLength(song);
  const i = song.steps.findIndex((s) => beat >= s.beat && beat < s.beat + s.beats);
  if (i < 0) return null;
  // A recorded dance: exactly what the dancer did at this beat.
  if (song.mocap) return mocapPose(song.mocap, clipSeconds(song.mocap, beat - song.introBeats));
  const step = song.steps[i];
  const poses = MOTIONS[step.move].poses;
  const local = beat - step.beat;
  const k = Math.floor(local);
  const from = poses[k % poses.length];
  const next = song.steps[i + 1];
  const last = k + 1 >= step.beats;
  // Flow into the next move only when it follows straight on; the last move comes to rest on its pose.
  const to = !last ? poses[(k + 1) % poses.length]
    : next && next.beat === step.beat + step.beats ? MOTIONS[next.move].poses[0]
    : from;
  return blendPose(from, to, flow(local - k));
}
