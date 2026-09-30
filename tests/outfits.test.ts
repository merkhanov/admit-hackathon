import { describe, expect, it } from 'vitest';
import { CREW_LOOKS, recolor, type Look } from '../src/stage/outfits.ts';

const px = (...rgb: number[]) => new Uint8ClampedArray([...rgb, 255]);

describe('avatar outfits', () => {
  const look: Look = { pants: 210, top: 300, skin: 1, hair: null, hat: 'none' };

  it('turns the yellow trousers to the look colour', () => {
    const p = px(250, 215, 60);
    recolor(p, look);
    expect(p[2]).toBeGreaterThan(p[0]); // blue now dominates
  });

  it('keeps black hair black without a hair tint', () => {
    const p = px(20, 18, 22);
    recolor(p, look);
    expect([...p]).toEqual([20, 18, 22, 255]);
  });

  it('keeps the red glasses and headphones', () => {
    const p = px(220, 30, 30);
    recolor(p, look);
    expect([...p]).toEqual([220, 30, 30, 255]);
  });

  it('gives every avatar slot a different outfit', () => {
    expect(new Set(CREW_LOOKS.map((l) => l.pants)).size).toBe(CREW_LOOKS.length);
  });
});
