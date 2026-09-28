/** Неоновые палитры эффектов под каждую песню. */
export interface VfxPalette {
  primary: string;
  secondary: string;
  accent: string;
  bg: string;
}

export const VFX_PALETTES: Record<string, VfxPalette> = {
  steps: { primary: '#00d4ff', secondary: '#ff00ff', accent: '#ffffff', bg: '#0a0a2e' },
  groove: { primary: '#00ff88', secondary: '#ffaa00', accent: '#ffffff', bg: '#0a2e1a' },
  rush: { primary: '#ff3366', secondary: '#ff6600', accent: '#ffff00', bg: '#2e0a1a' },
  chill: { primary: '#6688ff', secondary: '#aa66ff', accent: '#88ffcc', bg: '#0a1a2e' },
  storm: { primary: '#ff0044', secondary: '#ff4400', accent: '#ffff00', bg: '#2e0a0a' },
};

/** Палитра по ключу песни, с откатом на 'steps' для неизвестных ключей. */
export function paletteFor(key: string): VfxPalette {
  return VFX_PALETTES[key] ?? VFX_PALETTES['steps'] as VfxPalette;
}
