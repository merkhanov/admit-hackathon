import type { MoveId } from '../dance/moves.ts';
import type { TrackerEvent } from '../pose/tracker.ts';

export type Phase =
  | { kind: 'intro' }
  | { kind: 'lobby' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'calibrating' }
  | { kind: 'warmup'; step: number; held: number; doneAt: number | null; skipped: boolean }
  | { kind: 'countdown' }
  | { kind: 'dancing' }
  | { kind: 'results' };

export interface Flow {
  phase: Phase;
  /** Seconds since the current phase started. */
  t: number;
  seenWarmup: boolean;
}

export type FlowCommand = 'recalibrate' | 'stepDone' | 'stepSkipped' | 'tick' | 'startSong' | 'finish' | 'beginCalibration';

export interface WarmupStep {
  move: MoveId;
  title: string;
  text: string;
}

/** Three poses that teach the mirror rule before the music starts. */
export const WARMUP: readonly WarmupStep[] = [
  { move: 'wings', title: 'Разминка: самолёт', text: 'Разведи прямые руки в стороны, как тренер.' },
  { move: 'leftUp', title: 'Танцуй как в зеркале', text: 'Тренер поднял руку на левой стороне экрана. Подними свою левую руку.' },
  { move: 'up', title: 'Обе руки вверх', text: 'Вытяни обе руки над головой. Поехали!' },
];

/** A warm-up pose counts once held above this score for WARMUP_HOLD_S. */
export const WARMUP_PASS = 0.8;
export const WARMUP_HOLD_S = 0.4;
export const STEP_PAUSE_S = 1.0;
/** A warm-up pose that isn't reached by then moves on, so it can't block the song. */
export const STEP_TIMEOUT_S = 15;
export const STEP_WARN_S = 8;
export const COUNTDOWN_S = 3;
/** The results screen ignores gestures this long, so the last dance move doesn't restart the song. */
export const RESTART_LOCK_S = 3;

export const initFlow = (): Flow => ({ phase: { kind: 'intro' }, t: 0, seenWarmup: false });

const enter = (flow: Flow, phase: Phase): Flow => ({ ...flow, phase, t: 0 });
const warmupStep = (step: number): Phase => ({ kind: 'warmup', step, held: 0, doneAt: null, skipped: false });

export const startRequested = (flow: Flow): Flow => enter(flow, { kind: 'loading' });
export const enterLobby = (flow: Flow): Flow => enter(flow, { kind: 'lobby' });
/** Results × button: back to the main menu. */
export const enterIntro = (flow: Flow): Flow => enter(flow, { kind: 'intro' });
export const cameraFailed = (flow: Flow, message: string): Flow => enter(flow, { kind: 'error', message });
export const cameraReady = (flow: Flow): { flow: Flow; commands: FlowCommand[] } => ({
  flow: enter(flow, { kind: 'calibrating' }),
  commands: ['recalibrate'],
});

export interface FlowInput {
  events: readonly TrackerEvent[];
  dt: number;
  /** How well the body matches the current warm-up pose, 0..1, or null when nobody is visible. */
  poseScore: number | null;
  songOver: boolean;
  /** Lobby command: 'beginCalibration' moves lobby → calibrating. Also accepted as 3rd arg to stepFlow. */
  command?: FlowCommand;
}

/** Pure step of the screen sequence: calibration, warm-up, countdown, song, results. */
export function stepFlow(flow: Flow, input: FlowInput, command?: FlowCommand): { flow: Flow; commands: FlowCommand[] } {
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
    case 'lobby': {
      const cmd = command ?? input.command;
      if (cmd === 'beginCalibration') {
        commands.push('recalibrate');
        return done(enter(f, { kind: 'calibrating' }));
      }
      return done(f);
    }
    case 'calibrating':
      if (!input.events.includes('calibrated')) return done(f);
      return done(f.seenWarmup ? enter(f, { kind: 'countdown' }) : enter(f, warmupStep(0)));
    case 'warmup': {
      if (p.doneAt === null) {
        const held = (input.poseScore ?? 0) >= WARMUP_PASS ? p.held + input.dt : 0;
        if (held >= WARMUP_HOLD_S) {
          commands.push('stepDone');
          return done({ ...f, phase: { ...p, held, doneAt: f.t } });
        }
        if (f.t >= STEP_TIMEOUT_S) {
          commands.push('stepSkipped');
          return done({ ...f, phase: { ...p, held, doneAt: f.t, skipped: true } });
        }
        return done({ ...f, phase: { ...p, held } });
      }
      if (f.t - p.doneAt < STEP_PAUSE_S) return done(f);
      if (p.step + 1 < WARMUP.length) return done(enter(f, warmupStep(p.step + 1)));
      return done(enter({ ...f, seenWarmup: true }, { kind: 'countdown' }));
    }
    case 'countdown':
      if (f.t >= COUNTDOWN_S) {
        commands.push('startSong');
        return done(enter(f, { kind: 'dancing' }));
      }
      if (Math.floor(f.t) !== Math.floor(prevT) || prevT === 0) commands.push('tick');
      return done(f);
    case 'dancing':
      if (!input.songOver) return done(f);
      commands.push('finish');
      return done(enter(f, { kind: 'results' }));
    case 'results':
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

export const countdownLeft = (flow: Flow): number => Math.max(1, Math.ceil(COUNTDOWN_S - flow.t));
