import { describe, expect, it } from 'vitest';
import { cameraReady, COUNTDOWN_S, initFlow, RESTART_LOCK_S, startRequested, stepFlow, STEP_PAUSE_S, STEP_TIMEOUT_S, TUTORIAL, type Flow, type FlowCommand } from '../src/app/flow.ts';
import type { Hint, TrackerEvent } from '../src/pose/tracker.ts';
import type { GestureId } from '../src/pose/gestures.ts';
import { adviceLines, countHintOnsets, emptyHintCounts } from '../src/app/summary.ts';
import { insertScore, parseLeaderboard } from '../src/app/leaderboard.ts';

function tick(flow: Flow, events: TrackerEvent[] = [], dt = 0.1, gameOver = false) {
  return stepFlow(flow, { events, dt, gameOver });
}

function wait(flow: Flow, seconds: number, gameOver = false) {
  const commands: FlowCommand[] = [];
  let f = flow;
  for (let t = 0; t < seconds; t += 0.1) {
    const r = tick(f, [], 0.1, gameOver);
    f = r.flow;
    commands.push(...r.commands);
  }
  return { flow: f, commands };
}

describe('flow', () => {
  it('goes intro, calibration, full tutorial, countdown, round', () => {
    let f = startRequested(initFlow());
    const ready = cameraReady(f);
    expect(ready.commands).toEqual(['recalibrate']);
    f = tick(ready.flow, ['calibrated']).flow;
    expect(f.phase).toEqual({ kind: 'tutorial', step: 0, doneAt: null, skipped: false });

    for (const step of TUTORIAL) {
      const r = tick(f, [step.event]);
      expect(r.commands).toContain('stepDone');
      f = r.flow;
      const stepBefore = f.phase.kind === 'tutorial' ? f.phase.step : -1;
      let waited = 0;
      while (f.phase.kind === 'tutorial' && f.phase.step === stepBefore) {
        f = tick(f).flow;
        waited += 0.1;
      }
      expect(waited).toBeGreaterThanOrEqual(STEP_PAUSE_S);
    }
    expect(f.phase.kind).toBe('countdown');

    const countdown = wait(f, COUNTDOWN_S + 0.1);
    expect(countdown.commands.filter((c) => c === 'tick')).toHaveLength(3);
    expect(countdown.commands).toContain('newGame');
    expect(countdown.flow.phase.kind).toBe('playing');
  });

  it('a tutorial step ignores the wrong gesture', () => {
    const f = tick(cameraReady(startRequested(initFlow())).flow, ['calibrated']).flow;
    const r = tick(f, ['leanL']);
    expect(r.flow.phase).toMatchObject({ kind: 'tutorial', step: 0, doneAt: null });
  });

  it('a gesture that never registers does not trap the player in the tutorial', () => {
    let f = tick(cameraReady(startRequested(initFlow())).flow, ['calibrated']).flow;
    const r = wait(f, STEP_TIMEOUT_S + 0.2);
    expect(r.commands).toContain('stepSkipped');
    expect(r.flow.phase).toMatchObject({ kind: 'tutorial', step: 0, skipped: true });
    f = wait(r.flow, STEP_PAUSE_S + 0.2).flow;
    expect(f.phase).toMatchObject({ kind: 'tutorial', step: 1, doneAt: null, skipped: false });
  });

  it('after game over, a jump restarts only after the lock, with recalibration and no tutorial', () => {
    let f: Flow = { phase: { kind: 'playing' }, t: 0, seenTutorial: true };
    f = tick(f, [], 0.1, true).flow;
    expect(f.phase.kind).toBe('over');
    expect(tick(f, ['jump']).flow.phase.kind).toBe('over');
    f = wait(f, RESTART_LOCK_S).flow;
    const r = tick(f, ['jump']);
    expect(r.commands).toEqual(['recalibrate']);
    expect(tick(r.flow, ['calibrated']).flow.phase.kind).toBe('countdown');
  });
});

describe('round summary', () => {
  it('counts a hint once per appearance and ranks the advice', () => {
    let shown: ReadonlySet<GestureId> = new Set();
    let counts = emptyHintCounts();
    const jumpHint: Hint = { kind: 'fix', gesture: 'jump', p: 0.5, text: '' };
    for (const hints of [[jumpHint], [jumpHint], [], [jumpHint]]) {
      const r = countHintOnsets(shown, hints, counts);
      shown = r.shown;
      counts = r.counts;
    }
    expect(counts.jump).toBe(2);
    const lines = adviceLines(counts, { cleared: 0, dodged: 0, hits: { barrier: 3, bar: 0, wall: 0, crate: 0 } });
    expect(lines[0]).toContain('Барьер сбил тебя 3 раза');
    expect(lines[1]).toContain('Прыжок: 2 раза');
  });
});

describe('leaderboard', () => {
  it('ignores corrupted storage', () => {
    expect(parseLeaderboard('not json')).toEqual([]);
    expect(parseLeaderboard('[{"score":"x"}]')).toEqual([]);
  });

  it('keeps the top five and reports the place', () => {
    let board = [100, 80, 60, 40, 20].map((score) => ({ score, coins: 0, at: '2026-09-28T10:00:00Z' }));
    const r = insertScore(board, { score: 70, coins: 1, at: '2026-09-28T11:00:00Z' });
    board = r.board;
    expect(r.place).toBe(2);
    expect(board.map((e) => e.score)).toEqual([100, 80, 70, 60, 40]);
    expect(insertScore(board, { score: 1, coins: 0, at: '' }).place).toBe(-1);
  });
});
