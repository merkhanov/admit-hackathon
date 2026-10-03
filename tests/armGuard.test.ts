import { describe, expect, it } from 'vitest';
import { guardArms, LOST_AFTER_MS, type ArmGuard } from '../src/pose/armGuard.ts';
import { features, seen, type ArmFeatures, type Side } from '../src/pose/features.ts';
import type { Landmark } from '../src/pose/landmarks.ts';
import { NEUTRAL, SYNTH_ASPECT, synthPose, type SynthParams } from '../src/pose/synthetic.ts';
import { initTracker, stepTracker, type TrackerOutput } from '../src/pose/tracker.ts';

const FRAME_MS = 33;

/** Feeds the tracker one synthetic camera frame at a time; `edit` plays the model's mistake on the raw landmarks. */
class Feed {
  state = initTracker();
  t = 0;
  out!: TrackerOutput;

  hold(p: Partial<SynthParams>, ms: number, edit?: (lm: Landmark[]) => void): this {
    for (let elapsed = 0; elapsed < ms; elapsed += FRAME_MS) this.frame(p, edit);
    return this;
  }

  frame(p: Partial<SynthParams>, edit?: (lm: Landmark[]) => void): this {
    const lm = synthPose({ ...NEUTRAL, ...p });
    edit?.(lm);
    this.t += FRAME_MS;
    this.out = stepTracker(this.state, lm, this.t, SYNTH_ASPECT);
    this.state = this.out.state;
    return this;
  }

  arm(s: Side): ArmFeatures {
    const f = this.out.features;
    if (!f.present) throw new Error('nobody in frame');
    return f.arms[s];
  }
}

const swapLabels = (lm: Landmark[]) => {
  for (const [l, r] of [[13, 14], [15, 16]]) [lm[l], lm[r]] = [lm[r], lm[l]];
};
/** Right arm up, left arm out to the side: the two arms are easy to tell apart. */
const ASYM = { rUp: 1.3, rOut: 0.2, lUp: 0, lOut: 1.4 };

describe('left and right arms keep their labels', () => {
  it('a one-frame swap of the arm labels is undone', () => {
    const f = new Feed().hold(ASYM, 600).frame(ASYM, swapLabels);
    expect(f.arm('R').raise).toBeGreaterThan(1);
    expect(f.arm('L').out).toBeGreaterThan(1);
  });

  it('a swap that lasts several frames stays undone, and each arm stays on its own shoulder', () => {
    const f = new Feed().hold(ASYM, 600).hold(ASYM, 300, swapLabels);
    expect(f.arm('R').raise).toBeGreaterThan(1.1);
    expect(f.arm('L').raise).toBeCloseTo(0, 0);
    expect(f.arm('L').out).toBeGreaterThan(1.2);
  });

  it('labels the model keeps past one beat win, so a wrong correction cannot stick', () => {
    const f = new Feed().hold(ASYM, 600).hold(ASYM, 800, swapLabels);
    expect(f.arm('L').raise).toBeGreaterThan(1);
  });

  it('arms crossing in front of the body are not mistaken for a swap', () => {
    const f = new Feed().hold({ lUp: 0.3, lOut: 1, rUp: -0.3, rOut: 1 }, 500);
    const steps = 20;
    for (let k = 1; k <= steps; k++) {
      const out = 1 - (1.9 * k) / steps;
      f.frame({ lUp: 0.3, lOut: out, rUp: -0.3, rOut: out });
    }
    f.hold({ lUp: 0.3, lOut: -0.9, rUp: -0.3, rOut: -0.9 }, 300);
    expect(f.arm('L').out).toBeLessThan(-0.5);
    expect(f.arm('R').out).toBeLessThan(-0.5);
    expect(f.arm('L').raise).toBeGreaterThan(f.arm('R').raise);
  });
});

describe('a wrist the body could not have moved there', () => {
  const R_UP = { rUp: 1.3, rOut: 0.2 };

  it('ignores a one-frame jump across the frame', () => {
    const f = new Feed().hold(R_UP, 600).frame(R_UP, (lm) => { lm[16] = { x: 0.2, y: 0.9, visibility: 0.95 }; });
    expect(f.arm('R').raise).toBeGreaterThan(1);
  });

  it('still follows a real fast move within a few frames', () => {
    const f = new Feed().hold(R_UP, 600).hold({}, LOST_AFTER_MS);
    expect(f.arm('R').raise).toBeLessThan(-1);
  });

  it('never draws a wrist detached from its elbow', () => {
    const SIDE = { rUp: 0, rOut: 1.4 };
    const f = new Feed().hold(SIDE, 600);
    f.hold(SIDE, 600, (lm) => { lm[16] = { x: lm[14].x, y: lm[14].y + 2.4 * NEUTRAL.sw, visibility: 0.95 }; });
    const pose = f.out.pose!;
    const forearm = Math.hypot((pose[16].x - pose[14].x) * SYNTH_ASPECT, pose[16].y - pose[14].y) / NEUTRAL.sw;
    expect(forearm).toBeLessThan(1.4);
    expect(f.arm('R').ok).toBe(false);
  });
});

