import { describe, expect, it } from 'vitest';
import { NEUTRAL, SYNTH_ASPECT, seededRandom, synthPose, type SynthParams } from '../src/pose/synthetic.ts';
import { initTracker, recalibrate, stepTracker, type Hint, type TrackerEvent, type TrackerState } from '../src/pose/tracker.ts';

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
    expect(p.lastHints[0]).toMatchObject({ kind: 'frame', text: expect.stringContaining('Слишком близко') });
  });

  it('reports a head out of frame', () => {
    const p = new Player().calibrated().hold({ vis: 0.2 }, 300);
    expect(p.lastHints[0]).toMatchObject({ kind: 'frame', text: expect.stringContaining('Не видно головы') });
  });

  it('recalibrate forgets the old baseline', () => {
    const p = new Player().calibrated().hold({ drop: 0.3 }, 1000);
    expect(p.fixHint()).toContain('Присядь ниже');
    p.state = recalibrate(p.state);
    p.hold({ drop: 0.3 }, 1300);
    expect(p.fixHint()).toBeUndefined();
    expect(p.state.stage.kind).toBe('tracking');
  });
});

describe('jump', () => {
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
    expect(p.fixHint()).toMatch(/Подними правую руку выше головы.*не хватает ≈\d+ см/);
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
    expect(p.fixHint()).toContain('выше головы');
  });
});

describe('lean', () => {
  it('maps the player\'s own left to leanL and fires once per lean', () => {
    const p = new Player().calibrated().hold({ tilt: 20 }, 1400).hold({}, 400).hold({ tilt: -20 }, 400);
    expect(p.events).toEqual(['leanL', 'leanR']);
  });

  it('a weak lean gets a hint with degrees', () => {
    const p = new Player().calibrated().hold({ tilt: 9 }, 600);
    expect(p.fixHint()).toBe('Наклонись сильнее влево: сейчас 9°, нужно 14°');
  });

  it('does not count a lean while an arm is raised', () => {
    const p = new Player().calibrated().hold({ ...ARM_UP, tilt: 15 }, 500);
    expect(p.events).toEqual(['jump']);
  });
});

describe('punch', () => {
  it('names the exact problem: bent elbow, then height', () => {
    const p = new Player().calibrated().hold({ rUp: 0, rOut: 1.0 }, 600);
    expect(p.fixHint()).toMatch(/Выпрями правый локоть: рука согнута на \d+°/);
    p.hold({ rUp: 0, rOut: 1.6 }, 300);
    expect(p.events).toEqual(['punch']);
    p.hold({}, 800).hold({ rUp: 0.7, rOut: 1.35 }, 600);
    expect(p.fixHint()).toMatch(/Опусти правую руку до уровня плеча/);
  });
});

describe('duck', () => {
  it('emits start and end around a held squat', () => {
    const p = new Player().calibrated().hold({ drop: 0.6 }, 800).hold({}, 400);
    expect(p.events).toEqual(['duckStart', 'duckEnd']);
  });
});

describe('camera jitter', () => {
  // About 1% of the frame, several pixels on a 640x480 camera.
  const NOISE = 0.01;

  it('a held near-miss still produces a steady hint', () => {
    const p = new Player(NOISE, 7).calibrated().hold(ARM_HALF, 900);
    expect(p.fixHint()).toContain('выше головы');
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
