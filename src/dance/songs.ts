import type { MoveId } from './moves.ts';
import type { Song } from './song.ts';

export type SongId = 'neonSteps' | 'neonGroove' | 'neonRush' | 'neonChill' | 'neonStorm';

export interface SongMeta {
  id: SongId;
  title: string;
  bpm: number;
  /** 1..5 difficulty stars. */
  difficulty: number;
  /** VFX palette key. */
  palette: string;
}

function buildSong(title: string, bpm: number, introBeats: number, beatsPerMove: number, outroBeats: number, moves: MoveId[]): Song {
  const steps = moves.map((move, i) => ({ move, beat: introBeats + i * beatsPerMove, beats: beatsPerMove }));
  return { title, bpm, introBeats, totalBeats: introBeats + moves.length * beatsPerMove + outroBeats, steps };
}

const A: MoveId[] = ['wings', 'up', 'wings', 'up', 'leftUp', 'rightUp', 'leftUp', 'rightUp'];
const B: MoveId[] = ['discoL', 'discoR', 'discoL', 'discoR', 'vee', 'muscles', 'vee', 'muscles'];
const C: MoveId[] = ['leanL', 'leanR', 'leanL', 'leanR', 'squat', 'up', 'squat', 'wings'];
const FINALE: MoveId[] = ['vee', 'up', 'wings', 'up'];

// Neon Groove — slower, simpler, arms-focused.
const G: MoveId[] = ['up', 'wings', 'up', 'wings', 'leftUp', 'rightUp', 'leftUp', 'rightUp', 'muscles', 'muscles', 'up', 'wings'];
// Neon Rush — faster, more dynamic.
const R: MoveId[] = ['discoL', 'discoR', 'discoL', 'discoR', 'vee', 'muscles', 'vee', 'muscles', 'squat', 'up', 'squat', 'wings', 'leftUp', 'rightUp', 'leanL', 'leanR'];
// Neon Chill — relaxed, wide moves.
const CH: MoveId[] = ['leanL', 'leanR', 'leanL', 'leanR', 'up', 'wings', 'leftUp', 'rightUp', 'vee', 'muscles', 'up', 'wings'];
// Neon Storm — intense, full-body.
const ST: MoveId[] = ['squat', 'up', 'squat', 'up', 'discoL', 'discoR', 'discoL', 'discoR', 'muscles', 'muscles', 'leanL', 'leanR', 'wings', 'up', 'leftUp', 'rightUp', 'squat', 'up', 'vee', 'wings'];

export const SONGS: Record<SongId, Song> = {
  neonSteps: buildSong('Neon Steps', 112, 8, 2, 8, [...A, ...B, ...C, ...A, ...B, ...C, ...FINALE]),
  neonGroove: buildSong('Neon Groove', 100, 8, 2, 8, [...G, ...G]),
  neonRush: buildSong('Neon Rush', 130, 8, 2, 8, [...R, ...R]),
  neonChill: buildSong('Neon Chill', 85, 8, 2, 8, [...CH, ...CH]),
  neonStorm: buildSong('Neon Storm', 150, 8, 2, 8, [...ST, ...ST]),
};

export const SONG_META: Record<SongId, SongMeta> = {
  neonSteps: { id: 'neonSteps', title: 'Neon Steps', bpm: 112, difficulty: 2, palette: 'steps' },
  neonGroove: { id: 'neonGroove', title: 'Neon Groove', bpm: 100, difficulty: 2, palette: 'groove' },
  neonRush: { id: 'neonRush', title: 'Neon Rush', bpm: 130, difficulty: 3, palette: 'rush' },
  neonChill: { id: 'neonChill', title: 'Neon Chill', bpm: 85, difficulty: 2, palette: 'chill' },
  neonStorm: { id: 'neonStorm', title: 'Neon Storm', bpm: 150, difficulty: 5, palette: 'storm' },
};

export const SONG_IDS: readonly SongId[] = ['neonSteps', 'neonGroove', 'neonRush', 'neonChill', 'neonStorm'];

/** Backwards-compatible default song. */
export const DEFAULT_SONG_ID: SongId = 'neonSteps';
