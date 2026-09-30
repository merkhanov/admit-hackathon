import { chordFreqs, parseScore, type Kit, type ScoreNote } from './synth.ts';

/**
 * Every built-in song is played by the synth kit. The folk and classical melodies are in the
 * public domain; the arrangements, and the melodies of «Neon Steps», «Танцпол» and «Кара жорга», are ours.
 * Arrangements start their melody on the song's first move and stop at the outro.
 */
export type Arrangement = (k: Kit) => void;

const OUTRO_BEATS = 8;
const lastMoveBeat = (k: Kit) => k.song.totalBeats - OUTRO_BEATS;

/** The electro-pop groove of «Neon Steps», over any four-chord loop. */
function electro(chords: readonly string[], disco: boolean): Arrangement {
  return (k) => {
    const roots = chords.map((c) => { const f = chordFreqs(c, 2)[0]; return f < 80 ? f * 2 : f; });
    const stabs = chords.map((c) => { const f = chordFreqs(c, 3); return f[0] < 170 ? f.map((x) => x * 2) : f; });
    const first = k.song.introBeats, last = lastMoveBeat(k);
    for (let b = 0; b < k.song.totalBeats; b++) {
      const bar = Math.floor(b / 4), chord = bar % chords.length, inBar = b % 4;
      const dancing = b >= first && b < last;
      // Busier arrangement in the second half of each 32-beat section.
      const lift = dancing && Math.floor((b - first) / 16) % 2 === 1;
      k.kick(b);
      if (dancing && (inBar === 1 || inBar === 3)) k.snare(b, 0.5);
      k.hat(b + 0.5, dancing ? 0.22 : 0.12);
      if (dancing) k.hat(b, 0.1);
      if (disco && dancing) k.hiss(b + 0.5, 'highpass', 5000, 0.12, 0.2); // open hat on the offbeat
      if (b >= 4) {
        k.tone(b + 0.5, roots[chord], 0.45, 'sawtooth', 0.32, 600);
        if (lift || disco) k.tone(b, roots[chord] * 2, 0.3, 'sawtooth', 0.16, 900);
      }
      if (inBar === 0) for (const f of stabs[chord]) k.tone(b, f, 1.6, 'square', 0.05, 2200);
      if (dancing && inBar === 1) for (const f of stabs[chord]) k.tone(b + 0.5, f, 0.4, 'square', 0.035, 2600);
      if (lift) {
        const arp = [0, 1, 2, 1];
        for (let i = 0; i < 2; i++) k.tone(b + i / 2, stabs[chord][arp[(inBar * 2 + i) % 4]] * 2, 0.4, 'triangle', 0.09, 5000);
      }
    }
  };
}

/** Plays `score` bar by bar, calling `bar` with the chord of each bar. */
function perBar(start: number, barBeats: number, chords: readonly string[], bar: (b: number, chord: string, i: number) => void): void {
  chords.forEach((c, i) => bar(start + i * barBeats, c, i));
}

// ---------- «Коробейники», Russian folk song ----------

const KORO_A = parseScore(`
  E5 1 B4 1/2 C5 1/2 D5 1 C5 1/2 B4 1/2 | A4 1 A4 1/2 C5 1/2 E5 1 D5 1/2 C5 1/2 | B4 3/2 C5 1/2 D5 1 E5 1 | C5 1 A4 1 A4 2 |
  r 1/2 D5 1 F5 1/2 A5 1 G5 1/2 F5 1/2 | E5 3/2 C5 1/2 E5 1 D5 1/2 C5 1/2 | B4 1 B4 1/2 C5 1/2 D5 1 E5 1 | C5 1 A4 1 A4 2`);
const KORO_A_CHORDS = ['Am', 'Am', 'E', 'Am', 'Dm', 'C', 'E', 'Am'];
const KORO_B = parseScore(`E5 2 C5 2 | D5 2 B4 2 | C5 2 A4 2 | G#4 2 B4 2 | E5 2 C5 2 | D5 2 B4 2 | C5 1 E5 1 A5 2 | G#5 4`);
const KORO_B_CHORDS = ['Am', 'E', 'Am', 'E', 'Am', 'E', 'Am', 'E'];

