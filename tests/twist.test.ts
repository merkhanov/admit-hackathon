import { describe, expect, it } from 'vitest';
import { TWIST_MAX, TWIST_SHARE, clampTurn, continuousTurn, hingeWeight } from '../src/stage/twist.ts';

const RAD = Math.PI / 180;

describe('continuousTurn', () => {
  it('keeps the angle as measured when there is no last frame', () => {
    expect(continuousTurn(170 * RAD, null)).toBeCloseTo(170 * RAD);
  });

  it('carries on past 180° instead of flipping a full turn the other way', () => {
    // Last frame +175°; now measured as -175°, which is +185°: 10° on, not 350° back.
    expect(continuousTurn(-175 * RAD, 175 * RAD)).toBeCloseTo(185 * RAD);
  });

  it('takes the other way round once the turn would go past 225°', () => {
    expect(continuousTurn(-130 * RAD, 220 * RAD)).toBeCloseTo(-130 * RAD);
  });
});

describe('sharing a palm turn', () => {
  it('never turns any joint past what its skin bears, even for a half-turn palm', () => {
    const total = 180 * RAD;
    const upper = clampTurn(total * TWIST_SHARE.upper, TWIST_MAX.upper);
    const fore = clampTurn((total - upper) * TWIST_SHARE.fore, TWIST_MAX.fore);
    const hand = clampTurn(total - upper - fore, TWIST_MAX.hand);
    // The palm gets within a few degrees of the half turn; no joint goes past its own limit.
    expect(upper + fore + hand).toBeGreaterThan(170 * RAD);
    expect(upper).toBeLessThanOrEqual(TWIST_MAX.upper);
    expect(fore).toBeLessThanOrEqual(TWIST_MAX.fore);
    expect(hand).toBeLessThanOrEqual(TWIST_MAX.hand);
  });
});

describe('hingeWeight', () => {
  it('lets a straight elbow turn freely and makes a bent one follow its hinge', () => {
    expect(hingeWeight(Math.sin(5 * RAD))).toBe(0);
    expect(hingeWeight(Math.sin(60 * RAD))).toBe(1);
    const mid = hingeWeight(Math.sin(20 * RAD));
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });
});
