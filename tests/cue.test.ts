import { describe, expect, it } from 'vitest';
import { evaluate, type ArmAngles, type BodyAngles } from '../src/dance/judge.ts';
import { MOVES } from '../src/dance/moves.ts';

const arm = (dir: number, elbow = 175): ArmAngles => ({ ok: true, offBottom: false, dir, elbow });
const body = (L: ArmAngles, R: ArmAngles, tilt = 0): BodyAngles => ({ arms: { L, R }, tilt, drop: 0 });
const cue = (move: keyof typeof MOVES, b: BodyAngles) => evaluate(MOVES[move], b).worst?.cue;

describe('hint arrows point where the player must move, as seen on screen', () => {
  it('up for an arm that is too low, down for one that is too high', () => {
    expect(cue('leftUp', body(arm(10), arm(5)))).toBe('up');
    expect(cue('wings', body(arm(170), arm(90)))).toBe('down');
  });

  it("left for the player's left arm going out, right for it going across the body", () => {
    // Disco left wants the left arm high and out; across the body (negative) must swing back out.
    expect(cue('discoR', body(arm(60), arm(140)))).toBe('right');
    expect(cue('wings', body(arm(-40), arm(90)))).toBe('left');
  });

  it('left or right for leans, and bend or straighten for elbows', () => {
    expect(cue('leanL', body(arm(90), arm(170), 0))).toBe('left');
    expect(cue('leanR', body(arm(170), arm(90), 0))).toBe('right');
    expect(cue('muscles', body(arm(115, 175), arm(115, 80)))).toBe('bend');
  });
});
