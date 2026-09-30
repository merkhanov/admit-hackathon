import { describe, expect, it } from 'vitest';
import { detectBeat } from '../src/audio/beat.ts';
import { seededRandom } from '../src/pose/synthetic.ts';

const RATE = 22050;

/**
 * A drum loop like a pop song: kick on every beat, a quieter hi-hat on the offbeats,
 * a little noise, and `lead` seconds of silence before the music starts.
 */
function drumLoop(bpm: number, seconds: number, lead: number): Float32Array {
  const random = seededRandom(3);
  const out = new Float32Array(Math.round(seconds * RATE));
  const beat = 60 / bpm;
  for (let i = 0; i < out.length; i++) out[i] = (random() * 2 - 1) * 0.01;
  const hit = (t: number, freq: number, amp: number, decay: number, noisy: boolean) => {
    const start = Math.round(t * RATE);
    for (let j = 0; j < decay * RATE && start + j < out.length; j++) {
      const env = Math.exp(-j / (decay * RATE * 0.25));
      const x = noisy ? random() * 2 - 1 : Math.sin((2 * Math.PI * freq * j) / RATE);
      out[start + j] += amp * env * x;
    }
  };
  for (let t = lead; t < seconds; t += beat) {
    hit(t, 60, 0.8, 0.25, false);
    hit(t + beat / 2, 0, 0.15, 0.05, true);
  }
  return out;
}

describe('beat detection', () => {
  it.each([[96, 0.37], [118, 1.2], [128, 0.05], [150, 2.5]])('finds %i BPM and the first beat at %f s', (bpm, lead) => {
    const grid = detectBeat(drumLoop(bpm, 40, lead), RATE);
    expect(grid.bpm).toBeCloseTo(bpm, 0);
    expect(Math.abs(grid.firstBeat - lead)).toBeLessThan(0.03);
    expect(grid.confidence).toBeGreaterThan(1.3);
  });

  it('keeps the beat for a whole minute: less than 50 ms of drift at the end', () => {
    const bpm = 123.4;
    const grid = detectBeat(drumLoop(bpm, 70, 0.5), RATE);
    const beats = Math.floor((70 - 0.5) / (60 / bpm)) - 1;
    const drift = beats * (60 / grid.bpm - 60 / bpm);
    expect(Math.abs(drift)).toBeLessThan(0.05);
  });

  it('gives low confidence for noise without a beat', () => {
    const random = seededRandom(9);
    const noise = Float32Array.from({ length: 20 * RATE }, () => random() * 2 - 1);
    expect(detectBeat(noise, RATE).confidence).toBeLessThan(1.3);
  });
});
