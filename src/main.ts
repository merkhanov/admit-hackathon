import './style.css';
import { cameraFailed, cameraReady, enterIntro, enterLobby, initFlow, startRequested, stepFlow, WARMUP, WARMUP_PASS, type Flow, type FlowCommand } from './app/flow.ts';
import { loadLeaderboard, recordScore, type ScoreEntry } from './app/leaderboard.ts';
import { adviceLines, logVerdict, partAccuracy, type MistakeLog } from './app/summary.ts';
import { Tracks, type Track } from './app/tracks.ts';
import { SongPlayer } from './audio/music.ts';
import { Sfx } from './audio/sfx.ts';
import { newDance, stars, stepDance, type DanceState, type Verdict } from './dance/dance.ts';
import { bodyAngles, evaluate, type MoveEval } from './dance/judge.ts';
import { MOVES, moveName, type MoveTarget } from './dance/moves.ts';
import { songClipSeconds } from './dance/mocap.ts';
import { poseAt } from './dance/motion.ts';
import { beatLength, songDuration } from './dance/song.ts';
import { DEFAULT_SONG, songInfo, songTitle, type SongId } from './dance/songs.ts';
import { detectLang, onLangChange, savedLang, setLang, t } from './i18n.ts';
import { applyPageText } from './ui/lang.ts';
import { CameraError, downloadProgress, preloadRecognition, startCamera, type PoseSource } from './pose/camera.ts';
import { startDemoSource } from './pose/demoSource.ts';
import { distanceProblem } from './pose/gestures.ts';
import { calibration, initTracker, recalibrate, stepTracker, type TrackerEvent, type TrackerOutput } from './pose/tracker.ts';
import { FlatStage } from './stage/flatStage.ts';
import { Stage, type CrewMember, type StageView } from './stage/stage.ts';
import { themeFor } from './stage/themes.ts';
import { Hud, type Banner } from './ui/hud.ts';
import { Scoreboard } from './ui/scoreboard.ts';
import { MPManager } from './multiplayer/manager.ts';
import { othersReady } from './multiplayer/session.ts';
import { packPose, unpackPose } from './multiplayer/pose.ts';
import type { CompactPose } from './multiplayer/types.ts';
import { loadPlayerName, makePlayerId } from './multiplayer/persistence.ts';
import { PeerJSTransport } from './multiplayer/peerjs.ts';
import { WebRTCTransport } from './multiplayer/webrtc.ts';
import { PoseView } from './ui/pip.ts';
import { Screens, type RoundResult, type SongCard } from './ui/screens.ts';

// The language comes first: every text below is built in it.
setLang(detectLang(savedLang(), navigator.languages?.length ? navigator.languages : [navigator.language]));
applyPageText();
onLangChange(applyPageText);

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
const params = new URLSearchParams(location.search);

/**
 * Multiplayer: one manager per tab. Every room, whether created in the lobby or opened
 * with `?room=CODE`, goes over PeerJS so phones and desktops meet across devices.
 * `?signal=local` uses our own signaling server on localhost instead (see signaling-server/).
 */
const roomParam = params.get('room');
const mpSelfId = makePlayerId();
const mpName = loadPlayerName() ?? t('player.default');
const mpTransport = params.get('signal') === 'local'
  ? new WebRTCTransport(mpSelfId)
  : new PeerJSTransport();
export const mp = new MPManager(mpSelfId, mpName, mpTransport);
if (roomParam) mp.connect(roomParam, params.get('host') === '1');
const sfx = new Sfx();
// iOS Safari only lets audio start inside a tap. Resume the context on every tap, so a guest
// whose song is started later by the host (no tap at that moment) still hears the music.
window.addEventListener('pointerdown', () => sfx.unlock(), { passive: true });
const stage = createStage(canvas('scene'));
const poseView = new PoseView(canvas('pose'));
const hud = new Hud();
const scoreboard = new Scoreboard();

