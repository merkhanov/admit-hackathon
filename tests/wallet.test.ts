import { describe, expect, it } from 'vitest';
import { buy, coinsFor, earn, newWallet, parseWallet, SHOP, STARTING_COINS, toggleWear, wornLook } from '../src/app/wallet.ts';

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
