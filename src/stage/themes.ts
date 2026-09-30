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
  // The default candy-sky stage from DESIGN.md: bubblegum, sky, sunshine, lilac and mint tiles.
  neon: { background: 0xb48cf0, backdrop: ['#9d99ed', '#ea9dd9', '#ffc1b5'], floor: [0xfe8dc5, 0x8cd1fa, 0xffda4b, 0xb48cf0, 0x56f3c1], rims: [0xff2fb3, 0x22d3ee], hat: 'none' },
  party: { background: 0x7fd4ff, backdrop: ['#fff0a8', '#8fe3ff', '#6d8cff'], floor: [0xffd23f, 0xff6fb1, 0x4cbcff, 0x46dd9b, 0xa78bfa], rims: [0xffd23f, 0x4cbcff], hat: 'cap' },
  korobeiniki: { background: 0xcfe8ff, backdrop: ['#fff6e0', '#ffd0d8', '#9fc3ff'], floor: [0xff9a4a, 0xffd23f, 0x46dd9b, 0x4cbcff, 0xff6fb1], rims: [0xff9a4a, 0x4cbcff], hat: 'papakha' },
  cancan: { background: 0xffc7e3, backdrop: ['#fff0f6', '#ffb3d6', '#c48cff'], floor: [0xff6fb1, 0xffd23f, 0xc9b6ff, 0xff9a4a, 0xffffff], rims: [0xff6fb1, 0xffd23f], hat: 'bow' },
  troll: { background: 0x8fd6c0, backdrop: ['#e3ffd6', '#9be0c8', '#6aa3d8'], floor: [0x46dd9b, 0x4cbcff, 0xa0e060, 0xffd23f, 0x7ad7c0], rims: [0x46dd9b, 0xffd23f], hat: 'crown' },
  zhorga: { background: 0x9fd9ff, backdrop: ['#fff3c4', '#ffd98a', '#7cc4ff'], floor: [0xffd23f, 0xff9a4a, 0x46dd9b, 0x4cbcff, 0xffe3a3], rims: [0xffd23f, 0x4cbcff], hat: 'kalpak' },
  // Carnival: sunset orange, hot pink, lime and turquoise.
  samba: { background: 0xffb070, backdrop: ['#fff2b0', '#ffa07a', '#ff5fa2'], floor: [0xff6fb1, 0xffd23f, 0x46dd9b, 0x22d3ee, 0xff9a4a], rims: [0xff2fb3, 0xffd23f], hat: 'none' },
  // The dancer's videos: blue sky outdoors, a warm studio indoors.
  dance1: { background: 0x8fd0ff, backdrop: ['#e6f6ff', '#9fd4ff', '#8fe3b0'], floor: [0x4cbcff, 0x46dd9b, 0xffd23f, 0xa78bfa, 0xffffff], rims: [0x4cbcff, 0x46dd9b], hat: 'none' },
  dance2: { background: 0x3a3350, backdrop: ['#f4ead8', '#d9c3a5', '#5b4f6e'], floor: [0xffd23f, 0xfe8dc5, 0x8cd1fa, 0xb48cf0, 0xffffff], rims: [0xffd23f, 0xfe8dc5], hat: 'none' },
  dance3: { background: 0x3a3350, backdrop: ['#f4ead8', '#e0b7c8', '#5b4f6e'], floor: [0xfe8dc5, 0xffd23f, 0x56f3c1, 0x8cd1fa, 0xffffff], rims: [0xfe8dc5, 0x56f3c1], hat: 'none' },
  custom: { background: 0xb9a2ff, backdrop: ['#d6f5ff', '#c9b6ff', '#ff9ccc'], floor: CANDY, rims: [0x4cbcff, 0xff6fb1], hat: 'cap' },
};

export const themeFor = (songId: string): StageTheme => THEMES[songId] ?? THEMES.neon;
