import { t as tr } from '../i18n.ts';
import { guardArms, type ArmGuard } from './armGuard.ts';
import { features, type Features } from './features.ts';
import { armsFitLimit, framingProblem, GESTURE_IDS, GESTURES, type Calibration, type GestureId } from './gestures.ts';
import type { Landmark, Pose } from './landmarks.ts';

/** A near-miss must hold this long before a hint, so a normal fast move never triggers one. */
export const HOLD_MS = 450;
/** No hint for a gesture right after it ended: the arm passes the near zone on the way down. */
export const QUIET_AFTER_MS = 600;
/** A near-miss survives this long outside the zone, so camera jitter doesn't restart the timer. */
export const NEAR_GRACE_MS = 200;
export const CALIB_MS = 1000;
/**
 * Landmark smoothing: a One Euro filter (Casiez et al., 2012). Holding still it smooths hard, so a held
 * pose doesn't shake; moving fast it barely smooths, so a quick arm swing isn't dragged through the
 * middle of its arc. Tuned on 1,000 frames of real dancing against MediaPipe's most accurate model.
 */
export const SMOOTH_MIN_CUTOFF_HZ = 1.5;
export const SMOOTH_BETA = 2;
const SMOOTH_SPEED_CUTOFF_HZ = 1;

export type TrackerEvent = 'jump' | 'calibrated';

export type Hint =
  | { kind: 'frame'; text: string }
  | { kind: 'calib'; text: string; progress: number }
  | { kind: 'fix'; gesture: GestureId; p: number; text: string };

interface GestureState {
  phase: 'idle' | 'active';
  nearSince: number | null;
  nearLostAt: number | null;
  lastExit: number;
}

type Stage =
  | { kind: 'calibrating'; since: number | null; n: number; sumY: number; sumSw: number }
  | { kind: 'tracking'; calib: Calibration };

export interface TrackerState {
  stage: Stage;
  gestures: Record<GestureId, GestureState>;
  /** Arm joints checked for swaps, jumps and occlusion before smoothing. */
  guard: ArmGuard | null;
  smooth: Landmark[] | null;
  /** Filtered speed of each landmark (frame heights per second), and when the last frame came. */
  speed: { x: number; y: number }[] | null;
  lastT: number | null;
}

export interface GestureReadout {
  p: number;
  phase: 'idle' | 'active';
  hinting: boolean;
  /** Milliseconds spent in the near zone so far. */
  nearFor: number;
}

export interface TrackerOutput {
  state: TrackerState;
  events: TrackerEvent[];
  /** Sorted by importance: framing and calibration first, then the closest near-miss. */
  hints: Hint[];
  readout: Partial<Record<GestureId, GestureReadout>>;
  features: Features;
  /** Smoothed landmarks, for drawing. */
  pose: Pose | null;
}

const freshGestures = (): Record<GestureId, GestureState> => ({ jump: idle() });
function idle(): GestureState {
  return { phase: 'idle', nearSince: null, nearLostAt: null, lastExit: -Infinity };
}
const startCalibration = (): Stage => ({ kind: 'calibrating', since: null, n: 0, sumY: 0, sumSw: 0 });

export function initTracker(): TrackerState {
  return { stage: startCalibration(), gestures: freshGestures(), guard: null, smooth: null, speed: null, lastT: null };
}

/** Forget the neutral pose and learn it again. Called at the start of every round. */
export function recalibrate(state: TrackerState): TrackerState {
  return { ...state, stage: startCalibration() };
}

export const calibration = (state: TrackerState): Calibration | null =>
  state.stage.kind === 'tracking' ? state.stage.calib : null;

/** Visibility is smoothed too, so an arm at the edge of what the model sees doesn't flicker in and out. */
const VISIBILITY_SMOOTHING = 0.5;

/** Share of the way to the new value for a low-pass filter at `cutoff` Hz, `dt` seconds after the last frame. */
const lowPass = (cutoff: number, dt: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));

interface Smoothed { pose: Landmark[] | null; speed: { x: number; y: number }[] | null }

function smoothPose(prev: Landmark[] | null, prevSpeed: { x: number; y: number }[] | null, cur: Pose | null, dt: number, aspect: number): Smoothed {
  if (!cur) return { pose: null, speed: null };
  if (!prev || !prevSpeed || prev.length !== cur.length) return { pose: cur.map((p) => ({ ...p })), speed: cur.map(() => ({ x: 0, y: 0 })) };
  const ds = lowPass(SMOOTH_SPEED_CUTOFF_HZ, dt);
  const speed = cur.map((p, i) => ({
    x: prevSpeed[i].x + ds * (((p.x - prev[i].x) * aspect) / dt - prevSpeed[i].x),
    y: prevSpeed[i].y + ds * ((p.y - prev[i].y) / dt - prevSpeed[i].y),
  }));
  const pose = cur.map((p, i) => {
    const a = lowPass(SMOOTH_MIN_CUTOFF_HZ + SMOOTH_BETA * Math.hypot(speed[i].x, speed[i].y), dt);
    return {
      x: prev[i].x + a * (p.x - prev[i].x),
      y: prev[i].y + a * (p.y - prev[i].y),
      visibility: p.visibility === undefined || prev[i].visibility === undefined
        ? p.visibility
        : prev[i].visibility + VISIBILITY_SMOOTHING * (p.visibility - prev[i].visibility),
    };
  });
  return { pose, speed };
}

