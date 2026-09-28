import './style.css';
import { cameraFailed, cameraReady, initFlow, startRequested, stepFlow, WARMUP, WARMUP_PASS, type Flow, type FlowCommand } from './app/flow.ts';
import { insertScore, loadLeaderboard, saveLeaderboard, type ScoreEntry } from './app/leaderboard.ts';
import { adviceLines, logVerdict, partAccuracy, type MistakeLog } from './app/summary.ts';
import { renderSong, SongPlayer } from './audio/music.ts';
import { Sfx } from './audio/sfx.ts';
import { newDance, stars, stepDance, type DanceState, type Verdict } from './dance/dance.ts';
import { bodyAngles, evaluate, type MoveEval } from './dance/judge.ts';
import { MOVES, type MoveTarget } from './dance/moves.ts';
import { beatLength, SONG, songDuration, stepAt } from './dance/song.ts';
import { CameraError, downloadProgress, preloadRecognition, startCamera, type PoseSource } from './pose/camera.ts';
import { startDemoSource } from './pose/demoSource.ts';
import { calibration, initTracker, recalibrate, stepTracker, type TrackerEvent, type TrackerOutput } from './pose/tracker.ts';
import { FlatStage } from './stage/flatStage.ts';
import { Stage, type StageView } from './stage/stage.ts';
import { Hud, type Banner } from './ui/hud.ts';
import { PoseView } from './ui/pip.ts';
import { Screens, type RoundResult } from './ui/screens.ts';

/** How long a move's verdict and its correction stay on screen. */
const VERDICT_S = 1.8;
/** The coach starts moving to the next pose this early, so it lands on the beat. */
const COACH_LEAD_S = 0.12;
/** In the warm-up, a correction appears after this long without matching the pose. */
const WARMUP_HINT_AFTER_S = 1.2;

function canvas(id: string): HTMLCanvasElement {
  const node = document.getElementById(id);
  if (!(node instanceof HTMLCanvasElement)) throw new Error(`Missing canvas #${id}`);
  return node;
}

/** The 3D stage, or the flat 2D one when WebGL is unavailable. */
function createStage(target: HTMLCanvasElement): StageView {
  try {
    return new Stage(target);
  } catch {
    // A canvas that tried WebGL can't switch to 2D, so the fallback draws on a fresh one.
    const fresh = document.createElement('canvas');
    fresh.id = target.id;
    target.replaceWith(fresh);
    return new FlatStage(fresh);
  }
}

const screensRoot = document.getElementById('screens');
if (!screensRoot) throw new Error('Missing #screens');

const demo = new URLSearchParams(location.search).has('demo');
const sfx = new Sfx();
const stage = createStage(canvas('scene'));
const poseView = new PoseView(canvas('pose'));
const hud = new Hud();
const screens = new Screens(screensRoot, () => void start());

// Start the ~17 MB model download and the music render right away, while the player reads the intro.
if (!demo) preloadRecognition().catch(() => undefined);
let songBuffer: AudioBuffer | null = null;
renderSong(SONG).then((b) => { songBuffer = b; }, () => undefined);

let flow: Flow = initFlow();
let tracker = initTracker();
let lastOut: TrackerOutput | null = null;
let source: PoseSource | null = null;
let player: SongPlayer | null = null;
let dance: DanceState | null = null;
let mistakes: MistakeLog = {};
let verdict: { v: Verdict; until: number } | null = null;
let liveMatch: MoveEval | null = null;
let result: RoundResult | null = null;
let clock = 0;
/** When the current warm-up pose started going unmatched. */
let warmupMissSince = 0;

const songTime = () => (player && flow.phase.kind === 'dancing' ? player.time() : -1);

/** The move the player should be doing right now: the warm-up pose or the song's current step. */
function currentTarget(): MoveTarget | null {
  const p = flow.phase;
  if (p.kind === 'warmup') return MOVES[WARMUP[p.step].move];
  if (p.kind !== 'dancing') return null;
  const i = stepAt(SONG, songTime());
  return i >= 0 ? MOVES[SONG.steps[i].move] : null;
}

async function start(): Promise<void> {
  if (flow.phase.kind !== 'intro' && flow.phase.kind !== 'error') return;
  player = new SongPlayer(sfx.unlock());
  flow = startRequested(flow);
  try {
    source = demo ? startDemoSource(currentTarget) : await startCamera();
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
        break;
      case 'stepDone': sfx.play('step'); break;
      case 'stepSkipped': sfx.play('hint'); break;
      case 'tick': sfx.play('tick'); break;
      case 'startSong':
        dance = newDance();
        mistakes = {};
        verdict = null;
        player?.play(songBuffer);
        sfx.play('go');
        break;
      case 'finish':
        finishRound();
        break;
      default: {
        const _exhaustive: never = c;
        void _exhaustive;
      }
    }
  }
}

