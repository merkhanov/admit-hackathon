import { describe, expect, it } from 'vitest';
import { MOVES, type MoveTarget } from '../src/dance/moves.ts';
import { CoachMotion } from '../src/stage/coach.ts';
import { keepPose, poseAtTime, type PoseSample } from '../src/multiplayer/pose.ts';

const FPS = 60, DT = 1 / FPS;
const arm = (dir: number): MoveTarget => ({ name: '', arms: { L: { dir, elbow: 180 }, R: { dir, elbow: 180 } }, tilt: 0, squat: false });

/** The coach's left arm direction each frame (degrees), for a target given per frame. */
function follow(targetAt: (t: number) => MoveTarget | null, seconds: number): number[] {
  const m = new CoachMotion();
  const out: number[] = [];
  for (let i = 0; i < seconds * FPS; i++) out.push(m.step(targetAt(i * DT), 0, DT).dir.L);
  return out;
}

/** Biggest change of speed between two frames (degrees a second, per frame). */
function biggestKick(dirs: number[]): number {
  let worst = 0;
  for (let i = 2; i < dirs.length; i++) worst = Math.max(worst, Math.abs((dirs[i] - dirs[i - 1]) - (dirs[i - 1] - dirs[i - 2])) * FPS);
  return worst;
}

describe('the coach moves like a person, not a stiff branch', () => {
  it('gathers speed when the move changes instead of leaping to full speed', () => {
    // Arms down, then out to the side: the old easing went from still to 960°/s in one frame.
    const dirs = follow((t) => (t < 0.5 ? arm(10) : arm(90)), 1.5);
    expect(biggestKick(dirs)).toBeLessThan(400);
    expect(dirs[dirs.length - 1]).toBeCloseTo(90, 0);
  });

  it('lets the forearm trail the swing and catch up once the arm stops', () => {
    const m = new CoachMotion();
    for (let i = 0; i < 30; i++) m.step(arm(10), 0, DT);
    let trailed = 0;
    for (let i = 0; i < 12; i++) trailed = Math.min(trailed, m.step(arm(170), 0, DT).bend.L);
    // Swinging up, the forearm lags below the upper arm: the elbow gives.
    expect(trailed).toBeLessThan(-10);
    for (let i = 0; i < 120; i++) m.step(arm(170), 0, DT);
    // Held still, the arm is exactly the move again.
    expect(m.pose.bend.L).toBeCloseTo(0, 1);
    expect(m.pose.dir.L).toBeCloseTo(170, 1);
  });
});

describe("a friend's avatar", () => {
  it('moves at an even speed between poses that arrive 15 times a second, a little late or early', () => {
    // The friend swings an arm steadily at 120°/s, from across the body to up; packets come every
    // 66 ms, give or take 20 ms.
    const recent: PoseSample[][] = [[]];
    let next = 0, k = 0;
    const m = new CoachMotion();
    const speeds: number[] = [];
    let prev: number | null = null;
    for (let i = 0; i < 1.6 * FPS; i++) {
      const now = i * DT * 1000;
      while (next <= now) {
        const sentAt = k * 66;
        recent[0] = keepPose(recent[0], { pose: [Math.round(-80 + sentAt * 0.12), 180, 0, 180, 0, 0], at: next });
        k++;
        next = k * 66 + (k % 3 === 0 ? 20 : k % 3 === 1 ? -15 : 0);
      }
      const dir = m.step(poseAtTime(recent[0], now), 0, DT).dir.L;
      if (prev !== null && i > 0.6 * FPS) speeds.push((dir - prev) * FPS);
      prev = dir;
    }
    const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    // Steady: no frame much faster or slower than the swing itself.
    expect(mean).toBeGreaterThan(100);
    for (const v of speeds) expect(Math.abs(v - mean)).toBeLessThan(0.35 * mean);
  });

  it('holds the newest pose through a gap instead of guessing where the arm went', () => {
    const recent = keepPose(keepPose([], { pose: [10, 180, 10, 180, 0, 0], at: 0 }), { pose: [90, 180, 90, 180, 0, 0], at: 66 });
    expect(poseAtTime(recent, 2000)?.arms.L.dir).toBe(90);
  });

  it('is drawn between the two poses either side of the moment shown', () => {
    const recent = keepPose(keepPose([], { pose: [10, 180, 10, 180, 0, 0], at: 0 }), { pose: [90, 180, 90, 180, 0, 0], at: 100 });
    // 120 ms in the past from 170 ms is 50 ms: halfway.
    expect(poseAtTime(recent, 170)?.arms.L.dir).toBeCloseTo(50);
  });
});

it('keeps MOVES untouched by the trail', () => {
  expect(MOVES.up.arms.L.dir).toBe(180);
});