/**
 * One frame of recognition: (state, raw landmarks, time in ms, frame aspect) -> new state,
 * gesture events and hints. Pure: the caller owns the state.
 */
export function stepTracker(state: TrackerState, raw: Pose | null, t: number, aspect: number): TrackerOutput {
  // Time since the last frame, kept sane across tab switches and the first frame.
  const dt = state.lastT === null ? 1 / 30 : Math.min(0.25, Math.max(1 / 240, (t - state.lastT) / 1000));
  const calibSw = state.stage.kind === 'tracking' ? state.stage.calib.sw : null;
  const { pose: guarded, guard } = guardArms(state.guard, raw, t, aspect, calibSw);
  const filtered = smoothPose(state.smooth, state.speed, guarded, dt, aspect);
  const smooth = filtered.pose;
  const speed = filtered.speed;
  const lastT = t;
  const f = features(smooth, aspect);
  const gestures = structuredClone(state.gestures);
  const events: TrackerEvent[] = [];
  const hints: Hint[] = [];
  const readout: TrackerOutput['readout'] = {};
  const out = (stage: Stage): TrackerOutput => ({
    state: { stage, gestures, guard, smooth, speed, lastT }, events, hints, readout, features: f, pose: smooth,
  });

  const frame = framingProblem(f);
  if (frame || !f.present) {
    for (const id of GESTURE_IDS) {
      const g = gestures[id];
      if (g.phase === 'active') g.lastExit = t;
      gestures[id] = { ...idle(), lastExit: g.lastExit };
    }
    hints.push({ kind: 'frame', text: frame ?? tr('frame.absent') });
    const stage = state.stage.kind === 'calibrating' ? startCalibration() : state.stage;
    return out(stage);
  }

  if (state.stage.kind === 'calibrating') {
    const down = (['L', 'R'] as const).every((s) => !f.arms[s].ok || f.arms[s].raise < -0.4);
    const straight = Math.abs(f.tilt) <= 5;
    const fits = f.sw <= armsFitLimit(f.aspect);
    if (!down || !straight || !fits) {
      hints.push({
        kind: 'calib',
        progress: 0,
        text: !fits
          ? tr('calib.stepBack')
          : !down ? tr('calib.armsDown') : tr('calib.straight'),
      });
      return out(startCalibration());
    }
    const s = state.stage;
    const since = s.since ?? t;
    const next = { kind: 'calibrating' as const, since, n: s.n + 1, sumY: s.sumY + f.midY, sumSw: s.sumSw + f.sw };
    const progress = (t - since) / CALIB_MS;
    if (progress >= 1) {
      events.push('calibrated');
      return out({ kind: 'tracking', calib: { midY: next.sumY / next.n, sw: next.sumSw / next.n } });
    }
    hints.push({ kind: 'calib', progress, text: tr('calib.progress', { pct: Math.round(progress * 100) }) });
    return out(next);
  }

  for (const id of GESTURE_IDS) {
    const spec = GESTURES[id];
    const g = gestures[id];
    const m = spec.measure(f);

    if (g.phase === 'idle' && m.p >= 1) {
      g.phase = 'active';
      g.nearSince = null;
      g.nearLostAt = null;
      events.push(id);
    } else if (g.phase === 'active' && m.p < spec.exitP) {
      g.phase = 'idle';
      g.lastExit = t;
    }

    let hinting = false;
    const nearHint = g.phase === 'idle' && m.p >= spec.nearP && m.p < 1 ? m.hint : undefined;
    if (nearHint !== undefined) {
      g.nearSince ??= t;
      g.nearLostAt = null;
      if (t - g.nearSince >= HOLD_MS && t - g.lastExit >= QUIET_AFTER_MS) {
        hinting = true;
        hints.push({ kind: 'fix', gesture: id, p: m.p, text: nearHint });
      }
    } else if (g.nearSince !== null) {
      g.nearLostAt ??= t;
      if (g.phase === 'active' || t - g.nearLostAt > NEAR_GRACE_MS) {
        g.nearSince = null;
        g.nearLostAt = null;
      }
    }

    readout[id] = {
      p: m.p,
      phase: g.phase,
      hinting,
      nearFor: g.nearSince === null ? 0 : t - g.nearSince,
    };
  }

  hints.sort((a, b) => (b.kind === 'fix' ? b.p : 0) - (a.kind === 'fix' ? a.p : 0));
  return out(state.stage);
}
