import { COUNTDOWN_S, countdownLeft, RESTART_LOCK_S, STEP_TIMEOUT_S, STEP_WARN_S, WARMUP, WARMUP_HOLD_S, type Flow } from '../app/flow.ts';
import type { ScoreEntry } from '../app/leaderboard.ts';
import { SHOP, SLOTS, type ShopItem, type Wallet } from '../app/wallet.ts';
import type { PartAccuracy } from '../app/summary.ts';
import type { FileStatus } from '../app/tracks.ts';
import { ratingName, type Rating } from '../dance/dance.ts';
import { MOVES } from '../dance/moves.ts';
import { songDuration, type Song } from '../dance/song.ts';
import { songInfo } from '../dance/songs.ts';
import { loadPlayerName, savePlayerName } from '../multiplayer/persistence.ts';
import { mp, sharedPodium } from '../main.ts';
import { isLang, lang, locale, setLang, t, tryT } from '../i18n.ts';
import { langSwitchHtml } from './lang.ts';
import { pictogramSvg } from './pictogram.ts';

export interface RoundResult {
  songTitle: string;
  points: number;
  stars: number;
  counts: Record<Rating, number>;
  maxCombo: number;
  accuracy: PartAccuracy[];
  advice: string[];
  place: number;
  board: ScoreEntry[];
  entry: ScoreEntry;
  /** Coins this dance earned for the shop. */
  coins: number;
}

/** A song as the picker shows it. */
export interface SongCard {
  key: string;
  song: Song;
  /** The title in the current language. */
  title: string;
  credit: string;
  dances: string;
  coach: string;
  warning: string | null;
}

export interface ScreenModel {
  flow: Flow;
  songs: readonly SongCard[];
  selected: SongCard;
  /** Songs before and after the selected one, for the lean-to-switch hint on the results screen. */
  prev: SongCard;
  next: SongCard;
  fileStatus: FileStatus;
  /** The selected song's music is ready. */
  songReady: boolean;
  /** This device is in a multiplayer room: the host picks the song, song files and leaning are off. */
  inRoom: boolean;
  calibProgress: number;
  /** During calibration: the player is too close ('close') or too far ('far') for it to work. */
  distance: 'close' | 'far' | null;
  /** Download share of the recognition model, 0..1. */
  loadProgress: number;
  result: RoundResult | null;
  demo: boolean;
  /** A song's records table on this device, best first. */
  board(songKey: string): readonly ScoreEntry[];
  /** Changes whenever any table is saved, so the lobby redraws. */
  boardsVersion: number;
  /** Coins, clothes bought and clothes worn. */
  wallet: Wallet;
}

export interface ScreenActions {
  start(): void;
  menu(): void;
  pick(key: string): void;
  file(file: File): void;
  /** Shop: buy an item (and put it on), or put on / take off one already bought. */
  buy(id: string): void;
  wear(id: string): void;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
const starRow = (n: number) => `<div class="star-row">${Array.from({ length: 5 }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</div>`;


/** 6-char room code: Math.random base36 upper, without ambiguous 0/O/1/I. */
const ROOM_OK = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
function makeRoomCode(): string {
  let out = '';
  while (out.length < 6) {
    const chunk = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '');
    for (const ch of chunk) {
      if (out.length >= 6) break;
      if (ROOM_OK.includes(ch)) out += ch;
    }
  }
  return out;
}

const playerStatus = (s: string): string => t(s === 'dancing' ? 'status.dancing' : s === 'done' ? 'status.done' : 'status.lobby');
/** A song title in the language's quotation marks. */
const q = (text: string) => esc(t('quote', { text }));

