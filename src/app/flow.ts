import type { MoveId } from '../dance/moves.ts';
import type { TrackerEvent } from '../pose/tracker.ts';

export type Phase =
  | { kind: 'intro' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'calibrating' }
  | { kind: 'warmup'; step: number; held: number; doneAt: number | null; skipped: boolean }
  | { kind: 'countdown' }
  | { kind: 'dancing' }
  | { kind: 'results'; lean: LeanSwitch };

/** Leaning to pick the next song on the results screen: a lean must be held, then released before the next one. */
export interface LeanSwitch {
  held: number;
  armed: boolean;
}

export interface Flow {
  phase: Phase;
  /** Seconds since the current phase started. */
  t: number;
  seenWarmup: boolean;
}

export type FlowCommand = 'recalibrate' | 'stepDone' | 'stepSkipped' | 'tick' | 'startSong' | 'finish' | 'nextSong' | 'prevSong';

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
/**
 * Shoulder tilt that picks another song on the results screen, and how long to hold it.
 * Raising one hand hikes that shoulder by up to ~12°, so a restart gesture never switches songs.
 */
export const LEAN_SWITCH_DEG = 18;
export const LEAN_SWITCH_S = 0.5;
/** Back below this tilt before the next lean counts. */
export const LEAN_RELEASE_DEG = 8;

export const initFlow = (): Flow => ({ phase: { kind: 'intro' }, t: 0, seenWarmup: false });

const enter = (flow: Flow, phase: Phase): Flow => ({ ...flow, phase, t: 0 });
const warmupStep = (step: number): Phase => ({ kind: 'warmup', step, held: 0, doneAt: null, skipped: false });

export const startRequested = (flow: Flow): Flow => enter(flow, { kind: 'loading' });
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
  /** Shoulder tilt in degrees, positive = leaning to the player's own left. Null when nobody is visible. */
  tilt?: number | null;
  /** The song's music is ready to play. The countdown waits for it. Defaults to true. */
  songReady?: boolean;
}

const results = (): Phase => ({ kind: 'results', lean: { held: 0, armed: true } });

/** Pure step of the lean gesture: -1 = leaned left (previous song), 1 = right (next), 0 = nothing yet. */
export function stepLean(lean: LeanSwitch, tilt: number | null, dt: number): { lean: LeanSwitch; fired: -1 | 0 | 1 } {
  const t = tilt ?? 0;
  if (!lean.armed) return { lean: { held: 0, armed: Math.abs(t) < LEAN_RELEASE_DEG }, fired: 0 };
  if (Math.abs(t) < LEAN_SWITCH_DEG) return { lean: { held: 0, armed: true }, fired: 0 };
  const held = lean.held + dt;
  if (held < LEAN_SWITCH_S) return { lean: { held, armed: true }, fired: 0 };
  // Leaning to one's own left is the screen's left in the mirrored view: the previous song.
  return { lean: { held: 0, armed: false }, fired: t > 0 ? -1 : 1 };
}

/** Pure step of the screen sequence: calibration, warm-up, countdown, song, results. */
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
      if (f.t >= COUNTDOWN_S && input.songReady === false) return done({ ...f, t: COUNTDOWN_S });
      if (f.t >= COUNTDOWN_S) {
        commands.push('startSong');
        return done(enter(f, { kind: 'dancing' }));
      }
      if (Math.floor(f.t) !== Math.floor(prevT) || prevT === 0) commands.push('tick');
      return done(f);
    case 'dancing':
      if (!input.songOver) return done(f);
      commands.push('finish');
      return done(enter(f, results()));
    case 'results': {
      if (f.t < RESTART_LOCK_S) return done(f);
      if (input.events.includes('jump')) {
        commands.push('recalibrate');
        return done(enter(f, { kind: 'calibrating' }));
      }
      const r = stepLean(p.lean, input.tilt ?? null, input.dt);
      if (r.fired) commands.push(r.fired < 0 ? 'prevSong' : 'nextSong');
      return done({ ...f, phase: { ...p, lean: r.lean } });
    }
    default: {
      const _exhaustive: never = p;
      return _exhaustive;
    }
  }
}

export const countdownLeft = (flow: Flow): number => Math.max(1, Math.ceil(COUNTDOWN_S - flow.t));