const korobeiniki: Arrangement = (k) => {
  const first = k.song.introBeats, last = lastMoveBeat(k);
  const oompah = (b: number, chord: string, strong: boolean) => {
    const bass = chordFreqs(chord, 2);
    k.tone(b, bass[0], 0.9, 'triangle', 0.4, 900);
    k.tone(b + 2, bass[2] / 2, 0.9, 'triangle', 0.34, 900);
    for (const f of chordFreqs(chord, 4)) {
      k.tone(b + 1, f, 0.35, 'square', 0.035, 2000);
      k.tone(b + 3, f, 0.35, 'square', 0.035, 2000);
    }
    k.kick(b, 0.7); k.kick(b + 2, 0.6);
    k.snare(b + 1, strong ? 0.3 : 0.18); k.snare(b + 3, strong ? 0.3 : 0.18);
    for (let i = 0; i < 8; i++) k.hiss(b + i / 2, 'highpass', 6500, i % 2 ? 0.06 : 0.1, 0.06);
  };
  // Balalaika: short notes are single plucks, long notes a fast tremolo.
  const balalaika = (b: number, f: number, beats: number) => {
    if (beats <= 0.5) { k.pluck(b, f, 0.22, 3200, 0.25); return; }
    for (let x = 0; x < beats - 0.05; x += 0.25) k.pluck(b + x, f, 0.2 * (1 - (x / beats) * 0.5), 3000, 0.18);
  };
  const accordion = (b: number, f: number, beats: number) => k.held(b, f, beats, 'square', 0.035, 1800, 0.004);

  oompah(0, 'Am', false);
  oompah(4, 'E', false);
  const form: [ScoreNote[], string[]][] = [[KORO_A, KORO_A_CHORDS], [KORO_A, KORO_A_CHORDS], [KORO_B, KORO_B_CHORDS], [KORO_A, KORO_A_CHORDS]];
  let at = first;
  form.forEach(([score, chords], i) => {
    perBar(at, 4, chords, (b, c) => oompah(b, c, i !== 2));
    k.play(score, at, balalaika);
    if (i >= 2) k.play(score, at, accordion);
    at += 32;
  });
  // Outro: a final A minor, strummed.
  for (const f of chordFreqs('Am', 3)) for (let x = 0; x < 3; x += 0.25) k.pluck(last + x, f * 2, 0.12 * (1 - x / 3), 2400, 0.2);
  k.kick(last, 0.9);
  k.tone(last, chordFreqs('Am', 2)[0], 3, 'triangle', 0.4, 900);
};

// ---------- «Канкан», Jacques Offenbach, 1858 ----------

const CANCAN_1 = parseScore(`
  C5 2 | D5 1/2 F5 1/2 E5 1/2 D5 1/2 | G5 1 G5 1 | G5 1/2 A5 1/2 E5 1/2 F5 1/2 |
  D5 1 D5 1 | D5 1/2 F5 1/2 E5 1/2 D5 1/2 | C5 1/2 C6 1/2 B5 1/2 A5 1/2 | G5 1/2 F5 1/2 E5 1/2 D5 1/2 |
  C5 2 | D5 1/2 F5 1/2 E5 1/2 D5 1/2 | G5 1 G5 1 | G5 1/2 A5 1/2 E5 1/2 F5 1/2 |
  D5 1 D5 1 | D5 1/2 F5 1/2 E5 1/2 D5 1/2 | C5 1/2 G5 1/2 D5 1/2 E5 1/2 | C5 1 r 1`);
const CANCAN_CHORDS = ['C', 'G7', 'C', 'C', 'G', 'G7', 'C', 'G7', 'C', 'G7', 'C', 'C', 'G', 'G7', 'G', 'C'];

