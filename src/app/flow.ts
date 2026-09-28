import type { TrackerEvent } from '../pose/tracker.ts';
import type { GestureId } from '../pose/gestures.ts';

export type Phase =
  | { kind: 'intro' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'calibrating' }
  | { kind: 'tutorial'; step: number; doneAt: number | null; skipped: boolean }
  | { kind: 'countdown' }
  | { kind: 'playing' }
  | { kind: 'over' };

export interface Flow {
  phase: Phase;
  /** Seconds since the current phase started. */
  t: number;
  seenTutorial: boolean;
}

export type FlowCommand = 'recalibrate' | 'newGame' | 'stepDone' | 'stepSkipped' | 'tick' | 'go';

export interface TutorialStep {
  gesture: GestureId;
  event: TrackerEvent;
  title: string;
  text: string;
}

export const TUTORIAL: readonly TutorialStep[] = [
  { gesture: 'jump', event: 'jump', title: 'Прыжок', text: 'Подними руку выше головы. Так ты перепрыгнешь барьер.' },
  { gesture: 'duck', event: 'duckStart', title: 'Присед', text: 'Присядь, чтобы плечи опустились. Так ты пройдёшь под перекладиной.' },
  { gesture: 'leanL', event: 'leanL', title: 'Влево', text: 'Наклони плечи влево. Персонаж перейдёт на левую дорожку.' },
  { gesture: 'leanR', event: 'leanR', title: 'Вправо', text: 'Наклони плечи вправо. Персонаж перейдёт на правую дорожку.' },
  { gesture: 'punch', event: 'punch', title: 'Удар', text: 'Вытяни прямую руку в сторону на уровне плеча. Так ты разобьёшь ящик.' },
];

export const STEP_PAUSE_S = 1.0;
/** A step that isn't done by then moves on anyway, so one unrecognized gesture can't block the game. */
export const STEP_TIMEOUT_S = 15;
/** When the tutorial starts telling the player it will move on. */
export const STEP_WARN_S = 8;
export const COUNTDOWN_S = 3;
/** Game over screen ignores gestures this long, so the last move of the round doesn't restart it. */
export const RESTART_LOCK_S = 2.5;

export const initFlow = (): Flow => ({ phase: { kind: 'intro' }, t: 0, seenTutorial: false });

const enter = (flow: Flow, phase: Phase): Flow => ({ ...flow, phase, t: 0 });

export const startRequested = (flow: Flow): Flow => enter(flow, { kind: 'loading' });
export const cameraFailed = (flow: Flow, message: string): Flow => enter(flow, { kind: 'error', message });
export const cameraReady = (flow: Flow): { flow: Flow; commands: FlowCommand[] } => ({
  flow: enter(flow, { kind: 'calibrating' }),
  commands: ['recalibrate'],
});

export interface FlowInput {
  events: readonly TrackerEvent[];
  dt: number;
  gameOver: boolean;
}

/** Pure step of the screen sequence: calibration, tutorial, countdown, round, results. */
export function stepFlow(flow: Flow, input: FlowInput): { flow: Flow; commands: FlowCommand[] } {
  const commands: FlowCommand[] = [];
  const prevT = flow.t;
  const f: Flow = { ...flow, t: flow.t + input.dt };
  const p = f.phase;
  const done = (next: Flow) => ({ flow: next, commands });

  switch (p.kind) {
    case 'intro':
    case 'loading':
    case 'error':
      return done(f);
    case 'calibrating':
      if (input.events.includes('calibrated')) {
        return done(f.seenTutorial ? enter(f, { kind: 'countdown' }) : enter(f, { kind: 'tutorial', step: 0, doneAt: null, skipped: false }));
      }
      return done(f);
    case 'tutorial': {
      const step = TUTORIAL[p.step];
      if (p.doneAt === null) {
        if (input.events.includes(step.event)) {
          commands.push('stepDone');
          return done({ ...f, phase: { ...p, doneAt: f.t } });
        }
        if (f.t >= STEP_TIMEOUT_S) {
          commands.push('stepSkipped');
          return done({ ...f, phase: { ...p, doneAt: f.t, skipped: true } });
        }
        return done(f);
      }
      if (f.t - p.doneAt < STEP_PAUSE_S) return done(f);
      if (p.step + 1 < TUTORIAL.length) return done(enter(f, { kind: 'tutorial', step: p.step + 1, doneAt: null, skipped: false }));
      return done(enter({ ...f, seenTutorial: true }, { kind: 'countdown' }));
    }
    case 'countdown':
      if (f.t >= COUNTDOWN_S) {
        commands.push('newGame', 'go');
        return done(enter(f, { kind: 'playing' }));
      }
      if (Math.floor(f.t) !== Math.floor(prevT) || prevT === 0) commands.push('tick');
      return done(f);
    case 'playing':
      return done(input.gameOver ? enter(f, { kind: 'over' }) : f);
    case 'over':
      if (f.t >= RESTART_LOCK_S && input.events.includes('jump')) {
        commands.push('recalibrate');
        return done(enter(f, { kind: 'calibrating' }));
      }
      return done(f);
    default: {
      const _exhaustive: never = p;
      return _exhaustive;
    }
  }
}

/** Seconds left on the countdown, 3..1. */
export const countdownLeft = (flow: Flow): number => Math.max(1, Math.ceil(COUNTDOWN_S - flow.t));
