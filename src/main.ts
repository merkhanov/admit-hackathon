import './style.css';
import { cameraFailed, cameraReady, initFlow, startRequested, stepFlow, TUTORIAL, type Flow, type FlowCommand } from './app/flow.ts';
import { insertScore, loadLeaderboard, saveLeaderboard, type ScoreEntry } from './app/leaderboard.ts';
import { adviceLines, countHintOnsets, emptyHintCounts } from './app/summary.ts';
import { Sfx } from './audio/sfx.ts';
import { newGame, stepGame, type GameNote, type GameState } from './game/game.ts';
import { GameRenderer } from './game/render.ts';
import type { SceneRenderer } from './game/sceneRenderer.ts';
import { ThreeRenderer } from './game/three/renderer3d.ts';
import { CameraError, downloadProgress, preloadRecognition, startCamera, type PoseSource } from './pose/camera.ts';
import { startDemoSource } from './pose/demoSource.ts';
import type { GestureId } from './pose/gestures.ts';
import { calibration, initTracker, recalibrate, stepTracker, type TrackerEvent, type TrackerOutput } from './pose/tracker.ts';
import { Hud, type Banner } from './ui/hud.ts';
import { PoseView } from './ui/pip.ts';
import { Screens, type RoundResult } from './ui/screens.ts';

const MISS_BANNER_S = 2.2;

function canvas(id: string): HTMLCanvasElement {
  const node = document.getElementById(id);
  if (!(node instanceof HTMLCanvasElement)) throw new Error(`Missing canvas #${id}`);
  return node;
}

const screensRoot = document.getElementById('screens');
if (!screensRoot) throw new Error('Missing #screens');

const demo = new URLSearchParams(location.search).has('demo');
const sfx = new Sfx();
const renderer = createRenderer(canvas('scene'));
const poseView = new PoseView(canvas('pose'));
const hud = new Hud();
const screens = new Screens(screensRoot, () => void start());
// Start the ~17 MB download right away, so it overlaps with the player reading the intro.
if (!demo) preloadRecognition().catch(() => undefined);

/** The 3D scene, or the flat 2D one when WebGL is unavailable. */
function createRenderer(target: HTMLCanvasElement): SceneRenderer {
  try {
    return new ThreeRenderer(target);
  } catch {
    // A canvas that tried WebGL can't switch to 2D, so the fallback draws on a fresh one.
    const fresh = document.createElement('canvas');
    fresh.id = target.id;
    target.replaceWith(fresh);
    return new GameRenderer(fresh);
  }
}

/** A game with no obstacles: the runner reacts to gestures during calibration, tutorial and countdown. */
function practiceGame(): GameState {
  return { ...newGame(1), spawnIn: Number.POSITIVE_INFINITY };
}

let flow: Flow = initFlow();
let tracker = initTracker();
let lastOut: TrackerOutput | null = null;
let source: PoseSource | null = null;
let game = practiceGame();
let hintShown: ReadonlySet<GestureId> = new Set();
let hintCounts = emptyHintCounts();
let miss: { text: string; until: number } | null = null;
let result: RoundResult | null = null;
let clock = 0;

async function start(): Promise<void> {
  if (flow.phase.kind !== 'intro' && flow.phase.kind !== 'error') return;
  sfx.unlock();
  flow = startRequested(flow);
  try {
    source = demo ? startDemoSource() : await startCamera();
    const r = cameraReady(flow);
    flow = r.flow;
    runCommands(r.commands);
  } catch (err) {
    flow = cameraFailed(flow, err instanceof CameraError ? err.userMessage : String(err));
  }
}

function runCommands(commands: readonly FlowCommand[]): void {
  for (const c of commands) {
    switch (c) {
      case 'recalibrate':
        tracker = recalibrate(tracker);
        game = practiceGame();
        break;
      case 'newGame':
        game = newGame((Date.now() >>> 0) || 1);
        hintCounts = emptyHintCounts();
        miss = null;
        break;
      case 'stepDone': sfx.play('step'); break;
      case 'stepSkipped': sfx.play('hint'); break;
      case 'tick': sfx.play('tick'); break;
      case 'go': sfx.play('go'); break;
      default: {
        const _exhaustive: never = c;
        void _exhaustive;
      }
    }
  }
}

