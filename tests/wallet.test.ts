import { describe, expect, it } from 'vitest';
import { buy, coinsFor, earn, newWallet, parseWallet, SHOP, STARTING_COINS, toggleWear, wornLook, owns } from '../src/app/wallet.ts';

describe('clothes shop', () => {
  it('a new player has coins to try the shop at once', () => {
    const w = newWallet();
    expect(w.coins).toBe(STARTING_COINS);
    expect(SHOP.some((i) => i.price <= STARTING_COINS)).toBe(true);
  });

  it('buying takes the coins, keeps the item and puts it on', () => {
    const r = buy(newWallet(), 'top-pink');
    expect(r.ok).toBe(true);
    expect(r.wallet.coins).toBe(STARTING_COINS - 30);
    expect(r.wallet.owned).toEqual(['top-pink']);
    expect(wornLook(r.wallet)).toEqual({ top: 330 });
  });

  it('cannot buy without enough coins, or the same thing twice', () => {
    expect(buy(newWallet(), 'hat-crown')).toMatchObject({ ok: false, reason: 'coins' });
    const once = buy(newWallet(), 'top-pink').wallet;
    expect(buy(once, 'top-pink')).toMatchObject({ ok: false, reason: 'owned' });
  });

  it('one item per slot: putting on another top replaces the first; wearing it again takes it off', () => {
    let w = earn(newWallet(), 500);
    w = buy(w, 'top-pink').wallet;
    w = buy(w, 'top-mint').wallet;
    expect(w.worn.top).toBe('top-mint');
    w = toggleWear(w, 'top-pink');
    expect(w.worn.top).toBe('top-pink');
    w = toggleWear(w, 'top-pink');
    expect(w.worn.top).toBeUndefined();
    expect(wornLook(w)).toEqual({});
  });

  it('a dance pays for every good move and every star', () => {
    expect(coinsFor({ perfect: 40, good: 8, ok: 2, miss: 2 }, 4)).toBe(40 * 3 + 8 * 2 + 2 + 40);
  });

  it('a saved wallet that was tampered with or broken loads safely', () => {
    expect(parseWallet('not json').coins).toBe(STARTING_COINS);
    const w = parseWallet(JSON.stringify({ coins: 12, owned: ['top-pink', 'free-crown'], worn: { top: 'top-pink', hat: 'hat-crown' } }));
    expect(w).toEqual({ coins: 12, owned: ['top-pink'], worn: { top: 'top-pink' } });
  });
});

describe('characters in the shop', () => {
  it('Michelle is free and dances by default; a bought character takes her place', () => {
    const w = newWallet();
    expect(owns(w, 'character-michelle')).toBe(true);
    expect(wornLook(w).character).toBeUndefined();
    const r = buy(w, 'character-juanita');
    expect(r.ok).toBe(true);
    expect(r.wallet.coins).toBe(w.coins - 100);
    expect(wornLook(r.wallet).character).toBe('juanita');
  });

  it('someone always dances: choosing a character again keeps it, choosing Michelle switches back', () => {
    const w = buy({ ...newWallet(), coins: 1000 }, 'character-snailkid').wallet;
    expect(wornLook(toggleWear(w, 'character-snailkid')).character).toBe('snailkid');
    expect(wornLook(toggleWear(w, 'character-michelle')).character).toBeUndefined();
  });

  it('a saved character survives a reload, a made-up one does not', () => {
    const saved = JSON.stringify({ coins: 5, owned: ['character-eugenia'], worn: { character: 'character-eugenia' } });
    expect(wornLook(parseWallet(saved)).character).toBe('eugenia');
    const forged = JSON.stringify({ coins: 5, owned: [], worn: { character: 'character-eugenia' } });
    expect(wornLook(parseWallet(forged)).character).toBeUndefined();
  });
});
