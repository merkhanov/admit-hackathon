import { blendPose } from './motion.ts';
import type { Song, Step } from './song.ts';
import { MOVE_IDS, MOVES, type MoveTarget } from './moves.ts';
import { evaluate, type BodyAngles } from './judge.ts';

/**
 * A dance recorded from a real dancer (motion capture), reduced to what the camera measures on a
 * player: arm directions and elbows, lean and squat depth, `fps` times a second. Made by
 * scripts/extract-dance.mjs; the coach plays the full-body recording itself.
 */
export interface Mocap {
  id: string;
  fps: number;
  /** Seconds per beat of the dance as it was captured. */
  beat: number;
  /** Seconds into the recording of its first beat. */
  offset?: number;
  /** False for a dance recorded once, start to finish, such as a video: it plays once instead of repeating. */
  loop?: boolean;
  /** Per frame: left arm direction, left elbow, right arm direction, right elbow, tilt, squat %. */
  frames: readonly (readonly number[])[];
}

/** Whole beats of the recording: the loop that repeats. */
export const loopBeats = (m: Mocap): number => Math.max(1, Math.round(m.frames.length / m.fps / m.beat));

/**
 * Deepest lean a recording asks for. Dancers bend far sideways, but the game reads a lean from the
 * shoulder line: past this a player would have to fold over to copy it, and the camera can't read it.
 */
export const MAX_RECORDED_TILT = 30;

/** The frame's pose as a move target, so the judge and pictograms treat it like any move. */
function framePose(f: readonly number[]): MoveTarget {
  const depth = Math.max(0, Math.min(1, f[5] / 100));
  const tilt = Math.max(-MAX_RECORDED_TILT, Math.min(MAX_RECORDED_TILT, f[4]));
  return { name: '', arms: { L: { dir: f[0], elbow: f[1] }, R: { dir: f[2], elbow: f[3] } }, tilt, squat: depth >= 0.5, depth };
}

/** How long the recording is, in seconds. */
export const recordingSeconds = (m: Mocap): number => m.frames.length / m.fps;

/** Whole beats a one-take recording has after its first beat. */
export const recordedBeats = (m: Mocap): number => Math.floor((recordingSeconds(m) - (m.offset ?? 0)) / m.beat);

/**
 * Where in the recording (seconds) a dance `beats` beats in is. A loop repeats on a whole beat;
 * a one-take recording starts at its first beat and holds its first and last frames outside it.
 */
export function clipSeconds(m: Mocap, beats: number): number {
  if (m.loop === false) return Math.max(0, Math.min(recordingSeconds(m) - 1 / m.fps, (m.offset ?? 0) + beats * m.beat));
  const loop = loopBeats(m);
  return ((((beats % loop) + loop) % loop) * m.beat);
}

/** The recorded pose at `seconds` into the recording, between frames, wrapping round the loop. */
export function mocapPose(m: Mocap, seconds: number): MoveTarget {
  const n = m.frames.length;
  const x = seconds * m.fps;
  const i = Math.floor(x);
  const at = (k: number) => m.frames[m.loop === false ? Math.max(0, Math.min(n - 1, k)) : ((k % n) + n) % n];
  return blendPose(framePose(at(i)), framePose(at(i + 1)), x - i);
}

/** The built-in move that looks most like a pose: its name goes in the verdict ("Самолёт: точно как у тренера!"). */
export function nearestMove(pose: MoveTarget): (typeof MOVE_IDS)[number] {
  const body: BodyAngles = {
    arms: {
      L: { ok: true, offBottom: false, dir: pose.arms.L.dir, elbow: pose.arms.L.elbow },
      R: { ok: true, offBottom: false, dir: pose.arms.R.dir, elbow: pose.arms.R.elbow },
    },
    tilt: pose.tilt,
    drop: (pose.depth ?? (pose.squat ? 1 : 0)) * 0.35,
  };
  let best = MOVE_IDS[0], score = -1;
  for (const id of MOVE_IDS) {
    const s = evaluate(MOVES[id], body).score;
    if (s > score) { best = id; score = s; }
  }
  return best;
}

/**
 * A song danced to a recording: after the intro the dancer repeats the recording, stretched so its
 * beat lands on the song's, and every `beatsPerStep` beats is a step with its own pictogram and verdict.
 */
export function buildMocapSong(id: string, title: string, bpm: number, mocap: Mocap, steps: number, { introBeats = 8, outroBeats = 8, beatsPerStep = 2 } = {}): Song {
  const list: Step[] = [];
  for (let i = 0; i < steps; i++) {
    const beat = introBeats + i * beatsPerStep;
    const pose = { ...mocapPose(mocap, clipSeconds(mocap, beat - introBeats)) };
    const move = nearestMove(pose);
    list.push({ move, beat, beats: beatsPerStep, pose: { ...pose, name: MOVES[move].name } });
  }
  return { id, title, bpm, introBeats, totalBeats: introBeats + steps * beatsPerStep + outroBeats, steps: list, mocap };
}

/** Where in the recording the coach is at song `time` (seconds), or null when the song has none. */
export function songClipSeconds(song: Song, time: number): number | null {
  if (!song.mocap) return null;
  return clipSeconds(song.mocap, (time * song.bpm) / 60 - song.introBeats);
}
