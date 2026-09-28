import type { HazardType, GameStats } from '../game/game.ts';
import { GESTURE_IDS, type GestureId } from '../pose/gestures.ts';
import type { Hint } from '../pose/tracker.ts';

export type HintCounts = Record<GestureId, number>;

export const emptyHintCounts = (): HintCounts => ({ jump: 0, punch: 0, duck: 0, leanL: 0, leanR: 0 });

/** Counts a hint once when it appears, not on every frame it stays on screen. */
export function countHintOnsets(
  shown: ReadonlySet<GestureId>,
  hints: readonly Hint[],
  counts: HintCounts,
): { shown: Set<GestureId>; counts: HintCounts } {
  const now = new Set<GestureId>();
  for (const h of hints) if (h.kind === 'fix') now.add(h.gesture);
  const next = { ...counts };
  for (const id of now) if (!shown.has(id)) next[id]++;
  return { shown: now, counts: next };
}

const GESTURE_ADVICE: Record<GestureId, (n: number) => string> = {
  jump: (n) => `Прыжок: ${n} ${times(n)} рука не дошла до макушки. Поднимай кисть выше головы.`,
  punch: (n) => `Удар: ${n} ${times(n)} рука была согнута или не на уровне плеча. Держи её прямой и горизонтально.`,
  duck: (n) => `Присед: ${n} ${times(n)} ты присел недостаточно. Опускай плечи ниже.`,
  leanL: (n) => `Наклон влево: ${n} ${times(n)} наклон был слишком слабым. Клонись увереннее.`,
  leanR: (n) => `Наклон вправо: ${n} ${times(n)} наклон был слишком слабым. Клонись увереннее.`,
};

const HIT_ADVICE: Record<HazardType, (n: number) => string> = {
  barrier: (n) => `Барьер сбил тебя ${n} ${times(n)}. Поднимай руку заранее, прыжок длится меньше секунды.`,
  bar: (n) => `Перекладина сбила тебя ${n} ${times(n)}. Приседай и держи присед, пока она не пройдёт.`,
  wall: (n) => `В стену ты врезался ${n} ${times(n)}. Её не перепрыгнуть, уходи на другую дорожку наклоном.`,
  crate: (n) => `В ящик ты врезался ${n} ${times(n)}. Бей, когда он близко: вытяни прямую руку в сторону.`,
};

function times(n: number): string {
  const d = n % 10, dd = n % 100;
  return d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? 'раза' : 'раз';
}

/** The three most frequent mistakes of the round, phrased as advice. */
export function adviceLines(counts: HintCounts, stats: GameStats): string[] {
  const items: { n: number; text: string }[] = [];
  for (const id of GESTURE_IDS) if (counts[id] > 0) items.push({ n: counts[id], text: GESTURE_ADVICE[id](counts[id]) });
  for (const [type, n] of Object.entries(stats.hits)) {
    if (n > 0 && isHazard(type)) items.push({ n: n + 0.5, text: HIT_ADVICE[type](n) });
  }
  return items.sort((a, b) => b.n - a.n).slice(0, 3).map((i) => i.text);
}

function isHazard(s: string): s is HazardType {
  return s === 'barrier' || s === 'bar' || s === 'wall' || s === 'crate';
}
