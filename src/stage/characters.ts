import { CATALOG } from './catalog.ts';
import type { Look } from './outfits.ts';

/** Who dances: 'michelle', a built-in character, or one from the catalogue ('pm031' and so on). */
export type CharacterId = string;

export interface Character {
  /** The rigged model: a path under the site's base URL, or a full URL (the catalogue's are on Arweave). */
  model: string;
  /** A head-and-shoulders picture for the shop, under the site's base URL. */
  portrait: string;
  /** Only Michelle's texture has the colour regions the shop's clothes recolour; the others wear just a hat. */
  dressable: boolean;
  /** Coins it costs in the shop; Michelle is free. */
  price: number;
  /** Shown as is in every language (a name); built-in characters have translated names instead. */
  label?: string;
}

/**
 * Michelle comes from the three.js examples (Mixamo) and is fetched at build time. Juanita, SnailKid and
 * Eugenia are from the CC0 100 Avatars collection, compressed in public/avatars (scripts/import-avatars.mjs).
 * The rest of that collection is the catalogue (scripts/import-catalog.mjs).
 */
const BUILT_IN: Record<string, Character> = {
  michelle: { model: 'models/michelle.glb', portrait: 'avatars/michelle.png', dressable: true, price: 0 },
  juanita: { model: 'avatars/juanita.glb', portrait: 'avatars/juanita.png', dressable: false, price: 100 },
  snailkid: { model: 'avatars/snailkid.glb', portrait: 'avatars/snailkid.png', dressable: false, price: 150 },
  eugenia: { model: 'avatars/eugenia.glb', portrait: 'avatars/eugenia.png', dressable: false, price: 200 },
};

/** Catalogue prices spread over 100 to 300 coins, the same for a character every time. */
const catalogPrice = (n: string) => 100 + ((Number(n) * 37) % 5) * 50;

export const CHARACTERS: Readonly<Record<string, Character>> = {
  ...BUILT_IN,
  ...Object.fromEntries(CATALOG.map((c) => [c.id, {
    model: c.model, portrait: `avatars/catalog/${c.number}.webp`, dressable: false, price: catalogPrice(c.number), label: c.name,
  }])),
};

/** Built-in characters first, then the catalogue in the collection's order. */
export const CHARACTER_IDS: readonly CharacterId[] = Object.keys(CHARACTERS);

export const isCharacter = (s: unknown): s is CharacterId => typeof s === 'string' && Object.hasOwn(CHARACTERS, s);

/** Where to load a character's model from. */
export const modelUrl = (c: Character): string => (/^https?:/.test(c.model) ? c.model : `${import.meta.env.BASE_URL}${c.model}`);

/** What a dancer has on: shop clothes over a look, and which character wears them. */
export type Dressing = Partial<Look> & { character?: CharacterId };
