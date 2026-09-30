import type { MoveId } from './moves.ts';
import { buildMocapSong } from './mocap.ts';
import { SAMBA } from './mocap/samba.ts';
import { buildSong, type Song } from './song.ts';

/** What the song picker says about a song. */
export interface SongInfo {
  song: Song;
  /** Composer or origin. */
  credit: string;
  /** Which dances the choreography is built from. */
  dances: string;
  /** The coach's costume for this song. */
  coach: string;
}

type Phrase = readonly MoveId[];
const repeat = (...phrases: Phrase[]): MoveId[] => phrases.flat();

// «Neon Steps»: the original song with the basic moves.
const NEON_A: Phrase = ['wings', 'up', 'wings', 'up', 'leftUp', 'rightUp', 'leftUp', 'rightUp'];
const NEON_B: Phrase = ['discoL', 'discoR', 'discoL', 'discoR', 'vee', 'muscles', 'vee', 'muscles'];
const NEON_C: Phrase = ['leanL', 'leanR', 'leanL', 'leanR', 'squat', 'up', 'squat', 'wings'];
const NEON_END: Phrase = ['vee', 'up', 'wings', 'up'];

// «Танцпол»: party dances everybody knows. The YMCA letters, the Macarena arm sequence
// (arms out stands in for arms forward, which a front camera can't see), the floss and the dab.
const YMCA: Phrase = ['vee', 'headHands', 'letterC', 'up', 'vee', 'headHands', 'letterC', 'up'];
const MACARENA: Phrase = ['wings', 'cross', 'headHands', 'hips', 'wings', 'cross', 'headHands', 'hips'];
const FLOSS_DAB: Phrase = ['flossL', 'flossR', 'flossL', 'flossR', 'dabL', 'dabR', 'dabL', 'dabR'];
const PARTY_END: Phrase = ['up', 'vee', 'dabL', 'dabR', 'flossL', 'flossR', 'vee', 'up'];

// «Коробейники»: Russian folk dance. Hands on hips, a handkerchief waved overhead, the squat with crossed arms.
const KORO_A: Phrase = [
  'hips', 'hankyL', 'hips', 'hankyR', 'cross', 'up', 'cross', 'up',
  'hankyL', 'hankyR', 'hankyL', 'hankyR', 'hips', 'prisyadka', 'hips', 'vee',
];
const KORO_B: Phrase = [
  'wings', 'leanL', 'wings', 'leanR', 'cross', 'prisyadka', 'cross', 'up',
  'leanL', 'leanR', 'hankyL', 'hankyR', 'hips', 'prisyadka', 'hips', 'up',
];

// «Канкан»: the legs do the famous kicks; the camera judges the arms and the lean.
const CANCAN_A: Phrase = [
  'hips', 'hankyL', 'hips', 'hankyR', 'leanL', 'leanR', 'vee', 'up',
  'hips', 'hankyL', 'hips', 'hankyR', 'wings', 'leanL', 'leanR', 'vee',
];
const CANCAN_B: Phrase = [
  'headHands', 'hips', 'headHands', 'hips', 'leanL', 'leanR', 'wings', 'vee',
  'hankyL', 'hankyR', 'hankyL', 'hankyR', 'leanL', 'leanR', 'up', 'vee',
];

// «В пещере горного короля»: trolls sneak, flex and grow bigger with the music.
const TROLL_A: Phrase = ['cross', 'muscles', 'cross', 'muscles', 'leanL', 'leanR', 'leanL', 'leanR'];
const TROLL_B: Phrase = ['headHands', 'muscles', 'headHands', 'muscles', 'discoL', 'discoR', 'discoL', 'discoR'];
const TROLL_END: Phrase = ['up', 'vee', 'up', 'vee', 'wings', 'squat', 'wings', 'up'];

// «Кара жорга»: the Kazakh horse-rider dance. Fists hold the reins, one hand swings the whip (камча).
const ZHORGA_A: Phrase = ['rider', 'whipL', 'rider', 'whipR', 'hips', 'leanL', 'hips', 'leanR'];
const ZHORGA_B: Phrase = ['whipL', 'whipR', 'whipL', 'whipR', 'wings', 'rider', 'vee', 'rider'];

