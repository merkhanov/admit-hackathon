import { describe, expect, it } from 'vitest';
import { NEUTRAL, SYNTH_ASPECT, seededRandom, synthPose, type SynthParams } from '../src/pose/synthetic.ts';
import { armsFitLimit, distanceProblem } from '../src/pose/gestures.ts';
import { features, type Features } from '../src/pose/features.ts';
import { calibration, initTracker, recalibrate, stepTracker, type Hint, type TrackerEvent, type TrackerState } from '../src/pose/tracker.ts';

const FRAME_MS = 33;

/** Drives the tracker with a pose held for `ms`, like a player holding still. */
class Player {
  state: TrackerState = initTracker();
  t = 0;
  events: TrackerEvent[] = [];
  lastHints: Hint[] = [];
  /** Every distinct fix-hint text seen during the last `hold` call. */
  seenFixes: string[] = [];
  private readonly noise: number;
  private readonly random: () => number;

  constructor(noise = 0, seed = 1) {
    this.noise = noise;
    this.random = seededRandom(seed);
  }

  hold(pose: Partial<SynthParams>, ms: number): this {
    this.seenFixes = [];
    for (let elapsed = 0; elapsed < ms; elapsed += FRAME_MS) {
      this.t += FRAME_MS;
      const out = stepTracker(this.state, synthPose({ ...NEUTRAL, ...pose }, this.noise, this.random), this.t, SYNTH_ASPECT);
      this.state = out.state;
      this.events.push(...out.events);
      this.lastHints = out.hints;
      for (const h of out.hints) if (h.kind === 'fix' && !this.seenFixes.includes(h.text)) this.seenFixes.push(h.text);
    }
    return this;
  }

  calibrated(): this {
    this.hold({}, 1200);
    this.events = [];
    return this;
  }

  fixHint(): string | undefined {
    const h = this.lastHints.find((x) => x.kind === 'fix');
    return h?.text;
  }
}

const ARM_UP = { rUp: 1.3, rOut: 0.2 };
const ARM_HALF = { rUp: 0.5, rOut: 0.3 };

describe('calibration', () => {
  it('waits for lowered arms, then remembers the neutral pose', () => {
    const p = new Player().hold(ARM_UP, 600);
    expect(p.lastHints[0]).toMatchObject({ kind: 'calib', text: expect.stringContaining('Опусти руки') });
    p.hold({}, 1200);
    expect(p.events).toContain('calibrated');
    expect(p.state.stage.kind).toBe('tracking');
  });

  it('asks to move back when the player is too close, and freezes gestures', () => {
    const p = new Player().calibrated().hold({ sw: 0.85, sy: 0.6 }, 300);
    expect(p.lastHints[0]).toMatchObject({ kind: 'frame', text: expect.stringContaining('слишком близко') });
  });

  it('reports a head out of frame', () => {
    const p = new Player().calibrated().hold({ vis: 0.2 }, 300);
    expect(p.lastHints[0]).toMatchObject({ kind: 'frame', text: expect.stringContaining('Голову и плечи не видно') });
  });

  it('recalibrate forgets the old baseline and learns the new one', () => {
    const p = new Player().calibrated();
    const before = calibration(p.state);
    p.state = recalibrate(p.state);
    expect(p.state.stage.kind).toBe('calibrating');
    p.hold({ drop: 0.3 }, 1300);
    const after = calibration(p.state);
    expect(before && after && after.midY > before.midY).toBe(true);
  });
});

describe('hand above the head (start and restart)', () => {
  it('a normal jump fires once and never shows the "higher" hint', () => {
    const p = new Player().calibrated();
    p.hold(ARM_HALF, 150).hold(ARM_UP, 500).hold(ARM_HALF, 150).hold({}, 500);
    expect(p.events).toEqual(['jump']);
    expect(p.seenFixes).toEqual([]);
  });

  it('a stuck half-raised arm gets a concrete hint after the hold time', () => {
    const p = new Player().calibrated().hold(ARM_HALF, 300);
    expect(p.fixHint()).toBeUndefined();
    p.hold(ARM_HALF, 300);
    expect(p.fixHint()).toBe('Подними правую руку над головой, чтобы начать');
    p.hold(ARM_UP, 300);
    expect(p.events).toEqual(['jump']);
    expect(p.fixHint()).toBeUndefined();
  });

  it('holding the arm up fires one jump; a second needs lowering it first', () => {
    const p = new Player().calibrated().hold(ARM_UP, 2000);
    expect(p.events).toEqual(['jump']);
    p.hold({}, 800).hold(ARM_UP, 400);
    expect(p.events).toEqual(['jump', 'jump']);
  });

  it('stays quiet while the arm comes down after a jump', () => {
    const p = new Player().calibrated().hold(ARM_UP, 400).hold(ARM_HALF, 400);
    expect(p.fixHint()).toBeUndefined();
    p.hold(ARM_HALF, 500);
    expect(p.fixHint()).toContain('над головой');
  });
});

