import { songDuration, type Song } from '../dance/song.ts';
import type { Arrangement } from './arrangements.ts';
import { Kit } from './synth.ts';

const SAMPLE_RATE = 44100;

/** Renders a built-in song. Everything is synthesized: no samples and no recordings. Mono keeps memory low. */
export async function renderSong(song: Song, arrange: Arrangement): Promise<AudioBuffer> {
  const duration = songDuration(song) + 1;
  const ctx = new OfflineAudioContext(1, Math.ceil(duration * SAMPLE_RATE), SAMPLE_RATE);
  const master = ctx.createGain();
  master.gain.value = 0.55;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);
  arrange(new Kit(ctx, master, song));
  return ctx.startRendering();
}

/** Where the song's beat 0 sits in its audio, and when to fade out. Built-in songs start at 0 and end by themselves. */
export interface PlayOptions {
  /** Seconds into the buffer that line up with song time 0. */
  offset?: number;
  /** Song time at which the music fades out over FADE_S. */
  fadeAt?: number;
}

const FADE_S = 1.5;

/** The parts of AudioContext the player needs; tests pass a stand-in. */
export type AudioClock = Pick<AudioContext, 'state' | 'currentTime' | 'outputLatency' | 'destination' | 'createBufferSource' | 'createGain'>;

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
  play(buffer: AudioBuffer | null, { offset = 0, fadeAt }: PlayOptions = {}): void {
    this.stop();
    this.wallClock = this.ctx.state !== 'running';
    // A short lead-in so the first beat isn't clipped while the node starts.
    this.startedAt = (this.wallClock ? this.now() / 1000 : this.ctx.currentTime) + 0.1;
    if (!buffer || this.wallClock) return;
    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    src.buffer = buffer;
    if (fadeAt !== undefined) {
      gain.gain.setValueAtTime(1, this.startedAt + fadeAt);
      gain.gain.linearRampToValueAtTime(0, this.startedAt + fadeAt + FADE_S);
    }
    src.connect(gain).connect(this.ctx.destination);
    src.start(this.startedAt, offset);
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
