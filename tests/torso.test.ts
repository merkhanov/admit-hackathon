import { describe, expect, it } from 'vitest';
import { hiddenByTorso, measureTorso, type BodyPoint } from '../src/stage/torso.ts';

/** A box-shaped torso: 0.4 wide, 0.6 tall, its front 0.12 towards the camera. */
const box: BodyPoint[] = [];
for (let side = -0.2; side <= 0.2001; side += 0.05) {
  for (let up = 0; up <= 0.6001; up += 0.05) for (const fwd of [-0.12, 0.12]) box.push({ side, up, fwd });
}
const torso = measureTorso(box);

describe('torso profile', () => {
  it('a point in the middle of the chest, behind its front, is hidden', () => {
    expect(hiddenByTorso({ side: 0, up: 0.3, fwd: 0.05 }, torso, 0.02)).toBe(true);
  });

  it('the same point brought in front of the chest is seen', () => {
    expect(hiddenByTorso({ side: 0, up: 0.3, fwd: 0.2 }, torso, 0.02)).toBe(false);
  });

  it('an arm hanging beside the body is seen even level with the chest', () => {
    expect(hiddenByTorso({ side: 0.3, up: 0.3, fwd: 0 }, torso, 0.02)).toBe(false);
  });

  it('above the head or below the hips there is no torso to hide behind', () => {
    expect(hiddenByTorso({ side: 0, up: 1.2, fwd: 0 }, torso, 0.02)).toBe(false);
    expect(hiddenByTorso({ side: 0, up: -0.5, fwd: 0 }, torso, 0.02)).toBe(false);
  });
});
