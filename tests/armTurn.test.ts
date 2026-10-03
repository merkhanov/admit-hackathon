import { describe, expect, it } from 'vitest';
import { MOVES, armTurn, wrapDir } from '../src/dance/moves.ts';
import { blendPose } from '../src/dance/motion.ts';
import { CoachMotion } from '../src/stage/coach.ts';

describe('armTurn', () => {
  it('brings a raised arm down past the side to a low arm across the body, not over the head', () => {
    // Straight up (157°) to low across the body (-35°): down through 90° and 0°, a turn of -192°.
    expect(armTurn(157, -35)).toBe(-192);
  });

  it('goes over the head between two raised arms, the short way', () => {
    expect(armTurn(170, -150)).toBe(40);
    expect(armTurn(-150, 170)).toBe(-40);
  });

  it('takes the plain way between low arms', () => {
    expect(armTurn(30, -35)).toBe(-65);
  });
});

describe('wrapDir', () => {
  it('keeps directions in (-180, 180]', () => {
    expect(wrapDir(180)).toBe(180);
    expect(wrapDir(-180)).toBe(180);
    expect(wrapDir(470)).toBe(110);
    expect(wrapDir(-200)).toBe(160);
  });
});

describe('blending and easing an arm from up to across the body', () => {
  it('passes the side on the way, never the top of the head', () => {
    const mid = blendPose(MOVES.up, MOVES.discoL, 0.5);
    // discoL has the right arm at -35°: halfway from 180° the plain way is 72.5°, beside the body.
    expect(mid.arms.R.dir).toBeCloseTo(72.5);
  });

  it("keeps the coach's angle in range, so a lowered arm never reads as raised", () => {
    const m = new CoachMotion();
    for (let i = 0; i < 60; i++) m.step(MOVES.up, 0, 1 / 60);
    for (let i = 0; i < 120; i++) {
      const p = m.step(MOVES.discoL, 0, 1 / 60);
      expect(p.dir.R).toBeGreaterThan(-180);
      expect(p.dir.R).toBeLessThanOrEqual(180);
    }
    expect(m.pose.dir.R).toBeCloseTo(-35, 0);
  });

  it('eases the same distance in a second at any frame rate', () => {
    const at = (fps: number) => {
      const m = new CoachMotion();
      for (let i = 0; i < fps / 2; i++) m.step(MOVES.wings, 0, 1 / fps);
      return m.pose.dir.L;
    };
    expect(at(30)).toBeCloseTo(at(120), 6);
  });
});