function finishRound(): void {
  player?.stop();
  const d = dance ?? newDance();
  const entry: ScoreEntry = { score: d.points, stars: stars(d.points, SONG), at: new Date().toISOString() };
  let board: ScoreEntry[] = [entry];
  let place = 0;
  try {
    const r = insertScore(loadLeaderboard(), entry);
    board = r.board;
    place = r.place;
    saveLeaderboard(board);
  } catch {
    // Storage can be unavailable (private mode). The result still shows.
  }
  result = {
    points: d.points, stars: entry.stars, counts: d.counts, maxCombo: d.maxCombo,
    accuracy: partAccuracy(d), advice: adviceLines(mistakes), place, board, entry,
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
  if (kind === 'dancing' && verdict && clock < verdict.until) {
    const v = verdict.v;
    if (!v.hint) return { tone: 'good', label: 'Идеально', text: `${MOVES[v.move].name}: точно как у тренера!` };
    return v.rating === 'miss'
      ? { tone: 'miss', label: 'Мимо', text: v.hint }
      : { tone: 'fix', label: 'Почти', text: v.hint, progress: v.score };
  }
  if (kind === 'warmup' && liveMatch?.worst && clock - warmupMissSince > WARMUP_HINT_AFTER_S) {
    return { tone: 'fix', label: 'Поправь', text: liveMatch.worst.hint, progress: liveMatch.score };
  }
  if (kind === 'results') {
    // The hand-up gesture's own near-miss hint: "raise your hand higher to start".
    const fix = hints.find((h) => h.kind === 'fix');
    if (fix && fix.kind === 'fix') return { tone: 'fix', label: 'Почти', text: fix.text, progress: fix.p };
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
    }
  }
  const body = lastOut ? bodyAngles(lastOut.features, calibration(tracker)) : null;
  const target = currentTarget();
  liveMatch = target && body ? evaluate(target, body) : null;
  if (flow.phase.kind !== 'warmup' || (liveMatch?.score ?? 0) >= WARMUP_PASS) warmupMissSince = clock;

  const t = songTime();
  const step = stepFlow(flow, {
    events,
    dt,
    poseScore: liveMatch?.score ?? null,
    songOver: flow.phase.kind === 'dancing' && t >= songDuration(SONG),
  });
  flow = step.flow;
  runCommands(step.commands);

  if (flow.phase.kind === 'dancing' && dance) {
    const r = stepDance(dance, SONG, songTime(), body);
    dance = r.state;
    for (const v of r.verdicts) {
      verdict = { v, until: clock + VERDICT_S };
      mistakes = logVerdict(mistakes, v);
      hud.showVerdict(v.rating);
      stage.react(v.rating);
      sfx.play(v.rating);
    }
  }

  const kind = flow.phase.kind;
  const dancing = kind === 'dancing';
  const coachIndex = dancing ? stepAt(SONG, songTime() + COACH_LEAD_S) : -1;
  const coachTarget = kind === 'warmup' ? target : coachIndex >= 0 ? MOVES[SONG.steps[coachIndex].move] : null;
  stage.draw({ target: coachTarget, beat: dancing ? Math.max(0, songTime()) / beatLength(SONG) : 0, playing: dancing }, dt);

  const cameraOn = source !== null && kind !== 'intro' && kind !== 'loading' && kind !== 'error';
  hud.showPip(cameraOn);
  if (cameraOn) poseView.draw(source?.video ?? null, lastOut, kind === 'warmup' || dancing ? target : null, liveMatch);
  hud.showDance(dancing ? dance : null, SONG);
  hud.showPictos(dancing ? SONG : null, songTime());
  if (!dancing) hud.hideVerdict();
  hud.showBanner(bannerFor());
  const calib = lastOut?.hints.find((h) => h.kind === 'calib');
  screens.update({
    flow,
    calibProgress: calib && calib.kind === 'calib' ? calib.progress : 0,
    loadProgress: downloadProgress(),
    result,
    songTitle: SONG.title,
    demo,
  });
}

let prev = performance.now();
function loop(now: number): void {
  const dt = Math.min(0.1, (now - prev) / 1000);
  prev = now;
  frame(now, dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
