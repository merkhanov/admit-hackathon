import { describe, expect, it } from 'vitest';
import {
  cameraReady, COUNTDOWN_S, initFlow, RESTART_LOCK_S, startRequested, stepFlow, STEP_PAUSE_S, STEP_TIMEOUT_S,
  WARMUP, WARMUP_HOLD_S, type Flow, type FlowCommand, type FlowInput,
} from '../src/app/flow.ts';
import { insertScore, parseLeaderboard } from '../src/app/leaderboard.ts';
import { adviceLines, logVerdict, partAccuracy, type MistakeLog } from '../src/app/summary.ts';
import { newDance } from '../src/dance/dance.ts';

const DT = 0.1;

function run(flow: Flow, seconds: number, input: Partial<FlowInput> = {}) {
  const commands: FlowCommand[] = [];
  let f = flow;
  for (let t = 0; t < seconds - 1e-9; t += DT) {
    const r = stepFlow(f, { events: [], dt: DT, poseScore: null, songOver: false, ...input });
    f = r.flow;
    commands.push(...r.commands);
  }
  return { flow: f, commands };
}

const calibrated = () => stepFlow(cameraReady(startRequested(initFlow())).flow, { events: ['calibrated'], dt: DT, poseScore: null, songOver: false }).flow;

describe('flow', () => {
  it('goes calibration, warm-up, countdown, song, results', () => {
    let f = calibrated();
    expect(f.phase).toMatchObject({ kind: 'warmup', step: 0 });
    for (let i = 0; i < WARMUP.length; i++) {
      const held = run(f, WARMUP_HOLD_S + DT, { poseScore: 0.95 });
      expect(held.commands).toContain('stepDone');
      f = held.flow;
      let paused = 0;
      while (f.phase.kind === 'warmup' && f.phase.step === i) {
        f = stepFlow(f, { events: [], dt: DT, poseScore: null, songOver: false }).flow;
        paused += DT;
      }
      // One tick of the pause already ran inside the hold loop above.
      expect(paused).toBeGreaterThanOrEqual(STEP_PAUSE_S - DT - 1e-9);
    }
    expect(f.phase.kind).toBe('countdown');
    const countdown = run(f, COUNTDOWN_S + DT);
    expect(countdown.commands.filter((c) => c === 'tick')).toHaveLength(3);
    expect(countdown.commands).toContain('startSong');
    expect(countdown.flow.phase.kind).toBe('dancing');
    const end = stepFlow(countdown.flow, { events: [], dt: DT, poseScore: null, songOver: true });
    expect(end.commands).toEqual(['finish']);
    expect(end.flow.phase.kind).toBe('results');
  });

  it('a warm-up pose must be held, a brief touch does not count', () => {
    let f = calibrated();
    f = run(f, 0.2, { poseScore: 0.95 }).flow;
    f = run(f, 0.2, { poseScore: 0.3 }).flow;
    f = run(f, 0.2, { poseScore: 0.95 }).flow;
    expect(f.phase).toMatchObject({ kind: 'warmup', step: 0, doneAt: null });
  });

  it('a pose that never matches does not trap the player', () => {
    const r = run(calibrated(), STEP_TIMEOUT_S + DT, { poseScore: 0.2 });
    expect(r.commands).toContain('stepSkipped');
    expect(r.flow.phase).toMatchObject({ kind: 'warmup', skipped: true });
  });

  it('a raised hand during the song does not restart anything', () => {
    const f: Flow = { phase: { kind: 'dancing' }, t: 5, seenWarmup: true };
    const r = stepFlow(f, { events: ['jump'], dt: DT, poseScore: null, songOver: false });
    expect(r.flow.phase.kind).toBe('dancing');
    expect(r.commands).toEqual([]);
  });

  it('results restart only after the lock, skip the warm-up and recalibrate', () => {
    let f: Flow = { phase: { kind: 'results' }, t: 0, seenWarmup: true };
    expect(stepFlow(f, { events: ['jump'], dt: DT, poseScore: null, songOver: false }).flow.phase.kind).toBe('results');
    f = run(f, RESTART_LOCK_S).flow;
    const r = stepFlow(f, { events: ['jump'], dt: DT, poseScore: null, songOver: false });
    expect(r.commands).toEqual(['recalibrate']);
    const next = stepFlow(r.flow, { events: ['calibrated'], dt: DT, poseScore: null, songOver: false });
    expect(next.flow.phase.kind).toBe('countdown');
  });
});

describe('round summary', () => {
  it('ranks the body parts that cost the most moves, with the latest correction', () => {
    let log: MistakeLog = {};
    const miss = (part: 'armL' | 'tilt', hint: string) => ({ index: 0, move: 'up' as const, rating: 'ok' as const, score: 0.5, hint, part });
    log = logVerdict(log, miss('armL', 'Левая рука: подними выше на 30°'));
    log = logVerdict(log, miss('armL', 'Левая рука: подними выше на 25°'));
    log = logVerdict(log, miss('tilt', 'Наклонись влево сильнее'));
    log = logVerdict(log, { index: 1, move: 'up', rating: 'perfect', score: 1, hint: null, part: null });
    const lines = adviceLines(log);
    expect(lines[0]).toBe('Левая рука: 2 раза мимо цели. Последняя подсказка: «Левая рука: подними выше на 25°».');
    expect(lines[1]).toContain('Наклон корпуса: 1 раз');
  });

  it('reports each part accuracy, weakest first', () => {
    const s = { ...newDance(), parts: { armL: { sum: 1.5, n: 2 }, armR: { sum: 1.9, n: 2 } } };
    expect(partAccuracy(s)).toEqual([
      { part: 'armL', name: 'Левая рука', pct: 75 },
      { part: 'armR', name: 'Правая рука', pct: 95 },
    ]);
  });
});

describe('leaderboard', () => {
  it('ignores corrupted storage', () => {
    expect(parseLeaderboard('not json')).toEqual([]);
    expect(parseLeaderboard('[{"score":"x"}]')).toEqual([]);
  });

  it('keeps the top five and reports the place', () => {
    const board = [5000, 4000, 3000, 2000, 1000].map((score) => ({ score, stars: 3, at: '2026-09-28T10:00:00Z' }));
    const r = insertScore(board, { score: 3500, stars: 4, at: '2026-09-28T11:00:00Z' });
    expect(r.place).toBe(2);
    expect(r.board.map((e) => e.score)).toEqual([5000, 4000, 3500, 3000, 2000]);
    expect(insertScore(r.board, { score: 1, stars: 0, at: '' }).place).toBe(-1);
  });
});