export const SONGS: readonly SongInfo[] = [
  {
    song: buildSong('neon', 'Neon Steps', 112, repeat(NEON_A, NEON_B, NEON_C, NEON_A, NEON_B, NEON_C, NEON_END)),
    credit: 'Своя песня · электропоп',
    dances: 'Базовые движения: самолёт, диско, бицепсы, наклоны',
    coach: 'Звезда сцены',
  },
  {
    song: buildSong('party', 'Танцпол', 120, repeat(YMCA, MACARENA, FLOSS_DAB, YMCA, MACARENA, FLOSS_DAB, PARTY_END)),
    credit: 'Своя песня · диско',
    dances: 'YMCA, макарена, флосс и дэб',
    coach: 'Диджей',
  },
  {
    song: buildSong('korobeiniki', 'Коробейники', 124, repeat(KORO_A, KORO_A, KORO_B, KORO_A)),
    credit: 'Русская народная песня',
    dances: 'Русский пляс: руки в боки, платочек, присядка',
    coach: 'Коробейник в папахе',
  },
  {
    song: buildSong('cancan', 'Канкан', 136, repeat(CANCAN_A, CANCAN_B, CANCAN_A, CANCAN_B)),
    credit: 'Жак Оффенбах, 1858',
    dances: 'Канкан из парижского кабаре',
    coach: 'Танцовщица с бантом',
  },
  {
    song: buildSong('troll', 'В пещере горного короля', 128, repeat(TROLL_A, TROLL_B, TROLL_A, TROLL_B, TROLL_A, TROLL_END)),
    credit: 'Эдвард Григ, 1875',
    dances: 'Танец троллей: крадёмся и показываем силу',
    coach: 'Горный король в короне',
  },
  {
    song: buildSong('zhorga', 'Кара жорга', 112, repeat(ZHORGA_A, ZHORGA_A, ZHORGA_B, ZHORGA_A, ZHORGA_B, ZHORGA_A)),
    credit: 'Казахский народный танец · мелодия написана для игры',
    dances: 'Всадник, камча, руки в боки',
    coach: 'Джигит в калпаке',
  },
  {
    // Danced to a recording of a real dancer, at the tempo it was recorded, so her steps land on the music.
    song: buildMocapSong('samba', 'Самба', 60 / SAMBA.beat, SAMBA, 48),
    credit: 'Своя мелодия · танец записан с живой танцовщицы',
    dances: 'Настоящая самба: движения всего тела записаны с человека',
    coach: 'Танцовщица',
  },
];

export const DEFAULT_SONG = SONGS[0];

/** Looks a built-in song up by id. */
export const songInfo = (id: string): SongInfo | undefined => SONGS.find((s) => s.song.id === id);

/** Phrases a generated dance is made of: every built-in dance, with at most one squat each. */
const PHRASE_LIBRARY: readonly Phrase[] = [
  NEON_A, NEON_B, NEON_C, YMCA, MACARENA, FLOSS_DAB, TROLL_A, TROLL_B, ZHORGA_A, ZHORGA_B,
  KORO_A.slice(0, 8), CANCAN_A.slice(8), CANCAN_B.slice(0, 8),
];

/** Longest dance made for a song file, in seconds. The rest of the song is not used. */
export const CUSTOM_MAX_S = 90;
/** Shortest usable song file, in seconds. */
export const CUSTOM_MIN_S = 30;

/** Folds a detected tempo into a comfortable counting range (half-time or double-time is the same beat). */
export function danceTempo(bpm: number): number {
  let b = bpm;
  while (b < 80) b *= 2;
  while (b >= 160) b /= 2;
  return b;
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * A dance for a song file: `seconds` of music from its first beat at `bpm`. Phrases from the
 * built-in dances are picked by the title, so the same song always gets the same dance,
 * and each phrase plays twice, like a chorus.
 */
export function customSong(title: string, bpm: number, seconds: number): Song {
  const tempo = danceTempo(bpm);
  const beat = 60 / tempo;
  // About one move a second: two beats, or four when the song is fast.
  const beatsPerMove = 2 * beat < 0.9 ? 4 : 2;
  const introBeats = 8, outroBeats = 4;
  const beats = Math.floor(Math.min(seconds, CUSTOM_MAX_S) / beat);
  const count = Math.max(8, Math.floor((beats - introBeats - outroBeats) / beatsPerMove / 4) * 4);
  let seed = hash(title) || 1;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const moves: MoveId[] = [];
  let last = -1;
  while (moves.length < count) {
    let pick = Math.floor(random() * PHRASE_LIBRARY.length);
    if (pick === last) pick = (pick + 1) % PHRASE_LIBRARY.length;
    last = pick;
    moves.push(...PHRASE_LIBRARY[pick], ...PHRASE_LIBRARY[pick]);
  }
  return buildSong('custom', title, tempo, moves.slice(0, count), { introBeats, outroBeats, beatsPerMove });
}

/** A built-in song's id, as rooms send it. A song file stays on its own device, so it never has one. */
export type SongId = string;
