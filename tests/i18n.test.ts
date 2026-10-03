import { afterEach, describe, expect, it } from 'vitest';
import { evaluate, type BodyAngles } from '../src/dance/judge.ts';
import { MOVES } from '../src/dance/moves.ts';
import { detectLang, LANGS, setLang, t, type Key } from '../src/i18n.ts';
import { EN } from '../src/i18n/en.ts';
import { KK } from '../src/i18n/kk.ts';
import { RU } from '../src/i18n/ru.ts';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const noStorage = { setItem: () => undefined };

describe('languages', () => {
  afterEach(() => setLang('ru', noStorage));

  it('every language fills the same placeholders, with no empty texts', () => {
    for (const dict of [KK, EN]) {
      for (const key of Object.keys(RU) as Key[]) {
        const ru = RU[key], other = dict[key];
        expect(typeof other, key).toBe(typeof ru === 'function' ? typeof other : 'string');
        if (typeof ru === 'string' && typeof other === 'string') {
          expect(placeholders(other), key).toEqual(placeholders(ru));
          // A size word may be empty: a plain «выше» is the middle amount.
          if (key !== 'amount.medium') expect(other.trim().length, key).toBeGreaterThan(0);
        }
      }
    }
  });

  it('picks the saved language, then the browser one, then Russian', () => {
    expect(detectLang('en', ['ru-RU'])).toBe('en');
    expect(detectLang(null, ['kk-KZ', 'ru'])).toBe('kk');
    expect(detectLang(null, ['en-US'])).toBe('en');
    expect(detectLang('xx', ['de-DE', 'fr'])).toBe('ru');
    expect(LANGS.map((l) => l.id)).toEqual(['kk', 'ru', 'en']);
  });

  it('a correction comes in the language the player chose', () => {
    // Left arm hanging down where "Left up" wants it raised.
    const body: BodyAngles = {
      arms: { L: { ok: true, offBottom: false, dir: 10, elbow: 175 }, R: { ok: true, offBottom: false, dir: 5, elbow: 175 } },
      tilt: 0,
      drop: 0,
    };
    const hint = () => evaluate(MOVES.leftUp, body).worst?.hint;
    expect(hint()).toBe('Левую руку намного выше');
    setLang('kk', noStorage);
    expect(hint()).toBe('Сол қолды әлдеқайда жоғары көтер');
    setLang('en', noStorage);
    expect(hint()).toBe('Left arm much higher');
  });

  it('counts mistakes with the right grammar', () => {
    expect(t('advice', { part: 'Левая рука', n: 3, hint: 'x' })).toBe('x (3 раза мимо)');
    expect(t('advice', { part: 'Левая рука', n: 5, hint: 'x' })).toBe('x (5 раз мимо)');
    setLang('en', noStorage);
    expect(t('advice', { part: 'Left arm', n: 1, hint: 'x' })).toBe('x (missed once)');
  });
});
