import type { Mocap } from './mocap.ts';
import type { MoveId, MoveTarget } from './moves.ts';

export interface Step {
  move: MoveId;
  /** Beat on which the coach hits the pose. */
  beat: number;
  /** How many beats the pose is held. */
  beats: number;
  /** A recorded dance's pose at the step's first beat: what its pictogram shows. `move` is the nearest built-in move. */
  pose?: MoveTarget;
}

export interface Song {
  /** Stable key for records and themes. */
  id: string;
  title: string;
  bpm: number;
  /** Beats of music before the first move, while the coach warms up. */
  introBeats: number;
  totalBeats: number;
  steps: Step[];
  /** A dance recorded from a real dancer: the coach performs it and the player is judged on it, beat for beat. */
  mocap?: Mocap;
  /** A video of the dancer the recording was taken from, under public/ without its extension (.mp4 and .webm): shown instead of the 3D coach. */
  video?: string;
}

export interface SongShape {
  introBeats?: number;
  outroBeats?: number;
  beatsPerMove?: number;
}

/** Lays moves out back to back after the intro, one every `beatsPerMove` beats. */
export function buildSong(id: string, title: string, bpm: number, moves: readonly MoveId[], shape: SongShape = {}): Song {
  const { introBeats = 8, outroBeats = 8, beatsPerMove = 2 } = shape;
  const steps = moves.map((move, i) => ({ move, beat: introBeats + i * beatsPerMove, beats: beatsPerMove }));
  return { id, title, bpm, introBeats, totalBeats: introBeats + moves.length * beatsPerMove + outroBeats, steps };
}

export const beatLength = (song: Song) => 60 / song.bpm;
export const beatTime = (song: Song, beat: number) => beat * beatLength(song);
export const songDuration = (song: Song) => beatTime(song, song.totalBeats);

/**
 * The camera, the pose model and landmark smoothing make the player's pose arrive this late.
 * Judging windows are shifted by it, so a player who is exactly on the beat gets credit.
 */
export const INPUT_LAG_S = 0.15;

/** When a step is judged: from just before the coach hits the pose until the next move starts. */
export function judgeWindow(song: Song, step: Step): { start: number; end: number } {
  return {
    start: beatTime(song, step.beat) - 0.2 + INPUT_LAG_S,
    end: beatTime(song, step.beat + step.beats) - 0.2 + INPUT_LAG_S,
  };
}

/** Index of the step the coach is showing at `time`, or -1 in the intro and outro. */
export function stepAt(song: Song, time: number): number {
  const beat = time / beatLength(song);
  return song.steps.findIndex((s) => beat >= s.beat && beat < s.beat + s.beats);
}
