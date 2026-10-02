import type { DanceState, Verdict } from '../dance/dance.ts';
import { t } from '../i18n.ts';
import { PART_IDS, partName, type PartId } from '../dance/judge.ts';

/** Per body part: how many moves it spoiled, and the latest correction for it. */
export type MistakeLog = Partial<Record<PartId, { n: number; hint: string }>>;

export function logVerdict(log: MistakeLog, v: Verdict): MistakeLog {
  if (v.rating === 'perfect' || !v.part || !v.hint) return log;
  const prev = log[v.part];
  return { ...log, [v.part]: { n: (prev?.n ?? 0) + 1, hint: v.hint } };
}

/** The three parts that cost the most moves, each with a concrete example of the fix. */
export function adviceLines(log: MistakeLog): string[] {
  const entries: { part: PartId; n: number; hint: string }[] = [];
  for (const [part, e] of Object.entries(log)) if (e && isPart(part)) entries.push({ part, ...e });
  return entries
    .sort((a, b) => b.n - a.n)
    .slice(0, 3)
    .map((e) => t('advice', { part: partName(e.part), n: e.n, hint: e.hint }));
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
    if (acc && acc.n > 0 && isPart(part)) out.push({ part, name: partName(part), pct: Math.round((acc.sum / acc.n) * 100) });
  }
  return out.sort((a, b) => a.pct - b.pct);
}

function isPart(s: string): s is PartId {
  return (PART_IDS as readonly string[]).includes(s);
}
