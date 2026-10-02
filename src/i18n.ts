import { EN } from './i18n/en.ts';
import { KK } from './i18n/kk.ts';
import { RU } from './i18n/ru.ts';
import type { Entry, Vars } from './i18n/types.ts';

export type Lang = 'kk' | 'ru' | 'en';
export type Key = keyof typeof RU;

/** The switcher's order and labels: each language names itself. */
export const LANGS: readonly { id: Lang; label: string }[] = [
  { id: 'kk', label: 'Қаз' },
  { id: 'ru', label: 'Рус' },
  { id: 'en', label: 'Eng' },
];

const DICTS: Record<Lang, Record<Key, Entry>> = { ru: RU, kk: KK, en: EN };
const LOCALES: Record<Lang, string> = { kk: 'kk-KZ', ru: 'ru-RU', en: 'en-GB' };
const STORAGE_KEY = 'motion-dance.lang.v1';

// Russian until the app picks one, so pure modules and their tests read the reference texts.
let current: Lang = 'ru';
const listeners: (() => void)[] = [];

export const lang = (): Lang => current;
export const locale = (): string => LOCALES[current];
export const isLang = (s: unknown): s is Lang => s === 'kk' || s === 'ru' || s === 'en';

/** Text for a key in the current language, with {name} placeholders filled in. */
export function t(key: Key, vars: Vars = {}): string {
  const entry = DICTS[current][key];
  if (typeof entry === 'function') return entry(vars);
  return entry.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

/** Text for a key built at runtime (a song id, say), or null when the dictionary has no such key. */
export function tryT(key: string, vars: Vars = {}): string | null {
  return key in RU ? t(key as Key, vars) : null;
}

/** Switches the language, remembers it on this device and tells the UI to redraw. */
export function setLang(next: Lang, storage: Pick<Storage, 'setItem'> | null = globalThis.localStorage ?? null): void {
  current = next;
  try { storage?.setItem(STORAGE_KEY, next); } catch { /* private mode: the choice lasts this visit */ }
  for (const l of listeners) l();
}

export function onLangChange(listener: () => void): void {
  listeners.push(listener);
}

/** The saved choice, else the first browser language we speak, else Russian. */
export function detectLang(saved: string | null, browser: readonly string[]): Lang {
  if (isLang(saved)) return saved;
  for (const b of browser) {
    const base = b.toLowerCase().split('-')[0];
    if (base === 'kk' || base === 'kz') return 'kk';
    if (isLang(base)) return base;
  }
  return 'ru';
}

export function savedLang(storage: Pick<Storage, 'getItem'> | null = globalThis.localStorage ?? null): string | null {
  try { return storage?.getItem(STORAGE_KEY) ?? null; } catch { return null; }
}