describe('an arm hidden from the camera', () => {
  const SIDE = { rUp: 0, rOut: 1.4 };
  // The model still returns a wrist, with low visibility, somewhere it guessed.
  const hidden = (lm: Landmark[]) => { lm[16] = { x: 0.45, y: 0.75, visibility: 0.1 }; };

  it('holds its last place briefly, so a passing occlusion is not a lost arm', () => {
    const f = new Feed().hold(SIDE, 600).hold(SIDE, LOST_AFTER_MS - 2 * FRAME_MS, hidden);
    expect(f.arm('R').ok).toBe(true);
    expect(f.arm('R').out).toBeGreaterThan(1.2);
  });

  it('then is reported lost, without moving to where the model guessed', () => {
    const f = new Feed().hold(SIDE, 600).hold(SIDE, 600, hidden);
    expect(f.arm('R').ok).toBe(false);
    expect(seen(f.out.pose![16])).toBe(false);
    expect(f.arm('R').out).toBeGreaterThan(1.2);
  });

  it('is followed again as soon as it comes back', () => {
    const f = new Feed().hold(SIDE, 600).hold(SIDE, 600, hidden).hold({ rUp: 1.3, rOut: 0.2 }, 300);
    expect(f.arm('R').ok).toBe(true);
    expect(f.arm('R').raise).toBeGreaterThan(1);
  });
});

describe('review regressions', () => {
  it('a hand raised above the frame, then lowered out of sight, is reported lost', () => {
    const HIGH = { sy: 0.2, rUp: 1.6, rOut: 0 };
    const f = new Feed().hold(HIGH, 600);
    expect(f.arm('R').ok).toBe(true);
    f.hold(HIGH, 600, (lm) => { lm[16] = { x: lm[12].x, y: 0.5, visibility: 0.1 }; });
    expect(f.arm('R').ok).toBe(false);
  });

  it('a clearly seen wrist is followed while the model is unsure of its elbow', () => {
    const f = new Feed().hold({ rUp: 0, rOut: 1.4 }, 600);
    const steps = 15;
    for (let k = 1; k <= steps; k++) {
      f.frame({ rUp: (1.4 * k) / steps, rOut: 1.4 - (2 * k) / steps }, (lm) => { lm[14] = { ...lm[14], visibility: 0.1 }; });
    }
    f.hold({ rUp: 1.4, rOut: -0.6 }, 300, (lm) => { lm[14] = { ...lm[14], visibility: 0.1 }; });
    expect(f.arm('R').ok).toBe(true);
    expect(f.arm('R').raise).toBeGreaterThan(1.2);
  });

  it('after the tab was in the background, a stale heading cannot swap the arms', () => {
    // Hands closing in, as for a clap; then no frames for two seconds, and they stopped where they were.
    // Projected over two seconds, each hand's old heading lands on the other one.
    const closing = (k: number) => synthPose({ ...NEUTRAL, lUp: 0, lOut: 1.4 - 0.04 * k, rUp: 0.3, rOut: 1.4 - 0.04 * k });
    let g: ArmGuard | null = null, t = 0;
    for (let k = 0; k <= 15; k++) g = guardArms(g, closing(k), (t += FRAME_MS), SYNTH_ASPECT, null).guard;
    const raw = closing(15);
    const { pose } = guardArms(g, raw, t + 2000, SYNTH_ASPECT, null);
    expect(pose![15]).toEqual(raw[15]);
    expect(pose![16]).toEqual(raw[16]);
  });
});

describe('the guard is invisible on a clean camera', () => {
  it('matches the raw pose when nothing is wrong', () => {
    const f = new Feed().hold(ASYM, 1000);
    const raw = features(synthPose({ ...NEUTRAL, ...ASYM }), SYNTH_ASPECT);
    if (!raw.present) throw new Error('visible');
    expect(f.arm('R').raise).toBeCloseTo(raw.arms.R.raise, 2);
    expect(f.arm('L').out).toBeCloseTo(raw.arms.L.out, 2);
  });
});