describe('distance to the camera', () => {
  it('calibration asks to step back until arms spread sideways fit in the frame', () => {
    const p = new Player().hold({ sw: 0.6, sy: 0.5 }, 1500);
    expect(p.state.stage.kind).toBe('calibrating');
    expect(p.lastHints[0]).toMatchObject({ kind: 'calib', text: expect.stringContaining('Отойди назад') });
    p.hold({ sw: 0.28 }, 1200);
    expect(p.events).toContain('calibrated');
  });

  it('at the calibration limit, arms spread sideways stay inside the frame', () => {
    const lm = synthPose({ ...NEUTRAL, sw: 0.3, rUp: 0, rOut: 1.6, lUp: 0, lOut: 1.6 });
    for (const i of [15, 16]) expect(lm[i].x).toBeGreaterThanOrEqual(0);
    for (const i of [15, 16]) expect(lm[i].x).toBeLessThanOrEqual(1);
  });
});

describe('camera jitter', () => {
  // About 1% of the frame, several pixels on a 640x480 camera.
  const NOISE = 0.01;

  it('a held near-miss still produces a steady hint', () => {
    const p = new Player(NOISE, 7).calibrated().hold(ARM_HALF, 900);
    expect(p.fixHint()).toContain('над головой');
  });

  it('a normal jump still shows no hint and fires once', () => {
    const p = new Player(NOISE, 11).calibrated();
    p.hold(ARM_HALF, 150).hold(ARM_UP, 500).hold(ARM_HALF, 150).hold({}, 600);
    expect(p.events).toEqual(['jump']);
    expect(p.seenFixes).toEqual([]);
  });

  it('standing still produces no gestures and no hints', () => {
    const p = new Player(NOISE, 3).calibrated().hold({}, 3000);
    expect(p.events).toEqual([]);
    expect(p.seenFixes).toEqual([]);
  });
});

describe('distance during calibration', () => {
  const at = (sw: number) => ({ present: true, sw, aspect: SYNTH_ASPECT }) as unknown as Features;

  it('asks to step back when spread arms would leave the frame', () => {
    expect(distanceProblem(at(armsFitLimit(SYNTH_ASPECT) + 0.01))).toBe('close');
    expect(distanceProblem(at(0.85))).toBe('close');
  });

  it('asks to come closer when the body is tiny, and is quiet in between', () => {
    expect(distanceProblem(at(0.05))).toBe('far');
    expect(distanceProblem(at(Math.min(0.2, armsFitLimit(SYNTH_ASPECT) - 0.01)))).toBeNull();
  });
});

describe('a wrist the model is unsure about', () => {
  const withWrist = (v: number, x?: number) => {
    const lm = synthPose({ ...NEUTRAL, ...{ rUp: 1, rOut: 1 } });
    lm[16] = { ...lm[16], visibility: v, ...(x === undefined ? {} : { x }) };
    const f = features(lm, SYNTH_ASPECT);
    if (!f.present) throw new Error('visible');
    return f.arms.R.ok;
  };

  it('counts inside the frame at 0.3 or more, as the light model often rates a wrist it placed right', () => {
    expect(withWrist(0.9)).toBe(true);
    expect(withWrist(0.35)).toBe(true);
    expect(withWrist(0.25)).toBe(false);
  });

  it('outside the frame a doubtful wrist is a guess and does not count', () => {
    expect(withWrist(0.35, -0.05)).toBe(false);
    expect(withWrist(0.6, -0.05)).toBe(true);
  });
});
