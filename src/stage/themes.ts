/** The coach's headwear: the one thing that turns the same dancer into each song's character. */
export type Hat = 'none' | 'cap' | 'papakha' | 'bow' | 'crown' | 'kalpak';

/** Colours of the stage and the coach's costume for one song. */
export interface StageTheme {
  /** Scene background behind the backdrop. */
  background: number;
  /** Backdrop gradient, top to bottom. */
  backdrop: readonly [string, string, string];
  /** Floor tiles, light beams and confetti cycle through these. */
  floor: readonly number[];
  /** Coloured lamps behind the coach, screen-left and screen-right. */
  rims: readonly [number, number];
  hat: Hat;
}

const CANDY = [0xff6fb1, 0x4cbcff, 0x46dd9b, 0xffd23f, 0xff9a4a];

export const THEMES: Record<string, StageTheme> = {
  neon: { background: 0xb9a2ff, backdrop: ['#ffc2e0', '#c9b6ff', '#9d7cf0'], floor: CANDY, rims: [0xff6fb1, 0x4cbcff], hat: 'none' },
  party: { background: 0x7fd4ff, backdrop: ['#fff0a8', '#8fe3ff', '#6d8cff'], floor: [0xffd23f, 0xff6fb1, 0x4cbcff, 0x46dd9b, 0xa78bfa], rims: [0xffd23f, 0x4cbcff], hat: 'cap' },
  korobeiniki: { background: 0xcfe8ff, backdrop: ['#fff6e0', '#ffd0d8', '#9fc3ff'], floor: [0xff9a4a, 0xffd23f, 0x46dd9b, 0x4cbcff, 0xff6fb1], rims: [0xff9a4a, 0x4cbcff], hat: 'papakha' },
  cancan: { background: 0xffc7e3, backdrop: ['#fff0f6', '#ffb3d6', '#c48cff'], floor: [0xff6fb1, 0xffd23f, 0xc9b6ff, 0xff9a4a, 0xffffff], rims: [0xff6fb1, 0xffd23f], hat: 'bow' },
  troll: { background: 0x8fd6c0, backdrop: ['#e3ffd6', '#9be0c8', '#6aa3d8'], floor: [0x46dd9b, 0x4cbcff, 0xa0e060, 0xffd23f, 0x7ad7c0], rims: [0x46dd9b, 0xffd23f], hat: 'crown' },
  zhorga: { background: 0x9fd9ff, backdrop: ['#fff3c4', '#ffd98a', '#7cc4ff'], floor: [0xffd23f, 0xff9a4a, 0x46dd9b, 0x4cbcff, 0xffe3a3], rims: [0xffd23f, 0x4cbcff], hat: 'kalpak' },
  custom: { background: 0xb9a2ff, backdrop: ['#d6f5ff', '#c9b6ff', '#ff9ccc'], floor: CANDY, rims: [0x4cbcff, 0xff6fb1], hat: 'cap' },
};

export const themeFor = (songId: string): StageTheme => THEMES[songId] ?? THEMES.neon;
