import type { MoveId } from './moves.ts';

export interface Step {
  move: MoveId;
  /** Beat on which the coach hits the pose. */
  beat: number;
  /** How many beats the pose is held. */
  beats: number;
}

export interface Song {
  title: string;
  bpm: number;
  /** Beats of music before the first move, while the coach warms up. */
  introBeats: number;
  totalBeats: number;
  steps: Step[];
}

const A: MoveId[] = ['wings', 'up', 'wings', 'up', 'leftUp', 'rightUp', 'leftUp', 'rightUp'];
const B: MoveId[] = ['discoL', 'discoR', 'discoL', 'discoR', 'vee', 'muscles', 'vee', 'muscles'];
const C: MoveId[] = ['leanL', 'leanR', 'leanL', 'leanR', 'squat', 'up', 'squat', 'wings'];
const FINALE: MoveId[] = ['vee', 'up', 'wings', 'up'];

function buildSong(): Song {
  const introBeats = 8, beatsPerMove = 2, outroBeats = 8;
  const moves = [...A, ...B, ...C, ...A, ...B, ...C, ...FINALE];
  const steps = moves.map((move, i) => ({ move, beat: introBeats + i * beatsPerMove, beats: beatsPerMove }));
  return { title: 'Neon Steps', bpm: 112, introBeats, totalBeats: introBeats + moves.length * beatsPerMove + outroBeats, steps };
}

export const SONG: Song = buildSong();

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