function playNotes(notes: readonly GameNote[]): void {
  for (const n of notes) {
    switch (n.kind) {
      case 'hit':
        sfx.play('hit');
        miss = { text: n.text, until: clock + MISS_BANNER_S };
        break;
      case 'over': break;
      default: sfx.play(n.kind);
    }
  }
}

function finishRound(): void {
  const entry: ScoreEntry = { score: Math.round(game.score), coins: game.coins, at: new Date().toISOString() };
  let board: ScoreEntry[] = [entry];
  let place = 0;
  try {
    const r = insertScore(loadLeaderboard(), entry);
    board = r.board;
    place = r.place;
    saveLeaderboard(board);
  } catch {
    // Storage can be unavailable (private mode). The round result still shows.
  }
  result = {
    score: entry.score, coins: game.coins, distance: game.distance, cleared: game.stats.cleared,
    place, board, entry, advice: adviceLines(hintCounts, game.stats),
  };
  sfx.play(place === 0 ? 'record' : 'over');
}

function bannerFor(): Banner | null {
  const kind = flow.phase.kind;
  if (!lastOut || kind === 'intro' || kind === 'loading' || kind === 'error') return null;
  const hints = lastOut.hints;
  const frame = hints.find((h) => h.kind === 'frame');
  if (frame) return { tone: 'frame', label: 'Поправь кадр', text: frame.text };
  if (kind === 'calibrating') {
    const c = hints.find((h) => h.kind === 'calib');
    return c && c.kind === 'calib' ? { tone: 'calib', label: 'Калибровка', text: c.text, progress: c.progress } : null;
  }
  if (kind === 'over') return null;
  if (miss && clock < miss.until && kind === 'playing') return { tone: 'miss', label: 'Ошибка', text: miss.text };
  const wanted = flow.phase.kind === 'tutorial' ? TUTORIAL[flow.phase.step].gesture : null;
  for (const h of hints) {
    if (h.kind === 'fix' && (wanted === null || h.gesture === wanted)) return { tone: 'fix', label: 'Почти!', text: h.text, progress: h.p };
  }
  return null;
}

function frame(now: number, dt: number): void {
  clock += dt;
  let events: TrackerEvent[] = [];
  if (source) {
    const raw = source.read(now);
    if (raw !== undefined) {
      lastOut = stepTracker(tracker, raw, now, source.aspect());
      tracker = lastOut.state;
      events = lastOut.events;
      const onsets = countHintOnsets(hintShown, lastOut.hints, hintCounts);
      const appeared = [...onsets.shown].some((id) => !hintShown.has(id));
      hintShown = onsets.shown;
      if (flow.phase.kind === 'playing') hintCounts = onsets.counts;
      if (appeared && (flow.phase.kind === 'playing' || flow.phase.kind === 'tutorial')) sfx.play('hint');
    }
  }

  const step = stepFlow(flow, { events, dt, gameOver: game.status === 'over' });
  const roundEnded = flow.phase.kind === 'playing' && step.flow.phase.kind === 'over';
  flow = step.flow;
  runCommands(step.commands);
  if (roundEnded) finishRound();

  const kind = flow.phase.kind;
  if (kind === 'calibrating' || kind === 'tutorial' || kind === 'countdown' || kind === 'playing') {
    const r = stepGame(game, events, dt);
    game = r.state;
    renderer.handle(r.notes);
    playNotes(r.notes);
  }

  renderer.draw(game, dt);
  const cameraOn = source !== null && kind !== 'intro' && kind !== 'loading' && kind !== 'error';
  hud.showPip(cameraOn);
  if (cameraOn) poseView.draw(source?.video ?? null, lastOut, calibration(tracker));
  hud.showGame(kind === 'playing' ? game : null);
  hud.showBanner(bannerFor());
  const calib = lastOut?.hints.find((h) => h.kind === 'calib');
  screens.update({ flow, calibProgress: calib && calib.kind === 'calib' ? calib.progress : 0, loadProgress: downloadProgress(), result, demo });
}

let prev = performance.now();
function loop(now: number): void {
  const dt = Math.min(0.1, (now - prev) / 1000);
  prev = now;
  frame(now, dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
