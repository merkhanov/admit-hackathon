import type { Rating } from '../dance/dance.ts';
import { CHARACTER_IDS, CHARACTERS, type CharacterId } from '../stage/characters.ts';
import type { Hat } from '../stage/themes.ts';

/** Where a piece of clothing goes; 'character' is who dances. */
export type Slot = 'character' | 'top' | 'pants' | 'hair' | 'hat';
export const SLOTS: readonly Slot[] = ['character', 'top', 'pants', 'hair', 'hat'];

export interface ShopItem {
  id: string;
  slot: Slot;
  price: number;
  /** Colour hue for tops, trousers and hair, 0..360. */
  hue?: number;
  hat?: Exclude<Hat, 'none'>;
  character?: CharacterId;
  /** Swatch colour shown in the shop. */
  swatch: string;
  /** Translation key of its name. */
  name: string;
  /** A name shown as is, when there's no translation (catalogue characters). */
  label?: string;
}

const colour = (slot: Slot, key: string, hue: number, swatch: string, price: number): ShopItem =>
  ({ id: `${slot}-${key}`, slot, price, hue, swatch, name: `colour.${key}` });
const hat = (key: Exclude<Hat, 'none'>, price: number, swatch: string): ShopItem =>
  ({ id: `hat-${key}`, slot: 'hat', price, hat: key, swatch, name: `hat.${key}` });

const character = (key: CharacterId): ShopItem => {
  const c = CHARACTERS[key];
  return { id: `character-${key}`, slot: 'character', price: c.price, character: key, swatch: '', name: `character.${key}`, ...(c.label ? { label: c.label } : {}) };
};

/** Everything the shop sells: characters first (Michelle is free and worn by default), cheap colours, pricier hats. */
export const SHOP: readonly ShopItem[] = [
  ...CHARACTER_IDS.map(character),
  colour('top', 'pink', 330, '#fe8dc5', 30), colour('top', 'mint', 162, '#56f3c1', 30),
  colour('top', 'sky', 205, '#8cd1fa', 40), colour('top', 'sunshine', 50, '#ffda4b', 40),
  colour('top', 'grape', 285, '#8140d0', 50), colour('top', 'coral', 10, '#fe8b85', 50),
  colour('pants', 'grape', 285, '#8140d0', 30), colour('pants', 'sky', 205, '#8cd1fa', 30),
  colour('pants', 'pink', 330, '#fe8dc5', 40), colour('pants', 'mint', 162, '#56f3c1', 40),
  colour('pants', 'coral', 10, '#fe8b85', 50), colour('pants', 'navy', 235, '#3b4bb8', 50),
  colour('hair', 'pink', 330, '#fe8dc5', 60), colour('hair', 'sky', 205, '#8cd1fa', 60),
  colour('hair', 'grape', 285, '#8140d0', 60), colour('hair', 'copper', 20, '#c8642c', 60),
  hat('cap', 80, '#4cbcff'), hat('bow', 90, '#ff6fb1'), hat('kalpak', 110, '#ffffff'),
  hat('papakha', 120, '#6b4a3a'), hat('crown', 150, '#ffd23f'),
];

const BY_ID = new Map(SHOP.map((i) => [i.id, i]));
export const shopItem = (id: string): ShopItem | undefined => BY_ID.get(id);

/** Free items (Michelle) belong to everyone. */
export const owns = (w: Wallet, id: string): boolean => w.owned.includes(id) || shopItem(id)?.price === 0;

export interface Wallet {
  coins: number;
  owned: string[];
  /** What is worn in each slot, by item id. */
  worn: Partial<Record<Slot, string>>;
}

/** A new player can try the shop at once. */
export const STARTING_COINS = 100;
export const newWallet = (): Wallet => ({ coins: STARTING_COINS, owned: [], worn: {} });

