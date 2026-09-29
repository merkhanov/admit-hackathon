import { countdownLeft, RESTART_LOCK_S, STEP_TIMEOUT_S, STEP_WARN_S, WARMUP, WARMUP_HOLD_S, type Flow } from '../app/flow.ts';
import type { ScoreEntry } from '../app/leaderboard.ts';
import type { PartAccuracy } from '../app/summary.ts';
import { RATING_NAMES, type Rating } from '../dance/dance.ts';
import { MOVES, type MoveId } from '../dance/moves.ts';
import { DEFAULT_SONG_ID, SONG_IDS, SONG_META, type SongId } from '../dance/songs.ts';
import { loadPlayerName, savePlayerName } from '../multiplayer/persistence.ts';
import { mp, setSong, sharedPodium } from '../main.ts';
import { pictogramSvg } from './pictogram.ts';

export interface RoundResult {
  points: number;
  stars: number;
  counts: Record<Rating, number>;
  maxCombo: number;
  accuracy: PartAccuracy[];
  advice: string[];
  place: number;
  board: ScoreEntry[];
  entry: ScoreEntry;
}

export interface ScreenModel {
  flow: Flow;
  calibProgress: number;
  /** Download share of the recognition model, 0..1. */
  loadProgress: number;
  result: RoundResult | null;
  songTitle: string;
  demo: boolean;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
const starRow = (n: number) => `<div class="star-row">${Array.from({ length: 5 }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</div>`;

const SHOWCASE: readonly MoveId[] = ['wings', 'discoL', 'muscles', 'leanL'];

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

const mpStatusRu = (s: string): string => s === 'dancing' ? 'танцует' : s === 'done' ? 'готов' : 'в лобби';

function selectedSong(songTitle: string): SongId {
  try {
    const sid = mp.getState().songId;
    if (sid) return sid;
  } catch { /* lobby without mp: fall back to title */
  }
  for (const id of SONG_IDS) {
    if (SONG_META[id].title === songTitle) return id;
  }
  return DEFAULT_SONG_ID;
}

function songCardsHtml(current: SongId, interactive: boolean): string {
  return `
  <div class="song-cards">
    ${SONG_IDS.map((id) => {
      const meta = SONG_META[id];
      const sel = id === current ? ' selected' : '';
      const stars = '★'.repeat(meta.difficulty) + '☆'.repeat(5 - meta.difficulty);
      const inner = `<strong>${esc(meta.title)}</strong><span>${meta.bpm} BPM</span><span class="song-diff">${stars}</span>`;
      return interactive
        ? `<button type="button" class="song-card${sel}" data-song-id="${id}">${inner}</button>`
        : `<div class="song-card${sel}" data-song-id="${id}">${inner}</div>`;
    }).join('')}
  </div>`;
}

function lobbyHtml(songTitle: string, showJoin: boolean): string {
  let saved: string | null = null;
  try { saved = loadPlayerName(); } catch { saved = null; }
  let roomId: string | null = null;
  let players: { id: string; name: string; isHost: boolean; status: string }[] = [];
  let isHost = false;
  let songId: SongId = DEFAULT_SONG_ID;
  try {
    const st = mp.getState();
    roomId = st.roomId;
    players = Object.values(st.players);
    isHost = st.isHost;
    songId = st.songId ?? selectedSong(songTitle);
  } catch {
    songId = selectedSong(songTitle);
  }
  const count = players.length;
  const full = count >= 4;

  const nameBlock = saved
    ? `<p class="muted">Вы: <strong>${esc(saved)}</strong></p>`
    : `<div class="lobby-name">
        <label for="lobby-name-input">Ваше имя</label>
        <input id="lobby-name-input" type="text" maxlength="24" placeholder="Введите имя" autocomplete="off" />
        <button id="lobby-save-name" class="cta" type="button">Сохранить</button>
        <p class="muted">Имя сохраняется на этом устройстве.</p>
      </div>`;

  const roomBlock = roomId
    ? `<div class="room-code-wrap"><span>Код комнаты:</span><strong class="room-code">${esc(roomId)}</strong></div>
       <button id="lobby-leave" type="button" class="link-btn">Покинуть</button>`
    : `<div class="lobby-actions">
        <button id="lobby-create" class="cta" type="button">Создать комнату</button>
        <button id="lobby-join-toggle" class="cta" type="button">Присоединиться по коду</button>
      </div>
      ${showJoin ? `<div class="lobby-join">
        <input id="lobby-join-code" type="text" maxlength="6" placeholder="Код комнаты" autocomplete="off" />
        <button id="lobby-join" class="cta" type="button"${full ? ' disabled' : ''}>Войти</button>
      </div>` : ''}
      ${full ? '<p class="muted">Комната заполнена (4/4).</p>' : ''}`;

  const playersBlock = roomId
    ? `<h3>Игроки · ${count}/4</h3>
      ${count === 0 ? '<p class="muted">Пока никого нет.</p>' : `<ul class="lobby-players">
        ${players.map((p) => `<li><span>${esc(p.name)}</span>${p.isHost ? '<em class="host-badge">Хост</em>' : ''}<em>${esc(mpStatusRu(p.status))}</em></li>`).join('')}
      </ul>`}`
    : '';

  const songsBlock = `
    <h3>Песня</h3>
    <p class="muted">${roomId ? (isHost ? 'Выберите песню для всех.' : 'Песню выбирает хост.') : 'Выберите песню.'}</p>
    ${songCardsHtml(songId, !roomId || isHost)}`;

  const startBlock = roomId
    ? (isHost
      ? `<button id="lobby-start" class="cta" type="button"${count < 1 ? ' disabled' : ''}>Начать танец</button>`
      : '<p class="muted">Ожидание хоста...</p>')
    : `<button id="start-btn" class="cta" type="button">Танцевать одному</button>
       <p class="muted">Или создайте комнату для игры с друзьями.</p>`;

  return `
  <section class="screen center lobby">
    <div class="over-card lobby-card">
      <button id="lobby-menu" class="menu-x" type="button" aria-label="В главное меню" title="В главное меню">×</button>
      <p class="chip">Мультиплеер · до 4 игроков</p>
      <h2>Лобби</h2>
      ${nameBlock}
      ${roomBlock}
      ${playersBlock}
      ${songsBlock}
      ${startBlock}
    </div>
  </section>`;
}

function podiumHtml(): string {
  const pod = sharedPodium;
  if (!pod || pod.length < 2) return '';
  const sorted = [...pod].sort((a, b) => a.place - b.place);
  return `
  <div class="mp-podium">
    <h3>Общий зачёт</h3>
    <ol class="podium">
      ${sorted.map((e) => {
        const s = Math.max(0, Math.min(5, e.stars));
        return `<li class="${e.place === 1 ? 'winner' : ''}"><span class="pod-place">${e.place}</span><span class="pod-name">${esc(e.name)}</span><span class="pod-score">${e.score}</span><span class="pod-stars">${'★'.repeat(s)}${'☆'.repeat(5 - s)}</span></li>`;
      }).join('')}
    </ol>
    <button id="lobby-again" class="cta" type="button">Танцевать снова</button>
    <p class="muted">Хост вернёт всех в лобби.</p>
  </div>`;
}

function introHtml(demo: boolean): string {
  return `
  <section class="screen intro">
    <div class="intro-card">
      <h1 class="logo">Motion <span>Dance</span></h1>
      <p class="lead">Танцуй перед камерой. Повторяй движения за тренером как в зеркале, а игра оценит каждое движение и подскажет, что поправить: какую руку поднять выше и насколько.</p>
      <ul class="gesture-grid">
        ${SHOWCASE.map((id) => `
          <li class="gesture-card">
            <span class="gesture-icon">${pictogramSvg(MOVES[id], { outline: true })}</span>
            <strong>${MOVES[id].name}</strong>
          </li>`).join('')}
      </ul>
      <button class="cta" id="start-btn" type="button">${demo ? 'Запустить демо без камеры' : 'Включить камеру и танцевать'}</button>
      <p class="fineprint">Дальше мышь и клавиатура не нужны. Встань в 1,5–2 м от камеры, чтобы в кадре были голова, плечи и разведённые руки. Можно танцевать сидя. Видео обрабатывается прямо в браузере и никуда не отправляется, музыка генерируется там же.</p>
      <p class="credit">Admit Hackathon 2026, кейс «Motion»</p>
    </div>
  </section>`;
}

const loadingHtml = () => `
  <section class="screen center">
    <div class="spinner" aria-hidden="true"></div>
    <h2>Загружаю распознавание движений</h2>
    <div class="load-bar" aria-hidden="true"><i id="load-bar"></i></div>
    <p class="muted" id="load-text">Разреши доступ к камере, если браузер спросит.</p>
    <button id="loading-cancel" class="link-btn" type="button">Отмена</button>
  </section>`;

const errorHtml = (message: string) => `
  <section class="screen center">
    <h2>Камера не запустилась</h2>
    <p class="error-text">${esc(message)}</p>
    <button class="cta" id="retry-btn" type="button">Попробовать снова</button>
    <button id="error-menu" class="link-btn" type="button">В главное меню</button>
  </section>`;

const calibHtml = () => `
  <section class="screen side">
    <div class="panel">
      <p class="chip">Калибровка</p>
      <h2>Встань ровно и опусти руки</h2>
      <p class="muted">Я запомню твою обычную позу. От неё считаются присед и наклоны.</p>
      <div class="ring" id="calib-ring" style="--p:0"><span id="calib-pct">0%</span></div>
    </div>
  </section>`;

function warmupHtml(step: number, done: boolean, skipped: boolean): string {
  const s = WARMUP[step];
  const title = skipped ? 'Пропустим пока' : done ? 'Отлично!' : s.title;
  const text = skipped ? 'Поза не совпала. В песне подсказки внизу помогут.' : done ? 'Поза совпала.' : s.text;
  return `
  <section class="screen side">
    <div class="panel ${skipped ? 'panel-skipped' : done ? 'panel-done' : ''}">
      <p class="chip">Разминка · ${step + 1} из ${WARMUP.length}</p>
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
    <p class="muted">Песня «${esc(title)}». Повторяй за тренером!</p>
  </section>`;

function resultsHtml(r: RoundResult): string {
  const date = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const ratings: readonly Rating[] = ['perfect', 'good', 'ok', 'miss'];
  return `
  <section class="screen center over">
    <div class="over-card">
      <button id="results-menu" class="menu-x" type="button" aria-label="В главное меню" title="В главное меню">×</button>
      <p class="chip ${r.place === 0 ? 'chip-record' : ''}">${r.place === 0 ? 'Новый рекорд!' : 'Танец окончен'}</p>
      ${starRow(r.stars)}
      <div class="big-score">${r.points}</div>
      <ul class="stats">
        ${ratings.map((k) => `<li class="rating-${k}"><strong>${r.counts[k]}</strong><span>${RATING_NAMES[k]}</span></li>`).join('')}
        <li><strong>×${r.maxCombo}</strong><span>лучшее комбо</span></li>
      </ul>
      <div class="over-columns">
        <div>
          <h3>Точность по частям тела</h3>
          <ul class="accuracy">
            ${r.accuracy.slice(0, 4).map((a) => `<li><span>${a.name}</span><b style="--p:${a.pct / 100}"><i></i></b><em>${a.pct}%</em></li>`).join('')}
          </ul>
          <h3>Что подтянуть</h3>
          ${r.advice.length
            ? `<ol class="advice">${r.advice.map((a) => `<li>${esc(a)}</li>`).join('')}</ol>`
            : '<p class="muted">Ошибок почти не было. Чистый танец!</p>'}
        </div>
        <div>
          <h3>Рекорды на этом устройстве</h3>
          <ol class="board">
            ${r.board.map((e) => `<li class="${e === r.entry ? 'me' : ''}"><span>${e.score}</span><em>${'★'.repeat(e.stars)} · ${date(e.at)}</em></li>`).join('')}
          </ol>
        </div>
      </div>
      ${podiumHtml()}
      <p class="restart" id="restart">Подними руку над головой, чтобы станцевать ещё раз</p>
    </div>
  </section>`;
}

/** Renders the overlay for the current phase. Rebuilds DOM only when the phase changes. */
export class Screens {
  private readonly root: HTMLElement;
  private readonly onStart: () => void;
  private readonly onMenu: () => void;
  private key = '';
  private showJoin = false;

  constructor(root: HTMLElement, onStart: () => void, onMenu: () => void) {
    this.root = root;
    this.onStart = onStart;
    this.onMenu = onMenu;
    root.addEventListener('click', (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      const btn = target.closest('button');
      const id = btn?.id ?? target.id;
      if (id === 'start-btn' || id === 'retry-btn') { this.onStart(); return; }
      if (id === 'results-menu' || id === 'lobby-menu' || id === 'loading-cancel' || id === 'error-menu') { this.onMenu(); return; }
      if (id === 'lobby-save-name') { this.saveName(); return; }
      if (id === 'lobby-create') { this.createRoom(); return; }
      if (id === 'lobby-join-toggle') { this.showJoin = true; return; }
      if (id === 'lobby-join') { this.joinRoom(); return; }
      if (id === 'lobby-start') { this.startDance(); return; }
      if (id === 'lobby-leave') { try { mp.disconnect(); } catch { /* ignore */ } this.showJoin = false; return; }
      if (id === 'lobby-again') { try { if (mp.amHost()) mp.resetRoom(); } catch { /* ignore */ } return; }
      const songEl = target.closest('[data-song-id]');
      if (songEl instanceof HTMLElement) {
        const sid = songEl.getAttribute('data-song-id');
        if (sid && (SONG_IDS as readonly string[]).includes(sid)) {
          const songId = sid as SongId;
          let inRoom = false;
          let host = false;
          try {
            const st = mp.getState();
            inRoom = st.roomId !== null;
            host = st.isHost;
          } catch { /* lobby without mp */
          }
          if (inRoom && !host) return;
          try { setSong(songId); } catch { /* ignore */ }
          try { if (inRoom && host) mp.selectSong(songId); } catch { /* ignore */ }
        }
      }
    });
  }

  private saveName(): void {
    const input = document.getElementById('lobby-name-input');
    const val = input instanceof HTMLInputElement ? input.value.trim().slice(0, 24) : '';
    if (!val) return;
    try { savePlayerName(val); } catch { /* storage unavailable */
    }
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
      mp.startSong(st.songId ?? DEFAULT_SONG_ID);
    } catch { /* ignore */
    }
  }

  update(m: ScreenModel): void {
    const p = m.flow.phase;
    let key: string;
    if (p.kind === 'warmup') {
      key = `warmup-${p.step}-${p.doneAt !== null}-${p.skipped}`;
    } else if (p.kind === 'lobby') {
      let room = '';
      let players = '';
      let song = '';
      let host = '0';
      try {
        const st = mp.getState();
        room = st.roomId ?? '';
        players = Object.values(st.players).map((pl) => `${pl.id}:${pl.name}:${pl.isHost}:${pl.status}`).join(',');
        // Solo (no room) never sets mp.songId, so derive from the title like
        // lobbyHtml does — otherwise the key never changes and the highlight
        // freezes after setSong().
        song = st.songId ?? selectedSong(m.songTitle);
        host = st.isHost ? '1' : '0';
      } catch {
        song = selectedSong(m.songTitle);
      }
      let saved = '';
      try { saved = loadPlayerName() ?? ''; } catch { saved = ''; }
      key = `lobby-${room}-${players}-${song}-${host}-${saved}-${this.showJoin ? '1' : '0'}`;
    } else if (p.kind === 'results') {
      const pod = sharedPodium;
      key = pod && pod.length >= 2
        ? `results-podium-${pod.map((e) => `${e.playerId}:${e.score}:${e.stars}:${e.place}`).join(',')}`
        : 'results';
    } else {
      key = p.kind;
    }
    if (key !== this.key) {
      this.key = key;
      this.root.innerHTML = this.html(m);
    }
    const byId = (id: string) => document.getElementById(id);
    switch (p.kind) {
      case 'loading': {
        byId('load-bar')?.style.setProperty('--p', String(m.loadProgress));
        const text = byId('load-text');
        if (text) {
          text.textContent = m.loadProgress < 1
            ? `Модель распознавания: ${Math.round(m.loadProgress * 100)}%. Разреши доступ к камере, если браузер спросит.`
            : 'Запускаю нейросеть. Это займёт пару секунд.';
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
            ? `Не получается? Через ${Math.ceil(STEP_TIMEOUT_S - m.flow.t)} с перейдём дальше.`
            : '';
        }
        break;
      }
      case 'countdown': {
        const el = byId('count');
        const n = String(countdownLeft(m.flow));
        if (el && el.textContent !== n) {
          el.textContent = n;
          el.classList.remove('pop');
          void el.offsetWidth;
          el.classList.add('pop');
        }
        break;
      }
      case 'results': {
        const el = byId('restart');
        const left = Math.ceil(RESTART_LOCK_S - m.flow.t);
        if (el) {
          el.textContent = left > 0 ? `Можно начать заново через ${left} с` : 'Подними руку над головой, чтобы станцевать ещё раз';
          el.classList.toggle('ready', left <= 0);
        }
        break;
      }
      case 'intro': case 'error': case 'dancing': case 'lobby': break;
      default: {
        const _exhaustive: never = p;
        void _exhaustive;
      }
    }
  }

  private html(m: ScreenModel): string {
    const p = m.flow.phase;
    switch (p.kind) {
      case 'intro': return introHtml(m.demo);
      case 'lobby': return lobbyHtml(m.songTitle, this.showJoin);
      case 'loading': return loadingHtml();
      case 'error': return errorHtml(p.message);
      case 'calibrating': return calibHtml();
      case 'warmup': return warmupHtml(p.step, p.doneAt !== null, p.skipped);
      case 'countdown': return countdownHtml(countdownLeft(m.flow), m.songTitle);
      case 'dancing': return '';
      case 'results': return m.result ? resultsHtml(m.result) : '';
      default: {
        const _exhaustive: never = p;
        return _exhaustive;
      }
    }
  }
}