const minutes = (seconds: number) => {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** The move that shows a song best: the first one that isn't a plain arms-out or arms-up. */
function signatureMove(song: Song) {
  const plain = new Set(['wings', 'up', 'vee']);
  const step = song.steps.find((s) => !plain.has(s.move)) ?? song.steps[0];
  return step.pose ?? MOVES[step.move];
}

const recordDate = (iso: string) => new Date(iso).toLocaleString(locale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** One song's top five: score, who, stars and when. */
function boardHtml(board: readonly ScoreEntry[], mine?: ScoreEntry): string {
  if (board.length === 0) return `<p class="muted">${t('board.empty')}</p>`;
  return `<ol class="board">
    ${board.map((e) => `<li class="${e === mine ? 'me' : ''}"><span>${e.score}</span><em>${e.name ? `<b>${esc(e.name)}</b> · ` : ''}${'★'.repeat(Math.max(0, Math.min(5, e.stars)))} · ${recordDate(e.at)}</em></li>`).join('')}
  </ol>`;
}

function songCardHtml(c: SongCard, selected: boolean, interactive: boolean, best: ScoreEntry | undefined): string {
  const inner = `
        <span class="song-icon">${pictogramSvg(signatureMove(c.song), { outline: true })}</span>
        <span class="song-text">
          <strong>${esc(c.title)}</strong>
          <em>${esc(c.credit)}</em>
          <small>${minutes(songDuration(c.song))} · ${t('card.moves', { n: c.song.steps.length })}</small>
          ${best ? `<small class="song-best">${t('card.best', { score: best.score })}${best.name ? ` · ${esc(best.name)}` : ''}</small>` : ''}
        </span>`;
  return `
    <li>
      ${interactive
        ? `<button type="button" class="song-card ${selected ? 'selected' : ''}" data-song="${esc(c.key)}" aria-pressed="${selected}">${inner}</button>`
        : `<div class="song-card ${selected ? 'selected' : ''}">${inner}</div>`}
    </li>`;
}

function fileHtml(status: FileStatus): string {
  const note = status.kind === 'loading' ? esc(t('file.loading', { name: status.name }))
    : status.kind === 'error' ? esc(status.text)
    : t('file.note');
  return `
    <label class="file-pick ${status.kind === 'error' ? 'file-error' : ''}">
      <input type="file" id="song-file" accept="audio/*" ${status.kind === 'loading' ? 'disabled' : ''} />
      <strong>${t(status.kind === 'loading' ? 'file.preparing' : 'file.cta')}</strong>
      <span>${note}</span>
    </label>`;
}

/** The coin balance, which opens the shop. */
const coinButton = (w: Wallet) => `<button id="shop-open" class="coin-btn" type="button" aria-haspopup="dialog"><i class="coin" aria-hidden="true"></i>${esc(t('shop.coins', { n: w.coins }))}<span>· ${esc(t('shop.open'))}</span></button>`;

function shopItemHtml(item: ShopItem, w: Wallet): string {
  const owned = w.owned.includes(item.id);
  const worn = w.worn[item.slot] === item.id;
  const short = item.price - w.coins;
  const button = owned
    ? `<button class="shop-btn ${worn ? 'worn' : ''}" type="button" data-wear="${esc(item.id)}" aria-pressed="${worn}">${esc(t(worn ? 'shop.takeOff' : 'shop.wear'))}</button>`
    : `<button class="shop-btn buy" type="button" data-buy="${esc(item.id)}"${short > 0 ? ' disabled' : ''}>${esc(short > 0 ? t('shop.short', { n: short }) : t('shop.buy', { price: item.price }))}</button>`;
  return `<li class="shop-item ${worn ? 'worn' : ''}">
      <span class="swatch swatch-${item.slot}" style="--c:${item.swatch}" aria-hidden="true"></span>
      <strong>${esc(tryT(item.name) ?? item.id)}</strong>
      ${button}
    </li>`;
}

/** The clothes shop: a panel beside the stage, so the coach can be seen trying things on. */
function shopHtml(w: Wallet): string {
  return `
  <aside class="shop" role="dialog" aria-modal="false" aria-labelledby="shop-title">
    <header class="shop-head">
      <h2 id="shop-title">${esc(t('shop.title'))}</h2>
      <span class="coin-pill"><i class="coin" aria-hidden="true"></i>${esc(t('shop.coins', { n: w.coins }))}</span>
      <button id="shop-close" class="menu-x" type="button" aria-label="${esc(t('shop.close'))}" title="${esc(t('shop.close'))}">×</button>
    </header>
    <p class="shop-note">${esc(t('shop.note'))}</p>
    <div class="shop-body">
      ${SLOTS.map((slot) => `
        <h3>${esc(t(`shop.slot.${slot}`))}</h3>
        <ul class="shop-grid">${SHOP.filter((i) => i.slot === slot).map((i) => shopItemHtml(i, w)).join('')}</ul>`).join('')}
    </div>
  </aside>`;
}

/** The lobby shows the chosen song's top three; the results screen shows all five. */
const LOBBY_RECORDS = 3;

function lobbyHtml(m: ScreenModel, showJoin: boolean, editName: boolean): string {
  let saved: string | null = null;
  try { saved = loadPlayerName(); } catch { saved = null; }
  let roomId: string | null = null;
  let players: { id: string; name: string; isHost: boolean; status: string }[] = [];
  let isHost = false;
  try {
    const st = mp.getState();
    roomId = st.roomId;
    players = Object.values(st.players);
    isHost = st.isHost;
  } catch { /* lobby without mp */
  }
  const count = players.length;
  const full = count >= 4;

  const nameBlock = saved && !editName
    ? `<p class="muted">${t('lobby.you')} <strong>${esc(saved)}</strong> <button id="lobby-edit-name" class="link-btn" type="button">${t('lobby.edit')}</button></p>`
    : `<div class="lobby-name">
        <label for="lobby-name-input">${t('lobby.nameLabel')}</label>
        <input id="lobby-name-input" type="text" maxlength="24" placeholder="${esc(t('lobby.namePlaceholder'))}" autocomplete="off" value="${esc(saved ?? '')}" />
        <button id="lobby-save-name" class="cta" type="button">${t('lobby.save')}</button>
        <p class="muted">${t(roomId ? 'lobby.nameNoteRoom' : 'lobby.nameNote')}</p>
      </div>`;

  const roomBlock = roomId
    ? `<div class="room-code-wrap"><span>${t('lobby.roomCode')}</span><strong class="room-code">${esc(roomId)}</strong></div>
       <button id="lobby-leave" type="button" class="link-btn">${t('lobby.leave')}</button>`
    : `<div class="lobby-actions">
        <button id="lobby-create" class="cta cta-secondary" type="button">${t('lobby.create')}</button>
        <button id="lobby-join-toggle" class="cta cta-secondary" type="button">${t('lobby.joinToggle')}</button>
      </div>
      ${showJoin ? `<div class="lobby-join">
        <input id="lobby-join-code" type="text" maxlength="6" placeholder="${esc(t('lobby.codePlaceholder'))}" autocomplete="off" />
        <button id="lobby-join" class="cta" type="button"${full ? ' disabled' : ''}>${t('lobby.join')}</button>
      </div>` : ''}
      ${full ? `<p class="muted">${t('lobby.full')}</p>` : ''}`;

  const playersBlock = roomId
    ? `<h3>${t('lobby.players', { n: count })}</h3>
      ${count === 0 ? `<p class="muted">${t('lobby.nobody')}</p>` : `<ul class="lobby-players">
        ${players.map((p) => `<li><span>${esc(p.name)}</span>${p.isHost ? `<em class="host-badge">${t('lobby.host')}</em>` : ''}<em>${esc(playerStatus(p.status))}</em></li>`).join('')}
      </ul>`}`
    : '';

  // A song file stays on this device, so rooms only offer the built-in songs.
  const songs = roomId ? m.songs.filter((c) => songInfo(c.key)) : m.songs;
  const interactive = !roomId || isHost;
  // Songs on one side; on the other, the chosen song, its records and playing with friends.
  const songsBlock = `
    <h3>${t('lobby.song')}</h3>
    ${roomId ? `<p class="muted">${t(isHost ? 'lobby.pickAll' : 'lobby.hostPicks')}</p>` : ''}
    <ul class="song-grid">${songs.map((c) => songCardHtml(c, c.key === m.selected.key, interactive, m.board(c.key)[0])).join('')}</ul>
    ${roomId ? '' : fileHtml(m.fileStatus)}`;
  const sideBlock = `
    <p class="song-about"><b>${q(m.selected.title)}:</b> ${esc(m.selected.dances)}. ${esc(t('lobby.coach', { coach: m.selected.coach }))}</p>
    ${m.selected.warning ? `<p class="song-warning">${esc(m.selected.warning)}</p>` : ''}
    <h3>${esc(t('lobby.records', { title: m.selected.title }))}</h3>
    ${boardHtml(m.board(m.selected.key).slice(0, LOBBY_RECORDS))}
    <div class="lobby-friends">
      <h3>${t('lobby.chip')}</h3>
      ${roomBlock}
      ${playersBlock}
    </div>`;

  // The one thing to do next, always in view at the bottom of the card.
  const startBlock = roomId
    ? (isHost
      ? `<button id="lobby-start" class="cta" type="button"${count < 1 ? ' disabled' : ''}>${t('lobby.start')}</button>`
      : `<p class="lobby-wait">${t('lobby.waitHost')}</p>`)
    : `<button id="start-btn" class="cta" type="button">${t('lobby.solo')}</button>`;

  return `
  <section class="screen center lobby">
    <div class="over-card lobby-card">
      <header class="lobby-head">
        <button id="lobby-menu" class="menu-x" type="button" aria-label="${t('menu')}" title="${t('menu')}">×</button>
        ${langSwitchHtml()}
        <h2>${t('lobby.title')}</h2>
        ${nameBlock}
        ${coinButton(m.wallet)}
      </header>
      <div class="lobby-body">
        <div class="lobby-songs">${songsBlock}</div>
        <div class="lobby-side">${sideBlock}</div>
      </div>
      <footer class="lobby-foot">
        ${startBlock}
      </footer>
    </div>
  </section>`;
}

function podiumHtml(): string {
  const pod = sharedPodium;
  if (!pod || pod.length < 2) return '';
  const sorted = [...pod].sort((a, b) => a.place - b.place);
  return `
  <div class="mp-podium">
    <h3>${t('podium.title')}</h3>
    <ol class="podium">
      ${sorted.map((e) => {
        const s = Math.max(0, Math.min(5, e.stars));
        return `<li class="${e.place === 1 ? 'winner' : ''}"><span class="pod-place">${e.place}</span><span class="pod-name">${esc(e.name)}</span><span class="pod-score">${e.score}</span><span class="pod-stars">${'★'.repeat(s)}${'☆'.repeat(5 - s)}</span></li>`;
      }).join('')}
    </ol>
    <button id="lobby-again" class="cta" type="button">${t('podium.again')}</button>
    <p class="muted">${t('podium.note')}</p>
  </div>`;
}

/**
 * The title screen: the coach dances in the middle of the stage, the name above her and the one thing
 * to do below, like a game's title screen rather than a page of text.
 */
function introHtml(demo: boolean, w: Wallet): string {
  // Three short facts read as one quiet paragraph: separators can't strand at the start of a line.
  const tips = (['intro.tipDistance', 'intro.tipHands', 'intro.tipPrivate'] as const).map((k) => `${esc(t(k))}.`).join(' ');
  // The coach dances on the open stage; everything to read or press lives in one card beside her
  // (below her on tall screens), so nothing floats over the busy floor.
  return `
  <section class="screen intro title-screen">
    <div class="title-lang">${langSwitchHtml()}</div>
    <div class="title-side">
      <h1 class="logo">Motion <span>Dance</span></h1>
      <nav class="title-card" aria-label="${esc(t('menu'))}">
        <p class="title-tagline">${esc(t('intro.tagline'))}</p>
        <button class="cta cta-hero" id="start-btn" type="button">${t(demo ? 'intro.demo' : 'intro.start')}</button>
        <div class="title-row">
          <button class="cta cta-secondary" id="friends-btn" type="button">${t('intro.friends')}</button>
          <button class="cta cta-secondary title-shop-btn" id="shop-open" type="button" aria-haspopup="dialog"><i class="coin" aria-hidden="true"></i><span class="shop-text"><b>${esc(t('shop.open'))}</b><small>${esc(t('shop.coins', { n: w.coins }))}</small></span></button>
        </div>
        <p class="title-tips">${tips}</p>
        <p class="credit">${esc(t('intro.credit'))}</p>
      </nav>
    </div>
  </section>`;
}

const loadingHtml = () => `
  <section class="screen center">
    <div class="spinner" aria-hidden="true"></div>
    <h2>${t('loading.title')}</h2>
    <div class="load-bar" aria-hidden="true"><i id="load-bar"></i></div>
    <p class="muted" id="load-text">${t('loading.allow')}</p>
    <button id="loading-cancel" class="link-btn" type="button">${t('loading.cancel')}</button>
  </section>`;

const errorHtml = (message: string) => `
  <section class="screen center">
    <h2>${t('error.title')}</h2>
    <p class="error-text">${esc(message)}</p>
    <button class="cta" id="retry-btn" type="button">${t('error.retry')}</button>
    <button id="error-menu" class="link-btn" type="button">${t('menu')}</button>
  </section>`;


const calibHtml = (distance: ScreenModel['distance']) => `
  <section class="screen side">
    <div class="panel">
      <p class="chip">${t('calib.chip')}</p>
      ${distance
        ? `<div class="step-back" role="alert">
            <span class="step-back-arrow" aria-hidden="true">${distance === 'close' ? '↓' : '↑'}</span>
            <h2>${t(`stepBack.${distance}.title`)}</h2>
            <p>${t(`stepBack.${distance}.text`)}</p>
          </div>`
        : `<h2>${t('calib.title')}</h2>
      <p class="muted">${t('calib.text')}</p>`}
      <div class="ring" id="calib-ring" style="--p:0"><span id="calib-pct">0%</span></div>
    </div>
  </section>`;

function waitingHtml(): string {
  let players: { id: string; name: string; ready: boolean; done: boolean }[] = [];
  let self = '';
  try {
    self = mp.self;
    players = Object.values(mp.getState().players).map((p) => ({ id: p.id, name: p.name, ready: p.ready, done: p.status === 'done' }));
  } catch { /* no room */
  }
  return `
  <section class="screen side">
    <div class="panel">
      <p class="chip">${t('waiting.chip')}</p>
      <h2>${t('waiting.title')}</h2>
      <p class="muted">${t('waiting.text')}</p>
      <ul class="lobby-players">
        ${players.map((p) => `<li><span>${esc(p.name)}${p.id === self ? t('waiting.you') : ''}</span><em>${t(p.ready || p.done ? 'waiting.ready' : 'waiting.calibrating')}</em></li>`).join('')}
      </ul>
    </div>
  </section>`;
}

function warmupHtml(step: number, done: boolean, skipped: boolean): string {
  const s = WARMUP[step];
  const title = t(skipped ? 'warmup.skipTitle' : done ? 'warmup.doneTitle' : `${s.text}.title`);
  const text = t(skipped ? 'warmup.skipText' : done ? 'warmup.doneText' : `${s.text}.text`);
  return `
  <section class="screen side">
    <div class="panel ${skipped ? 'panel-skipped' : done ? 'panel-done' : ''}">
      <p class="chip">${t('warmup.chip', { n: step + 1, total: WARMUP.length })}</p>
      <div class="dots">${WARMUP.map((_, i) => `<i class="${i < step || (i === step && done) ? 'on' : ''}"></i>`).join('')}</div>
      <span class="tutorial-icon">${pictogramSvg(MOVES[s.move], { outline: true })}</span>
      <h2>${title}</h2>
      <p class="muted">${text}</p>
      <div class="hold-bar" aria-hidden="true"><i id="hold-bar"></i></div>
      <p class="step-warn" id="step-warn"></p>
    </div>
  </section>`;
}

const countdownHtml = (n: number, title: string) => `
  <section class="screen center countdown">
    <div class="count" id="count">${n}</div>
    <p class="muted" id="count-text">${esc(t('countdown.text', { title }))}</p>
  </section>`;

function resultsHtml(r: RoundResult, m: ScreenModel): string {
  const ratings: readonly Rating[] = ['perfect', 'good', 'ok', 'miss'];
  return `
  <section class="screen center over">
    <div class="over-card">
      <button id="results-menu" class="menu-x" type="button" aria-label="${t('menu')}" title="${t('menu')}">×</button>
      <p class="chip ${r.place === 0 ? 'chip-record' : ''}">${t(r.place === 0 ? 'results.record' : 'results.over')} · ${esc(r.songTitle)}</p>
      ${starRow(r.stars)}
      ${r.coins > 0 ? `<p class="coins-earned"><i class="coin" aria-hidden="true"></i>${esc(t('results.coins', { n: r.coins }))}</p>` : ''}
      <div class="big-score">${r.points}</div>
      <ul class="stats">
        ${ratings.map((k) => `<li class="rating-${k}"><strong>${r.counts[k]}</strong><span>${ratingName(k)}</span></li>`).join('')}
        <li><strong>×${r.maxCombo}</strong><span>${t('results.combo')}</span></li>
      </ul>
      <div class="over-columns">
        <div>
          <h3>${t('results.accuracy')}</h3>
          <ul class="accuracy">
            ${r.accuracy.slice(0, 4).map((a) => `<li><span>${a.name}</span><b style="--p:${a.pct / 100}"><i></i></b><em>${a.pct}%</em></li>`).join('')}
          </ul>
          <h3>${t('results.improve')}</h3>
          ${r.advice.length
            ? `<ol class="advice">${r.advice.map((a) => `<li>${esc(a)}</li>`).join('')}</ol>`
            : `<p class="muted">${t('results.clean')}</p>`}
        </div>
        <div>
          <h3>${esc(t('lobby.records', { title: r.songTitle }))}</h3>
          ${boardHtml(r.board, r.entry)}
        </div>
      </div>
      ${podiumHtml()}
      <div class="restart" id="restart">
        ${m.inRoom ? '' : `<p class="song-switch">
          <span>${esc(t('results.leanLeft', { title: m.prev.title }))}</span>
          <span>${esc(t('results.leanRight', { title: m.next.title }))}</span>
        </p>`}
        <p id="restart-text">${esc(restartText(m))}</p>
      </div>
    </div>
  </section>`;
}

const restartText = (m: ScreenModel) => {
  const left = Math.ceil(RESTART_LOCK_S - m.flow.t);
  return left > 0 ? t('results.wait', { s: left }) : t('results.raise', { title: m.selected.title });
};

/** Renders the overlay for the current phase. Rebuilds DOM only when the phase changes. */
export class Screens {
  private readonly root: HTMLElement;
  private key = '';
  /** Scroll the next lobby to its multiplayer part and highlight it. */
  private focusFriends = false;
  private showJoin = false;
  private shopOpen = false;
  private editName = false;

  constructor(root: HTMLElement, actions: ScreenActions) {
    this.root = root;
    root.addEventListener('click', (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      const btn = target.closest('button');
      const id = btn?.id ?? target.id;
      const langBtn = target.closest<HTMLElement>('[data-lang]');
      if (langBtn && isLang(langBtn.dataset.lang)) { setLang(langBtn.dataset.lang); return; }
      if (id === 'shop-open') { this.shopOpen = true; return; }
      if (id === 'shop-close') { this.shopOpen = false; return; }
      const shopBtn = target.closest<HTMLElement>('[data-buy], [data-wear]');
      if (shopBtn?.dataset.buy) { actions.buy(shopBtn.dataset.buy); return; }
      if (shopBtn?.dataset.wear) { actions.wear(shopBtn.dataset.wear); return; }
      if (id === 'start-btn' || id === 'retry-btn') { this.shopOpen = false; actions.start(); return; }
      // Same lobby, opened at playing with friends: on phones that part sits below the song list.
      if (id === 'friends-btn') { this.shopOpen = false; this.focusFriends = true; actions.start(); return; }
      if (id === 'results-menu' || id === 'lobby-menu' || id === 'loading-cancel' || id === 'error-menu') { actions.menu(); return; }
      if (id === 'lobby-save-name') { this.saveName(); return; }
      if (id === 'lobby-edit-name') { this.editName = true; return; }
      if (id === 'lobby-create') { this.createRoom(); return; }
      if (id === 'lobby-join-toggle') { this.showJoin = true; return; }
      if (id === 'lobby-join') { this.joinRoom(); return; }
      if (id === 'lobby-start') { this.startDance(); return; }
      if (id === 'lobby-leave') { try { mp.disconnect(); } catch { /* ignore */ } this.showJoin = false; return; }
      if (id === 'lobby-again') { try { if (mp.amHost()) mp.resetRoom(); } catch { /* ignore */ } return; }
      const card = target.closest<HTMLElement>('[data-song]');
      if (card?.dataset.song) actions.pick(card.dataset.song);
    });
    root.addEventListener('change', (e) => {
      const input = e.target;
      if (input instanceof HTMLInputElement && input.id === 'song-file' && input.files?.[0]) actions.file(input.files[0]);
    });
  }

  private saveName(): void {
    const input = document.getElementById('lobby-name-input');
    const val = input instanceof HTMLInputElement ? input.value.trim().slice(0, 24) : '';
    if (!val) return;
    try { savePlayerName(val); } catch { /* storage unavailable */
    }
    this.editName = false;
    try { mp.setName(val); } catch { /* ignore */
    }
  }

  private createRoom(): void {
    const code = makeRoomCode();
    try { mp.connect(code, true); } catch { /* ignore */
    }
    this.showJoin = false;
  }

  private joinRoom(): void {
    const input = document.getElementById('lobby-join-code');
    const raw = input instanceof HTMLInputElement ? input.value.trim().toUpperCase() : '';
    const code = raw.replace(/[^A-Z0-9]/g, '').slice(0, 6);
    if (code.length < 4) return;
    try {
      const st = mp.getState();
      if (st.roomId && Object.keys(st.players).length >= 4) return;
    } catch { /* ignore */
    }
    try { mp.connect(code, false); } catch { /* ignore */
    }
    this.showJoin = false;
  }

  private startDance(): void {
    try {
      const st = mp.getState();
      if (!st.isHost) return;
      if (Object.keys(st.players).length < 1) return;
      mp.startSong(st.songId ?? this.roomSong);
    } catch { /* ignore */
    }
  }

  /** The built-in song a room starts with when the host hasn't picked one there. */
  private roomSong = '';

  update(m: ScreenModel): void {
    this.roomSong = songInfo(m.selected.key) ? m.selected.key : (m.songs[0]?.key ?? '');
    const p = m.flow.phase;
    const songs = `${m.selected.key}|${m.songs.length}|${m.fileStatus.kind}|${m.inRoom}|${m.boardsVersion}`;
    let key: string;
    if (p.kind === 'warmup') {
      key = `warmup-${p.step}-${p.doneAt !== null}-${p.skipped}`;
    } else if (p.kind === 'lobby') {
      let room = '';
      let players = '';
      let host = '0';
      try {
        const st = mp.getState();
        room = st.roomId ?? '';
        players = Object.values(st.players).map((pl) => `${pl.id}:${pl.name}:${pl.isHost}:${pl.status}`).join(',');
        host = st.isHost ? '1' : '0';
      } catch { /* lobby without mp */
      }
      let saved = '';
      try { saved = loadPlayerName() ?? ''; } catch { saved = ''; }
      key = `lobby-${room}-${players}-${songs}-${host}-${saved}-${this.showJoin ? '1' : '0'}-${this.editName ? '1' : '0'}`;
    } else if (p.kind === 'results') {
      const pod = sharedPodium;
      key = pod && pod.length >= 2
        ? `results-podium-${pod.map((e) => `${e.playerId}:${e.score}:${e.stars}:${e.place}`).join(',')}-${songs}`
        : `results-${songs}`;
    } else if (p.kind === 'calibrating') {
      key = `calibrating-${m.distance ?? ''}`;
    } else if (p.kind === 'waiting') {
      let players = '';
      try { players = Object.values(mp.getState().players).map((pl) => `${pl.id}:${pl.name}:${pl.ready}:${pl.status}`).join(','); } catch { /* no room */
      }
      key = `waiting-${players}`;
    } else if (p.kind === 'countdown') {
      key = `countdown-${songs}`;
    } else {
      key = p.kind;
    }
    // The shop and the coin balance live on the title screen and in the lobby.
    if (p.kind === 'intro' || p.kind === 'lobby') {
      key += `|shop:${this.shopOpen ? 1 : 0}:${m.wallet.coins}:${m.wallet.owned.join(',')}:${JSON.stringify(m.wallet.worn)}`;
    } else {
      this.shopOpen = false;
    }
    // A language switch redraws whatever screen is up.
    key = `${lang()}:${key}`;
    if (key !== this.key) {
      this.key = key;
      // A lobby update (someone joins, renames) mustn't wipe what the player is typing.
      const typed = ['lobby-name-input', 'lobby-join-code'].map((id) => {
        const el = document.getElementById(id);
        return el instanceof HTMLInputElement ? { id, value: el.value, focused: document.activeElement === el } : null;
      });
      this.root.innerHTML = this.html(m);
      if (this.focusFriends && p.kind === 'lobby') {
        this.focusFriends = false;
        const friends = this.root.querySelector<HTMLElement>('.lobby-friends');
        friends?.classList.add('focus');
        friends?.scrollIntoView({ block: 'center' });
        friends?.querySelector<HTMLElement>('#lobby-create')?.focus({ preventScroll: true });
      }
      for (const t of typed) {
        const el = t && document.getElementById(t.id);
        if (!t || !(el instanceof HTMLInputElement)) continue;
        el.value = t.value;
        if (t.focused) el.focus();
      }
    }
    const byId = (id: string) => document.getElementById(id);
    switch (p.kind) {
      case 'loading': {
        byId('load-bar')?.style.setProperty('--p', String(m.loadProgress));
        const text = byId('load-text');
        if (text) {
          text.textContent = m.loadProgress < 1
            ? t('loading.progress', { pct: Math.round(m.loadProgress * 100) })
            : t('loading.starting');
        }
        break;
      }
      case 'calibrating': {
        byId('calib-ring')?.style.setProperty('--p', String(m.calibProgress));
        const pct = byId('calib-pct');
        if (pct) pct.textContent = `${Math.round(m.calibProgress * 100)}%`;
        break;
      }
      case 'warmup': {
        byId('hold-bar')?.style.setProperty('--p', String(p.doneAt !== null ? 1 : Math.min(1, p.held / WARMUP_HOLD_S)));
        const warn = byId('step-warn');
        if (warn) {
          warn.textContent = p.doneAt === null && m.flow.t >= STEP_WARN_S
            ? t('warmup.warn', { s: Math.ceil(STEP_TIMEOUT_S - m.flow.t) })
            : '';
        }
        break;
      }
      case 'countdown': {
        const el = byId('count');
        const n = String(countdownLeft(m.flow));
        const text = byId('count-text');
        if (text && m.flow.t >= COUNTDOWN_S && !m.songReady) text.textContent = t('countdown.music');
        if (el && el.textContent !== n) {
          el.textContent = n;
          el.classList.remove('pop');
          void el.offsetWidth;
          el.classList.add('pop');
        }
        break;
      }
      case 'results': {
        const text = byId('restart-text');
        if (text) text.textContent = restartText(m);
        byId('restart')?.classList.toggle('ready', m.flow.t >= RESTART_LOCK_S);
        break;
      }
      case 'intro': case 'error': case 'dancing': case 'lobby': case 'waiting': break;
      default: {
        const _exhaustive: never = p;
        void _exhaustive;
      }
    }
  }

  private html(m: ScreenModel): string {
    const p = m.flow.phase;
    switch (p.kind) {
      case 'intro': return introHtml(m.demo, m.wallet) + (this.shopOpen ? shopHtml(m.wallet) : '');
      case 'lobby': return lobbyHtml(m, this.showJoin, this.editName) + (this.shopOpen ? shopHtml(m.wallet) : '');
      case 'loading': return loadingHtml();
      case 'error': return errorHtml(p.message);
      case 'calibrating': return calibHtml(m.distance);
      case 'waiting': return waitingHtml();
      case 'warmup': return warmupHtml(p.step, p.doneAt !== null, p.skipped);
      case 'countdown': return countdownHtml(countdownLeft(m.flow), m.selected.title);
      case 'dancing': return '';
      case 'results': return m.result ? resultsHtml(m.result, m) : '';
      default: {
        const _exhaustive: never = p;
        return _exhaustive;
      }
    }
  }
}