const tracks = new Tracks();
let shownTheme = '';
/** Switches the song, and the stage and costume with it. */
function selectSong(change: () => void): void {
  change();
  const theme = tracks.current.theme;
  if (theme !== shownTheme) {
    shownTheme = theme;
    stage.setTheme(themeFor(theme));
  }
}
const inRoom = () => mp.getState().roomId !== null;

/**
 * Picks a built-in song for this round (lobby picker or the room host's choice) and starts rendering its music.
 * An unknown id, say from a newer build, falls back to the default song.
 */
export function setSong(id: SongId): void {
  selectSong(() => tracks.select(songInfo(id) ? id : DEFAULT_SONG.song.id));
}

const screens = new Screens(screensRoot, {
  start: () => void start(),
  menu: () => void toMenu(),
  pick: (key) => {
    const k = flow.phase.kind;
    if (k !== 'intro' && k !== 'lobby' && k !== 'error') return;
    if (!inRoom()) { selectSong(() => tracks.select(key)); return; }
    // In a room only the host picks, and only songs every device can render.
    if (!mp.amHost() || !songInfo(key)) return;
    setSong(key);
    mp.selectSong(key);
  },
  file: (file) => void tracks.loadFile(file).then(() => selectSong(() => undefined)),
});

// Start the ~17 MB model download and the music render right away, while the player reads the intro.
if (!demo) preloadRecognition().catch(() => undefined);
selectSong(() => tracks.select(tracks.current.key));
/** The song being danced: fixed from the countdown to the results, whatever the picker shows. */
let playing: Track = tracks.current;

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
/** Last time we broadcast our live score to the room (ms). */
let lastLiveScoreAt = 0;
/** Last time we streamed our pose to the room (ms). */
let lastPoseAt = 0;
/** Latest pose of every other player, with the time it arrived. */
const remotePoses = new Map<string, { pose: CompactPose; at: number }>();
mp.onPose((playerId, pose) => remotePoses.set(playerId, { pose, at: performance.now() }));
// A friend's move was rated: their avatar flinches on a miss (desktops), and their scoreboard row flashes.
mp.onVerdict((playerId, rating) => {
  stage.crewReact(playerId, rating);
  scoreboard.flash(playerId, rating);
});
/** A pose older than this is stale: the avatar grooves in place instead of freezing. */
const POSE_STALE_MS = 1500;
/** Screens narrower than this (phones) don't draw the other players' avatars. */
const CREW_MIN_WIDTH = 900;

/** Phases where the camera runs and the other players' avatars mirror them live. */
const livePhase = (kind: Flow['phase']['kind']): boolean =>
  kind === 'calibrating' || kind === 'warmup' || kind === 'waiting' || kind === 'countdown' || kind === 'dancing';

function crewMembers(now: number): CrewMember[] {
  return Object.values(mp.getState().players)
    .filter((p) => p.id !== mp.self)
    .map((p) => {
      const latest = remotePoses.get(p.id);
      return { id: p.id, name: p.name, score: p.score, pose: latest && now - latest.at < POSE_STALE_MS ? unpackPose(latest.pose) : null };
    });
}

// Multiplayer reactions: song start from host, shared podium, room reset.
mp.onEvent((ev) => {
  // Guests render the host's pick as soon as it changes, so the countdown doesn't wait for the music.
  if (ev.kind === 'songChanged') setSong(ev.songId);
  if (ev.kind === 'songStarted') {
    setSong(ev.songId);
    sharedPodium = null;
    if (flow.phase.kind === 'lobby') void start();
  }
  if (ev.kind === 'podiumReady') {
    sharedPodium = ev.entries;
    // Everyone's scores from the room join this song's records here too; our own is already in.
    try {
      const at = new Date().toISOString();
      for (const e of ev.entries) {
        if (e.playerId !== mp.self) recordScore(playing.key, { score: e.score, stars: e.stars, at, name: e.name });
      }
      boardsChanged(playing.key);
    } catch {
      // Storage unavailable: the podium still shows.
    }
  }
  if (ev.kind === 'reset') {
    sharedPodium = null;
    if (flow.phase.kind === 'results') flow = enterLobby(flow);
  }
});

