/** Палитры конфетти под каждую песню. */
export interface VfxPalette {
  primary: string;
  secondary: string;
  accent: string;
  bg: string;
}

export const VFX_PALETTES: Record<string, VfxPalette> = {
  // Soft, kid-safe confetti per song, from the DESIGN.md palette.
  steps: { primary: '#56f3c1', secondary: '#fe8dc5', accent: '#ffda4b', bg: '#9d99ed' },
  groove: { primary: '#8cd1fa', secondary: '#ffb36a', accent: '#56f3c1', bg: '#8cd1fa' },
  rush: { primary: '#fe8b85', secondary: '#ffda4b', accent: '#fe8dc5', bg: '#ea9dd9' },
  chill: { primary: '#8cd1fa', secondary: '#b48cf0', accent: '#56f3c1', bg: '#9d99ed' },
  storm: { primary: '#8140d0', secondary: '#fe8b85', accent: '#ffda4b', bg: '#b48cf0' },
};

/** Палитра по ключу песни, с откатом на 'steps' для неизвестных ключей. */
export function paletteFor(key: string): VfxPalette {
  return VFX_PALETTES[key] ?? VFX_PALETTES['steps'] as VfxPalette;
}
