import type { Hat } from './themes.ts';

/**
 * How one avatar differs from the coach. Every avatar is the coach's own model, so all
 * dancers share one style; the outfit colours, skin tone, hair and hat tell them apart.
 */
export interface Look {
  /** Hue of the trousers, 0..360. The coach's are yellow. */
  pants: number;
  /** Hue given to the grey top, 0..360. */
  top: number;
  /** Skin lightness factor: 1 keeps the coach's tone, higher is lighter. */
  skin: number;
  /** Hue tinting the black hair, or null to keep it black. */
  hair: number | null;
  hat: Hat;
}

/** One look per avatar slot, in the candy palette of DESIGN.md. */
export const CREW_LOOKS: readonly Look[] = [
  { pants: 162, top: 300, skin: 1.55, hair: 28, hat: 'cap' },
  { pants: 205, top: 340, skin: 1.25, hair: null, hat: 'bow' },
  { pants: 330, top: 190, skin: 1.8, hair: 12, hat: 'none' },
];

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)];
}

/**
 * Recolours the coach's texture in place (RGBA bytes). Colour ranges pick the parts:
 * saturated yellow is the trousers, near-grey the top, warm brown the skin, near-black the hair.
 */
export function recolor(px: Uint8ClampedArray, look: Look): void {
  for (let i = 0; i < px.length; i += 4) {
    const [h, s, l] = rgbToHsl(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255);
    let out: [number, number, number] | null = null;
    if (h >= 38 && h <= 70 && s > 0.45 && l > 0.35) out = hslToRgb(look.pants, s * 0.85, l * 0.92);
    else if (s < 0.12 && l > 0.35 && l < 0.85) out = hslToRgb(look.top, 0.45, l);
    else if (h >= 12 && h <= 38 && s > 0.2 && s < 0.8 && l > 0.08 && l < 0.62) out = hslToRgb(h + 4, s * 0.9, Math.min(0.82, l * look.skin));
    else if (look.hair !== null && l < 0.3 && s < 0.35) out = hslToRgb(look.hair, 0.5, 0.03 + l * 1.6);
    if (!out) continue;
    px[i] = out[0] * 255;
    px[i + 1] = out[1] * 255;
    px[i + 2] = out[2] * 255;
  }
}
