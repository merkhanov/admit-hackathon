import { features, type Features } from './features.ts';
import { armBusy, framingProblem, GESTURE_IDS, GESTURES, type Calibration, type GestureId } from './gestures.ts';
import type { Landmark, Pose } from './landmarks.ts';

/** A near-miss must hold this long before a hint, so a normal fast move never triggers one. */
export const HOLD_MS = 450;
/** No hint for a gesture right after it ended: the arm passes the near zone on the way down. */
export const QUIET_AFTER_MS = 600;
/** A near-miss survives this long outside the zone, so camera jitter doesn't restart the timer. */
export const NEAR_GRACE_MS = 200;
export const CALIB_MS = 1000;
/** Landmark smoothing factor, 1 = no smoothing. */
export const SMOOTHING = 0.55;

export type TrackerEvent = 'jump' | 'punch' | 'duckStart' | 'duckEnd' | 'leanL' | 'leanR' | 'calibrated';

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
  smooth: Landmark[] | null;
}

export interface GestureReadout {
  p: number;
  phase: 'idle' | 'active';
  suppressed: boolean;
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

const freshGestures = (): Record<GestureId, GestureState> => ({
  jump: idle(), punch: idle(), duck: idle(), leanL: idle(), leanR: idle(),
});
function idle(): GestureState {
  return { phase: 'idle', nearSince: null, nearLostAt: null, lastExit: -Infinity };
}
const startCalibration = (): Stage => ({ kind: 'calibrating', since: null, n: 0, sumY: 0, sumSw: 0 });

export function initTracker(): TrackerState {
  return { stage: startCalibration(), gestures: freshGestures(), smooth: null };
}

/** Forget the neutral pose and learn it again. Called at the start of every round. */
export function recalibrate(state: TrackerState): TrackerState {
  return { ...state, stage: startCalibration() };
}

export const calibration = (state: TrackerState): Calibration | null =>
  state.stage.kind === 'tracking' ? state.stage.calib : null;

function smoothPose(prev: Landmark[] | null, cur: Pose | null): Landmark[] | null {
  if (!cur) return null;
  if (!prev || prev.length !== cur.length) return cur.map((p) => ({ ...p }));
  return cur.map((p, i) => ({
    x: prev[i].x + SMOOTHING * (p.x - prev[i].x),
    y: prev[i].y + SMOOTHING * (p.y - prev[i].y),
    visibility: p.visibility,
  }));
}

/**
 * One frame of recognition: (state, raw landmarks, time in ms, frame aspect) -> new state,
 * gesture events and hints. Pure: the caller owns the state.
 */
export function stepTracker(state: TrackerState, raw: Pose | null, t: number, aspect: number): TrackerOutput {
  const smooth = smoothPose(state.smooth, raw);
  const f = features(smooth, aspect);
  const gestures = structuredClone(state.gestures);
  const events: TrackerEvent[] = [];
  const hints: Hint[] = [];
  const readout: TrackerOutput['readout'] = {};
  const out = (stage: Stage): TrackerOutput => ({
    state: { stage, gestures, smooth }, events, hints, readout, features: f, pose: smooth,
  });

  const frame = framingProblem(f);
  if (frame || !f.present) {
    for (const id of GESTURE_IDS) {
      const g = gestures[id];
      if (g.phase === 'active') {
        g.lastExit = t;
        if (GESTURES[id].held) events.push('duckEnd');
      }
      gestures[id] = { ...idle(), lastExit: g.lastExit };
    }
    hints.push({ kind: 'frame', text: frame ?? 'Не вижу тебя: встань перед камерой' });
    const stage = state.stage.kind === 'calibrating' ? startCalibration() : state.stage;
    return out(stage);
  }

  if (state.stage.kind === 'calibrating') {
    const down = (['L', 'R'] as const).every((s) => !f.arms[s].ok || f.arms[s].raise < -0.4);
    const straight = Math.abs(f.tilt) <= 5;
    if (!down || !straight) {
      hints.push({
        kind: 'calib',
        progress: 0,
        text: !down ? 'Опусти руки: запоминаю исходную позу' : 'Выпрямись, не наклоняйся: запоминаю исходную позу',
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
    hints.push({ kind: 'calib', progress, text: `Стой ровно, руки вниз: калибровка ${Math.round(progress * 100)}%` });
    return out(next);
  }

  const calib = state.stage.calib;
  const busy = armBusy(f);
  for (const id of GESTURE_IDS) {
    const spec = GESTURES[id];
    const g = gestures[id];
    const suppressed = (id === 'leanL' || id === 'leanR') && busy;
    const m = suppressed ? { p: 0 } : spec.measure(f, calib);

    if (g.phase === 'idle' && m.p >= 1) {
      g.phase = 'active';
      g.nearSince = null;
      g.nearLostAt = null;
      events.push(id === 'duck' ? 'duckStart' : id);
    } else if (g.phase === 'active' && m.p < spec.exitP) {
      g.phase = 'idle';
      g.lastExit = t;
      if (spec.held) events.push('duckEnd');
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
      suppressed,
      hinting,
      nearFor: g.nearSince === null ? 0 : t - g.nearSince,
    };
  }

  hints.sort((a, b) => (b.kind === 'fix' ? b.p : 0) - (a.kind === 'fix' ? a.p : 0));
  return out(state.stage);
}
