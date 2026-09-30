/**
 * Tempo and beat grid of a song file, so the player can dance to their own music.
 * Pure: takes mono samples, no Web Audio. Tuned for pop and dance music with a steady beat.
 */

export interface BeatGrid {
  bpm: number;
  /** Seconds from the start of the audio to the first beat of the grid where the music is playing. */
  firstBeat: number;
  /** How much the beat stands out: peak comb score over the average. Below ~1.3 the grid is a guess. */
  confidence: number;
}

/** Onset envelope rate: about 86 frames per second. */
const ENVELOPE_HZ = 86;
export const MIN_BPM = 70;
export const MAX_BPM = 180;

/** Loudness rise per frame: where drums and notes start. */
export function onsetEnvelope(samples: Float32Array, rate: number): { onset: Float32Array; rms: Float32Array; fps: number } {
  const hop = Math.max(1, Math.round(rate / ENVELOPE_HZ));
  const fps = rate / hop;
  const n = Math.floor(samples.length / hop);
  const onset = new Float32Array(n), rms = new Float32Array(n);
  // One-pole low-pass at ~150 Hz picks out kick drums and bass, which carry the beat in most pop.
  const a = Math.exp((-2 * Math.PI * 150) / rate);
  let low = 0, prevLow = 0, prevFull = 0;
  for (let i = 0; i < n; i++) {
    let eLow = 0, eFull = 0;
    for (let j = i * hop, end = j + hop; j < end; j++) {
      const x = samples[j];
      low = (1 - a) * x + a * low;
      eLow += low * low;
      eFull += x * x;
    }
    const lLow = Math.log1p(1000 * eLow / hop), lFull = Math.log1p(1000 * eFull / hop);
    rms[i] = Math.sqrt(eFull / hop);
    onset[i] = i === 0 ? 0 : 1.5 * Math.max(0, lLow - prevLow) + Math.max(0, lFull - prevFull);
    prevLow = lLow;
    prevFull = lFull;
  }
  // Subtract a running mean so sustained loudness doesn't look like beats.
  const w = Math.round(fps * 0.4);
  const out = new Float32Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += onset[i];
    if (i >= w) sum -= onset[i - w];
    out[i] = Math.max(0, onset[i] - sum / Math.min(i + 1, w));
  }
  return { onset: out, rms, fps };
}

/** Linear interpolation into the envelope at a fractional frame. */
function at(env: Float32Array, x: number): number {
  const i = Math.floor(x);
  if (i < 0 || i + 1 >= env.length) return 0;
  const f = x - i;
  return env[i] * (1 - f) + env[i + 1] * f;
}

/** Best phase of a beat period and how well a comb of that period lines up with the onsets. */
function comb(env: Float32Array, period: number): { score: number; phase: number } {
  const steps = 48;
  let best = { score: -1, phase: 0 };
  for (let s = 0; s < steps; s++) {
    const phase = (s / steps) * period;
    let sum = 0, count = 0;
    for (let x = phase; x < env.length - 1; x += period) {
      sum += at(env, x);
      count++;
    }
    const score = count ? sum / count : 0;
    if (score > best.score) best = { score, phase };
  }
  return best;
}

/** Tempo preference: people count most songs between 90 and 140 BPM. */
const prior = (bpm: number) => Math.exp(-0.5 * (Math.log2(bpm / 118) / 0.9) ** 2);

/** Autocorrelation of the envelope at a lag in frames, normalised by the overlap. */
function autocorr(env: Float32Array, lag: number): number {
  let sum = 0;
  const n = env.length - lag;
  for (let i = 0; i < n; i++) sum += env[i] * env[i + lag];
  return n > 0 ? sum / n : 0;
}

/** Light blur so a comb that is a frame off still scores. */
function smooth(env: Float32Array): Float32Array {
  const out = new Float32Array(env.length);
  for (let i = 0; i < env.length; i++) {
    out[i] = 0.4 * env[i] + 0.2 * ((env[i - 1] ?? 0) + (env[i + 1] ?? 0)) + 0.1 * ((env[i - 2] ?? 0) + (env[i + 2] ?? 0));
  }
  return out;
}

export function detectBeat(samples: Float32Array, rate: number): BeatGrid {
  const { onset, rms, fps } = onsetEnvelope(samples, rate);
  // Coarse tempo from autocorrelation, which doesn't care about drift across the song.
  // A beat also repeats at two and four beats, so those lags add to its score.
  const minLag = Math.floor((60 * fps) / MAX_BPM), maxLag = Math.ceil((60 * fps) / MIN_BPM);
  const env = smooth(onset);
  const ac = new Float32Array(maxLag * 4 + 1);
  for (let lag = 1; lag < ac.length && lag < env.length; lag++) ac[lag] = autocorr(env, lag);
  const scoreAt = (lag: number) => ac[lag] + 0.5 * ac[lag * 2] + 0.25 * ac[lag * 4];
  const scores: number[] = [];
  let bestLag = minLag, bestScore = -1;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const score = scoreAt(lag) * prior((60 * fps) / lag);
    scores.push(score);
    if (score > bestScore) { bestScore = score; bestLag = lag; }
  }
  const meanScore = scores.reduce((a, b) => a + b, 0) / scores.length || 1;
  // Fine tempo and phase: slide a comb over the whole song around the coarse tempo.
  const coarse = (60 * fps) / bestLag;
  let best = { bpm: coarse, score: -1, phase: 0 };
  for (let bpm = coarse * 0.97; bpm <= coarse * 1.03; bpm += 0.02) {
    const c = comb(env, (60 * fps) / bpm);
    if (c.score > best.score) best = { bpm, score: c.score, phase: c.phase };
  }
  // First beat once the music has started: skip leading silence.
  let peak = 0;
  for (const v of rms) peak = Math.max(peak, v);
  let start = 0;
  while (start < rms.length && rms[start] < peak * 0.1) start++;
  const period = (60 * fps) / best.bpm;
  let beat = best.phase;
  while (beat < start - period * 0.25) beat += period;
  return { bpm: best.bpm, firstBeat: beat / fps, confidence: bestScore / meanScore };
}
