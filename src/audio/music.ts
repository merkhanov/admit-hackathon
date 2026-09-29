import { beatLength, songDuration, type Song } from '../dance/song.ts';

const SAMPLE_RATE = 44100;
// A minor loop: Am, F, C, G. Root notes in Hz, then the chord tones above them.
const ROOTS = [110, 87.31, 130.81, 98];
const CHORDS = [[220, 261.63, 329.63], [174.61, 220, 261.63], [261.63, 329.63, 392], [196, 246.94, 293.66]];
const ARP = [0, 1, 2, 1];

/** Everything is synthesized: an original track with no samples and no licensing questions. */
export async function renderSong(song: Song): Promise<AudioBuffer> {
  const duration = songDuration(song) + 1;
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * SAMPLE_RATE), SAMPLE_RATE);
  const beat = beatLength(song);
  const master = ctx.createGain();
  master.gain.value = 0.55;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);

  const noise = ctx.createBuffer(1, SAMPLE_RATE, SAMPLE_RATE);
  const data = noise.getChannelData(0);
  let seed = 7;
  for (let i = 0; i < data.length; i++) data[i] = ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;

  const envelope = (g: GainNode, t: number, peak: number, decay: number) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  };
  const kick = (t: number) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.3);
    envelope(g, t, 1, 0.38);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + 0.4);
  };
  const hiss = (t: number, filter: BiquadFilterType, freq: number, peak: number, decay: number) => {
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noise;
    f.type = filter;
    f.frequency.value = freq;
    envelope(g, t, peak, decay);
    src.connect(f).connect(g).connect(master);
    src.start(t, Math.random() * 0.5); src.stop(t + decay + 0.02);
  };
  const tone = (t: number, freq: number, dur: number, type: OscillatorType, peak: number, cutoff = 4000) => {
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    envelope(g, t, peak, dur);
    o.connect(f).connect(g).connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  };

  const firstMove = song.introBeats, lastMove = song.totalBeats - 8;
  for (let b = 0; b < song.totalBeats; b++) {
    const t = b * beat;
    const bar = Math.floor(b / 4), chord = bar % 4, inBar = b % 4;
    const dancing = b >= firstMove && b < lastMove;
    // Busier arrangement in the second half of each 32-beat section.
    const lift = dancing && Math.floor((b - firstMove) / 16) % 2 === 1;

    kick(t);
    if (dancing && (inBar === 1 || inBar === 3)) {
      hiss(t, 'bandpass', 1800, 0.5, 0.18);
      tone(t, 190, 0.08, 'triangle', 0.25);
    }
    hiss(t + beat / 2, 'highpass', 7000, dancing ? 0.22 : 0.12, 0.05);
    if (dancing) hiss(t, 'highpass', 8000, 0.1, 0.03);

    // Offbeat bass.
    if (b >= 4) {
      tone(t + beat / 2, ROOTS[chord], beat * 0.45, 'sawtooth', 0.32, 600);
      if (lift) tone(t, ROOTS[chord] * 2, beat * 0.3, 'sawtooth', 0.16, 900);
    }
    // Chord stab on every bar's first beat and a softer one on the "and" of 2.
    if (inBar === 0) for (const f of CHORDS[chord]) tone(t, f, beat * 1.6, 'square', 0.05, 2200);
    if (dancing && inBar === 1) for (const f of CHORDS[chord]) tone(t + beat / 2, f, beat * 0.4, 'square', 0.035, 2600);
    // Arpeggio lead when the section lifts.
    if (lift) {
      for (let k = 0; k < 2; k++) tone(t + (k * beat) / 2, CHORDS[chord][ARP[(inBar * 2 + k) % 4]] * 2, beat * 0.4, 'triangle', 0.09, 5000);
    }
  }
  return ctx.startRendering();
}

/** The parts of AudioContext the player needs; tests pass a stand-in. */
export type AudioClock = Pick<AudioContext, 'state' | 'currentTime' | 'outputLatency' | 'destination' | 'createBufferSource'>;

/**
 * Plays a rendered song and reports the position the player actually hears.
 * iOS Safari keeps an AudioContext 'suspended' unless it was started inside a tap, which
 * freezes its clock. Then the song runs on the wall clock, silently, so the dance still moves.
 */
export class SongPlayer {
  private readonly ctx: AudioClock;
  private readonly now: () => number;
  private source: AudioBufferSourceNode | null = null;
  private startedAt = 0;
  private wallClock = false;

  constructor(ctx: AudioClock, now: () => number = () => performance.now()) {
    this.ctx = ctx;
    this.now = now;
  }

  /** Starts the song. Without a buffer (still rendering) or audio the clock runs silently, so the dance keeps its timing. */
  play(buffer: AudioBuffer | null): void {
    this.stop();
    this.wallClock = this.ctx.state !== 'running';
    // A short lead-in so the first beat isn't clipped while the node starts.
    this.startedAt = (this.wallClock ? this.now() / 1000 : this.ctx.currentTime) + 0.1;
    if (!buffer || this.wallClock) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.ctx.destination);
    src.start(this.startedAt);
    this.source = src;
  }

  stop(): void {
    this.source?.stop();
    this.source = null;
  }

  /** Song time in seconds, corrected for output latency when audio plays. Negative before the start. */
  time(): number {
    if (this.wallClock) return this.now() / 1000 - this.startedAt;
    return this.ctx.currentTime - this.startedAt - (this.ctx.outputLatency || 0);
  }
}