const cancan: Arrangement = (k) => {
  const first = k.song.introBeats, last = lastMoveBeat(k);
  // Galop: bass on the beat, chord on the offbeat, snare on the "and".
  const vamp = (b: number, chord: string, loud: boolean) => {
    const bass = chordFreqs(chord, 2), stab = chordFreqs(chord, 4);
    k.tone(b, bass[0], 0.45, 'triangle', 0.4, 900);
    k.tone(b + 1, bass[2] / 2, 0.45, 'triangle', 0.36, 900);
    for (const f of stab) { k.tone(b + 0.5, f, 0.25, 'square', 0.035, 2400); k.tone(b + 1.5, f, 0.25, 'square', 0.035, 2400); }
    k.kick(b, 0.8); k.kick(b + 1, 0.6);
    k.snare(b + 0.5, loud ? 0.3 : 0.2); k.snare(b + 1.5, loud ? 0.3 : 0.2);
  };
  const fiddle = (b: number, f: number, beats: number) => k.held(b, f, beats, 'sawtooth', 0.075, 3400, 0.006);
  const piccolo = (b: number, f: number, beats: number) => k.held(b, f * 2, beats, 'triangle', 0.045, 6000, 0.004);

  for (let b = 0; b < first; b += 2) vamp(b, b < 4 ? 'C' : 'G7', false);
  // A drum roll into the tune.
  for (let x = 0; x < 2; x += 0.125) k.hiss(first - 2 + x, 'bandpass', 2000, 0.05 + x * 0.1, 0.06);
  for (let i = 0; i < 4; i++) {
    const at = first + i * 32;
    k.hiss(at, 'highpass', 4000, 0.35, 1.2); // crash
    perBar(at, 2, CANCAN_CHORDS, (b, c) => vamp(b, c, i % 2 === 1));
    k.play(CANCAN_1, at, fiddle);
    if (i >= 2) k.play(CANCAN_1, at, piccolo);
  }
  // Outro: "ta-da!".
  for (const [x, peak] of [[0, 0.07], [1, 0.08]] as const) {
    for (const f of chordFreqs('C', 4)) k.held(last + x, f, x ? 3 : 0.5, 'sawtooth', peak, 3000);
    k.kick(last + x, 1);
  }
  k.hiss(last + 1, 'highpass', 4000, 0.4, 1.5);
};

// ---------- «В пещере горного короля», Edvard Grieg, 1875 ----------

const TROLL = parseScore(`
  B3 1/2 C#4 1/2 D4 1/2 E4 1/2 F#4 1/2 D4 1/2 F#4 1 | F4 1/2 C#4 1/2 F4 1 E4 1/2 C4 1/2 E4 1 |
  B3 1/2 C#4 1/2 D4 1/2 E4 1/2 F#4 1/2 D4 1/2 F#4 1/2 B4 1/2 | A4 1/2 F#4 1/2 D4 1/2 F#4 1/2 A4 2`);
/** Bass note every two beats under the troll phrase. */
const TROLL_BASS = ['B2', 'B2', 'C#3', 'C3', 'B2', 'B2', 'D3', 'F#2'];

const troll: Arrangement = (k) => {
  const first = k.song.introBeats, last = lastMoveBeat(k);
  const bassAt = (at: number, peak: number) => TROLL_BASS.forEach((n, i) => {
    const f = parseScore(`${n} 1`)[0].freq ?? 0;
    k.pluck(at + i * 2, f, peak, 1200, 0.3);
    k.pluck(at + i * 2 + 1, f, peak * 0.8, 1200, 0.3);
  });
  // Timpani taps while the trolls wake up.
  for (let b = 0; b < first; b++) k.kick(b, b % 2 ? 0.25 : 0.4, 55);
  bassAt(0, 0.18);
  for (let r = 0; r < 6; r++) {
    const at = first + r * 16;
    const loud = r >= 4, middle = r >= 2;
    bassAt(at, loud ? 0.3 : 0.2);
    // Pizzicato strings always; a reedy bassoon an octave up from the third round; fiddles and a piccolo at the end.
    k.play(TROLL, at, (b, f) => k.pluck(b, f, middle ? 0.16 : 0.22, middle ? 2600 : 1600, 0.2));
    if (middle) k.play(TROLL, at, (b, f, beats) => k.held(b, f * 2, beats, 'square', 0.05, 1800));
    if (loud) {
      k.play(TROLL, at, (b, f, beats) => k.held(b, f * 2, beats, 'sawtooth', 0.06, 3600, 0.004));
      k.play(TROLL, at, (b, f, beats) => k.held(b, f * 4, beats, 'triangle', 0.035, 6000));
    }
    for (let b = 0; b < 16; b++) {
      if (middle) k.kick(at + b, b % 2 ? 0.5 : 0.8, 50);
      if (loud && b % 2 === 1) k.snare(at + b, 0.35);
      if (middle) k.hat(at + b + 0.5, loud ? 0.14 : 0.08);
    }
    if (r === 4) k.hiss(at, 'highpass', 4000, 0.4, 1.4);
  }
  // Outro: the whole mountain crashes down on B minor.
  for (const x of [0, 1, 2]) {
    for (const f of chordFreqs('Bm', 3)) k.held(last + x, f, x === 2 ? 3 : 0.6, 'sawtooth', 0.07, 3000);
    k.kick(last + x, 1, 45);
  }
  k.hiss(last + 2, 'highpass', 4000, 0.45, 1.6);
};