/** Each song's records table, read from storage once and re-read after a save. */
const boards = new Map<string, ScoreEntry[]>();
let boardsVersion = 0;
function boardOf(key: string): ScoreEntry[] {
  let b = boards.get(key);
  if (!b) {
    try { b = loadLeaderboard(key); } catch { b = []; }
    boards.set(key, b);
  }
  return b;
}
function boardsChanged(key: string): void {
  boards.delete(key);
  boardsVersion++;
}

const songTime = () => (player && flow.phase.kind === 'dancing' ? player.time() : -1);

/** The pose the player should be in right now: the warm-up pose, or the moving choreography of the song. */
function currentTarget(): MoveTarget | null {
  const p = flow.phase;
  if (p.kind === 'warmup') return MOVES[WARMUP[p.step].move];
  if (p.kind !== 'dancing') return null;
  return poseAt(playing.song, songTime());
}

async function start(): Promise<void> {
  if (flow.phase.kind === 'intro' || flow.phase.kind === 'error') {
    flow = enterLobby(flow);
    return;
  }
  if (flow.phase.kind !== 'lobby') return;
  player = new SongPlayer(sfx.unlock());
  flow = startRequested(flow);
  try {
    const src = demo ? startDemoSource(currentTarget) : await startCamera();
    if (flow.phase.kind !== 'loading') {
      // The user cancelled while the camera was starting: release it, stay where they went.
      const stream = src.video?.srcObject;
      if (stream instanceof MediaStream) stream.getTracks().forEach((t) => t.stop());
      return;
    }
    source = src;
    const r = cameraReady(flow);
    flow = r.flow;
    runCommands(r.commands);
  } catch (err) {
    flow = cameraFailed(flow, err instanceof CameraError ? err.userMessage : String(err));
  }
}

/** Results × button: back to the main menu. Leaves the room so peers see us go. */
function toMenu(): void {
  player?.stop();
  if (mp.getState().roomId) mp.disconnect();
  dance = null;
  mistakes = {};
  verdict = null;
  result = null;
  sharedPodium = null;
  flow = enterIntro(flow);
}

