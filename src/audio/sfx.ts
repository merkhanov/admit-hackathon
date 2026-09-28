export type Sound = 'jump' | 'punch' | 'smash' | 'coin' | 'clear' | 'hit' | 'lane' | 'step' | 'tick' | 'go' | 'hint' | 'over' | 'record';

interface Tone {
  freq: number;
  to?: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
}

const SOUNDS: Record<Sound, Tone[]> = {
  jump: [{ freq: 320, to: 720, dur: 0.16, type: 'square', gain: 0.08 }],
  punch: [{ freq: 180, to: 60, dur: 0.12, type: 'sawtooth', gain: 0.1 }],
  smash: [{ freq: 140, to: 40, dur: 0.25, type: 'square', gain: 0.14 }, { freq: 900, to: 200, dur: 0.15, type: 'triangle', gain: 0.08 }],
  coin: [{ freq: 988, dur: 0.07, type: 'square', gain: 0.06 }, { freq: 1319, dur: 0.12, type: 'square', gain: 0.06, delay: 0.07 }],
  clear: [{ freq: 660, dur: 0.08, type: 'triangle', gain: 0.1 }, { freq: 880, dur: 0.12, type: 'triangle', gain: 0.1, delay: 0.08 }],
  hit: [{ freq: 110, to: 45, dur: 0.35, type: 'sawtooth', gain: 0.18 }],
  lane: [{ freq: 440, to: 520, dur: 0.06, type: 'triangle', gain: 0.06 }],
  step: [{ freq: 523, dur: 0.1, type: 'triangle', gain: 0.1 }, { freq: 659, dur: 0.1, type: 'triangle', gain: 0.1, delay: 0.1 }, { freq: 784, dur: 0.18, type: 'triangle', gain: 0.1, delay: 0.2 }],
  tick: [{ freq: 600, dur: 0.1, type: 'square', gain: 0.07 }],
  go: [{ freq: 900, dur: 0.3, type: 'square', gain: 0.08 }],
  hint: [{ freq: 330, dur: 0.12, type: 'sine', gain: 0.07 }, { freq: 294, dur: 0.14, type: 'sine', gain: 0.07, delay: 0.12 }],
  over: [{ freq: 392, dur: 0.2, type: 'triangle', gain: 0.1 }, { freq: 330, dur: 0.2, type: 'triangle', gain: 0.1, delay: 0.2 }, { freq: 262, dur: 0.4, type: 'triangle', gain: 0.1, delay: 0.4 }],
  record: [523, 659, 784, 1047].map((freq, i) => ({ freq, dur: 0.14, type: 'square' as const, gain: 0.07, delay: i * 0.11 })),
};

/** Synthesized sound effects. No audio files, nothing to download. */
export class Sfx {
  private ctx: AudioContext | null = null;

  /** Browsers only allow audio after a user gesture, so call this from the start click. */
  unlock(): void {
    this.ctx ??= new AudioContext();
    void this.ctx.resume();
  }

  play(sound: Sound): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const tone of SOUNDS[sound]) {
      const start = now + (tone.delay ?? 0);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = tone.type ?? 'sine';
      osc.frequency.setValueAtTime(tone.freq, start);
      if (tone.to) osc.frequency.exponentialRampToValueAtTime(tone.to, start + tone.dur);
      gain.gain.setValueAtTime(tone.gain ?? 0.1, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + tone.dur + 0.02);
    }
  }
}
