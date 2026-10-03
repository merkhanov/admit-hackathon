import type { Look } from './outfits.ts';

/** Who dances: the coach Michelle, or one of the three characters from the shop. */
export type CharacterId = 'michelle' | 'juanita' | 'snailkid' | 'eugenia';

export interface Character {
  /** The rigged model, under the site's base URL. */
  model: string;
  /** A head-and-shoulders picture for the shop. */
  portrait: string;
  /** Only Michelle's texture has the colour regions the shop's clothes recolour; the others wear just a hat. */
  dressable: boolean;
}

/**
 * Michelle comes from the three.js examples (Mixamo) and is fetched at build time. Juanita, SnailKid and
 * Eugenia are from the CC0 100 Avatars collection and live in public/avatars (scripts/import-avatars.mjs).
 */
export const CHARACTERS: Record<CharacterId, Character> = {
  michelle: { model: 'models/michelle.glb', portrait: 'avatars/michelle.png', dressable: true },
  juanita: { model: 'avatars/juanita.glb', portrait: 'avatars/juanita.png', dressable: false },
  snailkid: { model: 'avatars/snailkid.glb', portrait: 'avatars/snailkid.png', dressable: false },
  eugenia: { model: 'avatars/eugenia.glb', portrait: 'avatars/eugenia.png', dressable: false },
};

export const isCharacter = (s: unknown): s is CharacterId => typeof s === 'string' && s in CHARACTERS;

/** What a dancer has on: shop clothes over a look, and which character wears them. */
export type Dressing = Partial<Look> & { character?: CharacterId };