function runCommands(commands: readonly FlowCommand[]): void {
  for (const c of commands) {
    switch (c) {
      case 'recalibrate':
      case 'beginCalibration':
        tracker = recalibrate(tracker);
        break;
      case 'ready': mp.sendReady(); break;
      case 'stepDone': sfx.play('step'); break;
      case 'stepSkipped': sfx.play('hint'); break;
      case 'tick': sfx.play('tick'); break;
      case 'startSong':
        playing = tracks.current;
        dance = newDance();
        mistakes = {};
        verdict = null;
        player?.play(tracks.buffer(), playing.play);
        sfx.play('go');
        break;
      case 'nextSong':
      case 'prevSong':
        // In a room the host picks the song in the lobby; leaning does nothing.
        if (inRoom()) break;
        selectSong(() => tracks.step(c === 'nextSong' ? 1 : -1));
        sfx.play('tick');
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

/** Shared podium from multiplayer (host-broadcast), shown instead of the local board. */
export let sharedPodium: import('./multiplayer/types.ts').PodiumEntry[] | null = null;

function finishRound(): void {
  player?.stop();
  const d = dance ?? newDance();
  const song = playing.song;
  // Multiplayer: share the result; the host aggregates into a shared podium.
  if (mp.getState().roomId) {
    const parts = partAccuracy(d);
    const overall = parts.length > 0 ? Math.round(parts.reduce((s, p) => s + p.pct, 0) / parts.length) : 0;
    mp.sendResult(d.points, stars(d.points, song), overall);
    if (mp.amHost()) {
      // Give guests a moment to report, then publish. Late results still show locally.
      setTimeout(() => {
        if (mp.getState().roomId) sharedPodium = mp.publishPodium();
      }, 4000);
    }
  }
  const entry: ScoreEntry = { score: d.points, stars: stars(d.points, song), at: new Date().toISOString(), name: loadPlayerName() ?? t('player.default') };
  let board: ScoreEntry[] = [entry];
  let place = 0;
  try {
    const r = recordScore(playing.key, entry);
    board = r.board;
    place = r.place;
    boardsChanged(playing.key);
  } catch {
    // Storage can be unavailable (private mode). The result still shows.
  }
  result = {
    songTitle: songTitle(song),
    points: d.points, stars: entry.stars, counts: d.counts, maxCombo: d.maxCombo,
    accuracy: partAccuracy(d), advice: adviceLines(mistakes), place, board, entry,
  };
  sfx.play(place === 0 ? 'record' : 'over');
}

function bannerFor(): Banner | null {
  const kind = flow.phase.kind;
  if (!lastOut || kind === 'intro' || kind === 'lobby' || kind === 'loading' || kind === 'error') return null;
  const hints = lastOut.hints;
  const frame = hints.find((h) => h.kind === 'frame');
  if (frame) return { tone: 'frame', label: t('banner.frame'), text: frame.text };
  if (kind === 'calibrating') {
    const c = hints.find((h) => h.kind === 'calib');
    return c && c.kind === 'calib' ? { tone: 'calib', label: t('banner.calib'), text: c.text, progress: c.progress } : null;
  }
  if (kind === 'dancing' && verdict && clock < verdict.until) {
    const v = verdict.v;
    // A recorded dance's steps have no names of their own: the nearest built-in move would mislabel them.
    if (!v.hint) return { tone: 'good', label: t('banner.perfect'), text: playing.song.mocap ? t('banner.mocapPerfect') : t('banner.movePerfect', { move: moveName(v.move) }) };
    return v.rating === 'miss'
      ? { tone: 'miss', label: t('banner.miss'), text: v.hint, cue: v.cue }
      : { tone: 'fix', label: t('banner.almost'), text: v.hint, progress: v.score, cue: v.cue };
  }
  if (kind === 'warmup' && liveMatch?.worst && clock - warmupMissSince > WARMUP_HINT_AFTER_S) {
    return { tone: 'fix', label: t('banner.fix'), text: liveMatch.worst.hint, progress: liveMatch.score, cue: liveMatch.worst.cue };
  }
  if (kind === 'results') {
    // The hand-up gesture's own near-miss hint: "raise your hand higher to start".
    const fix = hints.find((h) => h.kind === 'fix');
    if (fix && fix.kind === 'fix') return { tone: 'fix', label: t('banner.almost'), text: fix.text, progress: fix.p };
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

  // The host announces its song to the room, including one picked before the room existed.
  // A song file can't be shared, so the room gets the default song instead.
  if (flow.phase.kind === 'lobby' && inRoom() && mp.amHost()) {
    const key = songInfo(tracks.current.key) ? tracks.current.key : DEFAULT_SONG.song.id;
    if (mp.getState().songId !== key) {
      setSong(key);
      mp.selectSong(key);
    }
  }

  const t = songTime();
  const step = stepFlow(flow, {
    events,
    dt,
    poseScore: liveMatch?.score ?? null,
    songOver: flow.phase.kind === 'dancing' && t >= songDuration(playing.song),
    tilt: lastOut?.features.present ? lastOut.features.tilt : null,
    songReady: tracks.buffer() !== null,
    othersReady: inRoom() ? othersReady(mp.getState(), mp.self) : undefined,
  });
  flow = step.flow;
  runCommands(step.commands);

  if (flow.phase.kind === 'dancing' && dance) {
    const r = stepDance(dance, playing.song, songTime(), body);
    dance = r.state;
    for (const v of r.verdicts) {
      verdict = { v, until: clock + VERDICT_S };
      mistakes = logVerdict(mistakes, v);
      hud.showVerdict(v.rating);
      stage.react(v.rating);
      sfx.play(v.rating);
      // Friends see our miss on our avatar and on their scoreboard; so do we, on ours.
      if (inRoom()) {
        mp.sendVerdict(v.rating);
        scoreboard.flash(mp.self, v.rating);
      }
    }
    // Multiplayer: broadcast live score about once a second.
    if (mp.getState().roomId && now - lastLiveScoreAt >= MPManager.LIVE_SCORE_MS) {
      lastLiveScoreAt = now;
      mp.sendLiveScore(dance.points, dance.combo);
    }
  }
  // Stream our pose whenever the camera sees us, from calibration to the last beat,
  // so desktops in the room show us moving live, not only once the song starts.
  if (inRoom() && body && livePhase(flow.phase.kind) && now - lastPoseAt >= MPManager.POSE_MS) {
    lastPoseAt = now;
    mp.sendPose(packPose(body));
  }

  const kind = flow.phase.kind;
  const dancing = kind === 'dancing';
  const song = playing.song;
  // The coach dances the choreography continuously, a touch ahead so its easing lands on the beat.
  const coachTarget = kind === 'warmup' ? target : dancing ? poseAt(song, songTime() + COACH_LEAD_S) : null;
  // Other players dance as avatars beside the coach on wide screens; phones keep the stage clear.
  const wide = window.innerWidth >= CREW_MIN_WIDTH;
  // Fetch the avatar models while the room waits in the lobby, not when the song starts.
  if (wide && Object.keys(mp.getState().players).length > 1) stage.preloadCrew();
  const showCrew = livePhase(kind) && wide;
  stage.setCrew(showCrew ? crewMembers(now) : []);
  // A song danced to a recording: the coach performs the recording itself, exactly on the music.
  const clip = dancing ? songClipSeconds(song, songTime()) : null;
  stage.draw({ target: coachTarget, beat: dancing ? Math.max(0, songTime()) / beatLength(song) : 0, playing: dancing, clip }, dt);

  // Live multiplayer scoreboard: visible during the dance when ≥2 players share the room.
  if (dancing && Object.keys(mp.getState().players).length > 1) {
    scoreboard.show(Object.values(mp.getState().players), mp.self);
  } else {
    scoreboard.hide();
  }

  const cameraOn = source !== null && kind !== 'intro' && kind !== 'lobby' && kind !== 'loading' && kind !== 'error';
  hud.showPip(cameraOn);
  if (cameraOn) poseView.draw(source?.video ?? null, lastOut, kind === 'warmup' || dancing ? target : null, liveMatch);
  hud.showDance(dancing ? dance : null, song);
  hud.showPictos(dancing ? song : null, songTime());
  if (!dancing) hud.hideVerdict();
  hud.showBanner(bannerFor());
  const calib = lastOut?.hints.find((h) => h.kind === 'calib');
  screens.update({
    flow,
    calibProgress: calib && calib.kind === 'calib' ? calib.progress : 0,
    distance: kind === 'calibrating' && lastOut ? distanceProblem(lastOut.features) : null,
    loadProgress: downloadProgress(),
    result,
    demo,
    inRoom: inRoom(),
    songs: tracks.list.map(card),
    selected: card(tracks.current),
    prev: card(tracks.neighbour(-1)),
    next: card(tracks.neighbour(1)),
    fileStatus: tracks.status,
    songReady: tracks.buffer() !== null,
    board: boardOf,
    boardsVersion,
  });
}

function card(track: Track): SongCard {
  return {
    key: track.key, song: track.song, title: songTitle(track.song),
    credit: track.credit, dances: track.dances, coach: track.coach, warning: track.warning,
  };
}

let prev = performance.now();
function loop(now: number): void {
  const dt = Math.min(0.1, (now - prev) / 1000);
  prev = now;
  frame(now, dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