/** Coins for one dance: a few for every well-danced move, more for each star. */
export function coinsFor(counts: Record<Rating, number>, stars: number): number {
  return counts.perfect * 3 + counts.good * 2 + counts.ok + stars * 10;
}

export type BuyResult = { wallet: Wallet; ok: true } | { wallet: Wallet; ok: false; reason: 'owned' | 'coins' | 'unknown' };

/** Buys an item and puts it on. */
export function buy(w: Wallet, id: string): BuyResult {
  const item = shopItem(id);
  if (!item) return { wallet: w, ok: false, reason: 'unknown' };
  if (owns(w, id)) return { wallet: w, ok: false, reason: 'owned' };
  if (w.coins < item.price) return { wallet: w, ok: false, reason: 'coins' };
  return { wallet: { coins: w.coins - item.price, owned: [...w.owned, id], worn: { ...w.worn, [item.slot]: id } }, ok: true };
}

/** Puts on an owned item, or takes it off if it is already worn. Someone always dances, so a character only switches. */
export function toggleWear(w: Wallet, id: string): Wallet {
  const item = shopItem(id);
  if (!item || !owns(w, id)) return w;
  const worn = { ...w.worn };
  if (item.slot === 'character') worn.character = id;
  else if (worn[item.slot] === id) delete worn[item.slot];
  else worn[item.slot] = id;
  return { ...w, worn };
}

export const earn = (w: Wallet, coins: number): Wallet => ({ ...w, coins: w.coins + Math.max(0, Math.round(coins)) });

/** Clothes worn from the shop: hues for the parts bought and a hat, nothing for the rest. */
export interface WornLook {
  /** Who dances, when not Michelle. */
  character?: CharacterId;
  top?: number;
  pants?: number;
  hair?: number;
  hat?: Exclude<Hat, 'none'>;
}

/** The look the worn clothes give: only the parts bought change, the rest stays as the dancer has it. */
export function wornLook(w: Wallet): WornLook {
  const look: WornLook = {};
  for (const slot of SLOTS) {
    const item = w.worn[slot] ? shopItem(w.worn[slot]) : undefined;
    if (!item) continue;
    if (slot === 'character' && item.character && item.character !== 'michelle') look.character = item.character;
    if (slot === 'hat' && item.hat) look.hat = item.hat;
    if (slot === 'top' && item.hue !== undefined) look.top = item.hue;
    if (slot === 'pants' && item.hue !== undefined) look.pants = item.hue;
    if (slot === 'hair' && item.hue !== undefined) look.hair = item.hue;
  }
  return look;
}

const KEY = 'motion-dance.wallet.v1';

export function parseWallet(raw: string | null): Wallet {
  if (!raw) return newWallet();
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null) return newWallet();
    const o = v as Record<string, unknown>;
    const coins = typeof o.coins === 'number' && Number.isFinite(o.coins) ? Math.max(0, Math.floor(o.coins)) : STARTING_COINS;
    const owned = Array.isArray(o.owned) ? o.owned.filter((id): id is string => typeof id === 'string' && shopItem(id) !== undefined) : [];
    const worn: Partial<Record<Slot, string>> = {};
    if (typeof o.worn === 'object' && o.worn !== null) {
      for (const slot of SLOTS) {
        const id = (o.worn as Record<string, unknown>)[slot];
        if (typeof id === 'string' && (owned.includes(id) || shopItem(id)?.price === 0) && shopItem(id)?.slot === slot) worn[slot] = id;
      }
    }
    return { coins, owned, worn };
  } catch {
    return newWallet();
  }
}

export function loadWallet(storage: Pick<Storage, 'getItem'> = localStorage): Wallet {
  try { return parseWallet(storage.getItem(KEY)); } catch { return newWallet(); }
}

export function saveWallet(w: Wallet, storage: Pick<Storage, 'setItem'> = localStorage): void {
  try { storage.setItem(KEY, JSON.stringify(w)); } catch { /* private mode: lasts this visit */ }
}
