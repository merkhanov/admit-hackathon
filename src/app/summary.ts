import type { DanceState, Verdict } from '../dance/dance.ts';
import { PART_NAMES, type PartId } from '../dance/judge.ts';

/** Per body part: how many moves it spoiled, and the latest correction for it. */
export type MistakeLog = Partial<Record<PartId, { n: number; hint: string }>>;

export function logVerdict(log: MistakeLog, v: Verdict): MistakeLog {
  if (v.rating === 'perfect' || !v.part || !v.hint) return log;
  const prev = log[v.part];
  return { ...log, [v.part]: { n: (prev?.n ?? 0) + 1, hint: v.hint } };
}

function times(n: number): string {
  const d = n % 10, dd = n % 100;
  return d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? 'раза' : 'раз';
}

/** The three parts that cost the most moves, each with a concrete example of the fix. */
export function adviceLines(log: MistakeLog): string[] {
  const entries: { part: PartId; n: number; hint: string }[] = [];
  for (const [part, e] of Object.entries(log)) if (e && isPart(part)) entries.push({ part, ...e });
  return entries
    .sort((a, b) => b.n - a.n)
    .slice(0, 3)
    .map((e) => `${PART_NAMES[e.part]}: ${e.n} ${times(e.n)} мимо цели. Последняя подсказка: «${e.hint}».`);
}

export interface PartAccuracy {
  part: PartId;
  name: string;
  /** 0..100 */
  pct: number;
}

/** Average match of each body part at the best moment of every move, weakest first. */
export function partAccuracy(state: DanceState): PartAccuracy[] {
  const out: PartAccuracy[] = [];
  for (const [part, acc] of Object.entries(state.parts)) {
    if (acc && acc.n > 0 && isPart(part)) out.push({ part, name: PART_NAMES[part], pct: Math.round((acc.sum / acc.n) * 100) });
  }
  return out.sort((a, b) => a.pct - b.pct);
}

function isPart(s: string): s is PartId {
  return s in PART_NAMES;
}