// ---------- «Кара жорга»: a dombra tune written for the game, in 6/8 ----------

const ZHORGA_A = parseScore(`
  A4 2/3 A4 1/3 G4 2/3 A4 1/3 | C5 2/3 A4 1/3 G4 1 | F4 2/3 G4 1/3 A4 2/3 G4 1/3 | F4 2/3 E4 1/3 D4 1 |
  A4 2/3 A4 1/3 G4 2/3 A4 1/3 | C5 2/3 D5 1/3 C5 1 | A4 2/3 G4 1/3 F4 2/3 E4 1/3 | D4 2`);
const ZHORGA_A_CHORDS = ['Dm', 'C', 'F', 'Dm', 'Dm', 'C', 'Dm', 'Dm'];
const ZHORGA_B = parseScore(`
  D5 2/3 D5 1/3 C5 2/3 D5 1/3 | F5 2/3 D5 1/3 C5 1 | A4 2/3 C5 1/3 D5 2/3 C5 1/3 | A4 2/3 G4 1/3 A4 1 |
  D5 2/3 D5 1/3 C5 2/3 A4 1/3 | G4 2/3 A4 1/3 C5 1 | A4 2/3 G4 1/3 F4 2/3 E4 1/3 | D4 2`);
const ZHORGA_B_CHORDS = ['Dm', 'Dm', 'Am', 'Am', 'Dm', 'C', 'Am', 'Dm'];

const zhorga: Arrangement = (k) => {
  const first = k.song.introBeats, last = lastMoveBeat(k);
  // Dombra: two strings, root and fifth, strummed in a galloping long-short-short.
  const strum = (b: number, chord: string, loud: boolean) => {
    const [root, , fifth] = chordFreqs(chord, 3);
    [0.2, 0.1, 0.14].forEach((peak, i) => {
      const p = loud ? peak : peak * 0.7;
      k.pluck(b + i / 3, root, p, 2000, 0.22);
      k.pluck(b + i / 3, fifth, p * 0.8, 2000, 0.22);
    });
    k.kick(b, loud ? 0.6 : 0.4, 70); // frame drum
    k.hiss(b + 2 / 3, 'bandpass', 900, loud ? 0.14 : 0.08, 0.08);
  };
  const lead = (b: number, f: number) => k.pluck(b, f, 0.22, 3400, 0.3);
  const flute = (b: number, f: number, beats: number) => k.held(b, f * 2, beats, 'triangle', 0.05, 5000, 0.01);

  for (let b = 0; b < first; b++) strum(b, 'Dm', false);
  const form: [ScoreNote[], string[], boolean][] = [
    [ZHORGA_A, ZHORGA_A_CHORDS, false], [ZHORGA_A, ZHORGA_A_CHORDS, true], [ZHORGA_B, ZHORGA_B_CHORDS, true],
    [ZHORGA_A, ZHORGA_A_CHORDS, true], [ZHORGA_B, ZHORGA_B_CHORDS, true], [ZHORGA_A, ZHORGA_A_CHORDS, true],
  ];
  form.forEach(([score, chords, loud], i) => {
    const at = first + i * 16;
    perBar(at, 2, chords, (b, c) => { strum(b, c, loud); strum(b + 1, c, loud); });
    k.play(score, at, lead);
    if (score === ZHORGA_B || i === form.length - 1) k.play(score, at, flute);
  });
  // Outro: a last fast strum.
  for (let x = 0; x < 2; x += 1 / 6) for (const f of chordFreqs('Dm', 3)) k.pluck(last + x, f, 0.12 * (1 - x / 2.2), 2200, 0.2);
  k.kick(last, 0.8, 70);
};

export const ARRANGEMENTS: Record<string, Arrangement> = {
  neon: electro(['Am', 'F', 'C', 'G'], false),
  party: electro(['C', 'G', 'Am', 'F'], true),
  korobeiniki,
  cancan,
  troll,
  zhorga,
};
