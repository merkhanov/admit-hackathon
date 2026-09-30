import { beatLength, type Song } from '../dance/song.ts';

const NOTE_SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "A4" → 440, "C#5", "Bb3". */
export function noteFreq(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`Bad note ${name}`);
  const semi = NOTE_SEMITONES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  const midi = 12 * (Number(m[3]) + 1) + semi;
  return 440 * 2 ** ((midi - 69) / 12);
}

export interface ScoreNote {
  /** Beat offset from the start of the phrase. */
  at: number;
  beats: number;
  /** Null for a rest. */
  freq: number | null;
}

/**
 * Parses a melody written as "E5 1 B4 1/2 C5 .5 r 1": note or rest, then its length in beats.
 * Bar lines "|" are ignored and only help reading.
 */
export function parseScore(text: string): ScoreNote[] {
  const tokens = text.split(/\s+/).filter((t) => t && t !== '|');
  const out: ScoreNote[] = [];
  let at = 0;
  for (let i = 0; i + 1 < tokens.length; i += 2) {
    const [n, d] = [tokens[i], tokens[i + 1]];
    const beats = d.includes('/') ? Number(d.split('/')[0]) / Number(d.split('/')[1]) : Number(d);
    if (!Number.isFinite(beats) || beats <= 0) throw new Error(`Bad length ${d}`);
    out.push({ at, beats, freq: n === 'r' ? null : noteFreq(n) });
    at += beats;
  }
  return out;
}

export const scoreLength = (score: readonly ScoreNote[]): number =>
  score.length ? score[score.length - 1].at + score[score.length - 1].beats : 0;

/** "Am" → A minor triad from `octave`; "E7", "C#", "F#m". Root first. */
export function chordFreqs(name: string, octave: number): number[] {
  const m = /^([A-G][#b]?)(m?)(7?)$/.exec(name);
  if (!m) throw new Error(`Bad chord ${name}`);
  const root = noteFreq(`${m[1]}${octave}`);
  const steps = [0, m[2] ? 3 : 4, 7, ...(m[3] ? [10] : [])];
  return steps.map((s) => root * 2 ** (s / 12));
}

/**
 * A small synth kit on an OfflineAudioContext. Every time is in beats of the song,
 * so arrangements read like sheet music.
 */
export class Kit {
  readonly beat: number;
  readonly song: Song;
  private readonly ctx: OfflineAudioContext;
  private readonly out: AudioNode;
  private readonly noise: AudioBuffer;

  constructor(ctx: OfflineAudioContext, out: AudioNode, song: Song) {
    this.ctx = ctx;
    this.song = song;
    this.out = out;
    this.beat = beatLength(song);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    let seed = 7;
    for (let i = 0; i < data.length; i++) data[i] = ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  }

  private t(b: number): number {
    return b * this.beat;
  }

  private decay(g: GainNode, t: number, peak: number, decay: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  }

  kick(b: number, peak = 1, low = 42): void {
    const t = this.t(b);
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(low, t + 0.3);
    this.decay(g, t, peak, 0.38);
    o.connect(g).connect(this.out);
    o.start(t); o.stop(t + 0.4);
  }

  /** Filtered noise hit: snares, hats, shakers, tambourines. */
  hiss(b: number, filter: BiquadFilterType, freq: number, peak: number, decay: number): void {
    const t = this.t(b);
    const src = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    src.buffer = this.noise;
    f.type = filter;
    f.frequency.value = freq;
    this.decay(g, t, peak, decay);
    src.connect(f).connect(g).connect(this.out);
    src.start(t, (b * 0.37) % 0.5); src.stop(t + decay + 0.02);
  }

  snare(b: number, peak = 0.5): void {
    this.hiss(b, 'bandpass', 1800, peak, 0.18);
    this.tone(b, 190, 0.08 / this.beat, 'triangle', peak / 2);
  }

  hat(b: number, peak = 0.15): void {
    this.hiss(b, 'highpass', 7000, peak, 0.05);
  }

  /** Percussive tone that decays over `beats`. */
  tone(b: number, freq: number, beats: number, type: OscillatorType, peak: number, cutoff = 4000): void {
    const t = this.t(b), dur = this.t(beats);
    const o = this.ctx.createOscillator(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    this.decay(g, t, peak, dur);
    o.connect(f).connect(g).connect(this.out);
    o.start(t); o.stop(t + dur + 0.02);
  }

  /** Held tone with a soft attack, a gentle vibrato and a short release: fiddles, flutes, bassoons. */
  held(b: number, freq: number, beats: number, type: OscillatorType, peak: number, cutoff = 3000, vibrato = 0): void {
    const t = this.t(b), dur = Math.max(0.06, this.t(beats) * 0.92);
    const o = this.ctx.createOscillator(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    if (vibrato > 0 && dur > 0.25) {
      const lfo = this.ctx.createOscillator(), depth = this.ctx.createGain();
      lfo.frequency.value = 5.5;
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(freq * vibrato, t + Math.min(0.3, dur));
      lfo.connect(depth).connect(o.frequency);
      lfo.start(t); lfo.stop(t + dur + 0.1);
    }
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.02);
    g.gain.setValueAtTime(peak, t + dur - 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.06);
    o.connect(f).connect(g).connect(this.out);
    o.start(t); o.stop(t + dur + 0.1);
  }

  /** Plucked string: balalaika, dombra, pizzicato. */
  pluck(b: number, freq: number, peak: number, cutoff = 2400, ring = 0.35): void {
    const t = this.t(b);
    const o = this.ctx.createOscillator(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    f.type = 'lowpass';
    f.frequency.setValueAtTime(cutoff, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(200, cutoff / 5), t + ring);
    this.decay(g, t, peak, ring);
    o.connect(f).connect(g).connect(this.out);
    o.start(t); o.stop(t + ring + 0.02);
  }

  /** Plays every note of a score starting at beat `start`. */
  play(score: readonly ScoreNote[], start: number, voice: (b: number, freq: number, beats: number) => void): void {
    for (const n of score) if (n.freq !== null) voice(start + n.at, n.freq, n.beats);
  }
}
