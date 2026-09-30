import { COUNTDOWN_S, countdownLeft, RESTART_LOCK_S, STEP_TIMEOUT_S, STEP_WARN_S, WARMUP, WARMUP_HOLD_S, type Flow } from '../app/flow.ts';
import type { ScoreEntry } from '../app/leaderboard.ts';
import type { PartAccuracy } from '../app/summary.ts';
import type { FileStatus } from '../app/tracks.ts';
import { RATING_NAMES, type Rating } from '../dance/dance.ts';
import { MOVES } from '../dance/moves.ts';
import { songDuration, type Song } from '../dance/song.ts';
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
}

/** A song as the picker shows it. */
export interface SongCard {
  key: string;
  song: Song;
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
  calibProgress: number;
  /** Download share of the recognition model, 0..1. */
  loadProgress: number;
  result: RoundResult | null;
  demo: boolean;
}

export interface ScreenActions {
  start(): void;
  pick(key: string): void;
  file(file: File): void;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
const starRow = (n: number) => `<div class="star-row">${Array.from({ length: 5 }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</div>`;

const minutes = (seconds: number) => {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** The move that shows a song best: the first one that isn't a plain arms-out or arms-up. */
function signatureMove(song: Song) {
  const plain = new Set(['wings', 'up', 'vee']);
  const step = song.steps.find((s) => !plain.has(s.move)) ?? song.steps[0];
  return MOVES[step.move];
}

function songCardHtml(c: SongCard, selected: boolean): string {
  return `
    <li>
      <button type="button" class="song-card ${selected ? 'selected' : ''}" data-song="${esc(c.key)}" aria-pressed="${selected}">
        <span class="song-icon">${pictogramSvg(signatureMove(c.song), { outline: true })}</span>
        <span class="song-text">
          <strong>${esc(c.song.title)}</strong>
          <em>${esc(c.credit)}</em>
          <small>${minutes(songDuration(c.song))} · ${c.song.steps.length} движений</small>
        </span>
      </button>
    </li>`;
}

function fileHtml(status: FileStatus): string {
  const note = status.kind === 'loading' ? `Слушаю «${esc(status.name)}» и ищу ритм…`
    : status.kind === 'error' ? esc(status.text)
    : 'MP3, M4A, WAV или OGG с твоего устройства. Файл никуда не загружается: игра слушает его прямо в браузере и ставит движения на бит.';
  return `
    <label class="file-pick ${status.kind === 'error' ? 'file-error' : ''}">
      <input type="file" id="song-file" accept="audio/*" ${status.kind === 'loading' ? 'disabled' : ''} />
      <strong>${status.kind === 'loading' ? 'Готовлю танец…' : '+ Танцевать под свою песню'}</strong>
      <span>${note}</span>
    </label>`;
}

function introHtml(m: ScreenModel): string {
  return `
  <section class="screen intro">
    <div class="intro-card">
      <h1 class="logo">Motion <span>Dance</span></h1>
      <p class="lead">Танцуй перед камерой. Повторяй движения за тренером как в зеркале, а игра оценит каждое движение и подскажет, что поправить: какую руку поднять выше и насколько.</p>
      <h3>Выбери песню</h3>
      <ul class="song-grid">${m.songs.map((c) => songCardHtml(c, c.key === m.selected.key)).join('')}</ul>
      <p class="song-about"><b>«${esc(m.selected.song.title)}»:</b> ${esc(m.selected.dances)}. Тренер: ${esc(m.selected.coach.toLowerCase())}.</p>
      ${m.selected.warning ? `<p class="song-warning">${esc(m.selected.warning)}</p>` : ''}
      <button class="cta" id="start-btn" type="button">${m.demo ? 'Запустить демо без камеры' : 'Включить камеру и танцевать'}</button>
      ${fileHtml(m.fileStatus)}
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
  </section>`;

const errorHtml = (message: string) => `
  <section class="screen center">
    <h2>Камера не запустилась</h2>
    <p class="error-text">${esc(message)}</p>
    <button class="cta" id="retry-btn" type="button">Попробовать снова</button>
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
    <p class="muted" id="count-text">Песня «${esc(title)}». Повторяй за тренером!</p>
  </section>`;

function resultsHtml(r: RoundResult, m: ScreenModel): string {
  const date = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const ratings: readonly Rating[] = ['perfect', 'good', 'ok', 'miss'];
  return `
  <section class="screen center over">
    <div class="over-card">
      <p class="chip ${r.place === 0 ? 'chip-record' : ''}">${r.place === 0 ? 'Новый рекорд!' : 'Танец окончен'} · ${esc(r.songTitle)}</p>
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
      <div class="restart" id="restart">
        <p class="song-switch">
          <span>← Наклонись влево: «${esc(m.prev.song.title)}»</span>
          <span>Наклонись вправо: «${esc(m.next.song.title)}» →</span>
        </p>
        <p id="restart-text">${esc(restartText(m))}</p>
      </div>
    </div>
  </section>`;
}

const restartText = (m: ScreenModel) => {
  const left = Math.ceil(RESTART_LOCK_S - m.flow.t);
  return left > 0 ? `Можно начать через ${left} с` : `Подними руку над головой, чтобы станцевать «${m.selected.song.title}»`;
};

/** Renders the overlay for the current phase. Rebuilds DOM only when the phase or the song list changes. */
export class Screens {
  private readonly root: HTMLElement;
  private key = '';

  constructor(root: HTMLElement, actions: ScreenActions) {
    this.root = root;
    root.addEventListener('click', (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (target.id === 'start-btn' || target.id === 'retry-btn') { actions.start(); return; }
      const card = target.closest<HTMLElement>('[data-song]');
      if (card?.dataset.song) actions.pick(card.dataset.song);
    });
    root.addEventListener('change', (e) => {
      const input = e.target;
      if (input instanceof HTMLInputElement && input.id === 'song-file' && input.files?.[0]) actions.file(input.files[0]);
    });
  }

  update(m: ScreenModel): void {
    const p = m.flow.phase;
    const songs = `${m.selected.key}|${m.songs.length}|${m.fileStatus.kind}`;
    const key = p.kind === 'warmup' ? `warmup-${p.step}-${p.doneAt !== null}-${p.skipped}`
      : p.kind === 'intro' || p.kind === 'results' || p.kind === 'countdown' ? `${p.kind}-${songs}`
      : p.kind;
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
        const text = byId('count-text');
        if (text && m.flow.t >= COUNTDOWN_S && !m.songReady) text.textContent = 'Готовлю музыку…';
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
      case 'intro': case 'error': case 'dancing': break;
      default: {
        const _exhaustive: never = p;
        void _exhaustive;
      }
    }
  }

  private html(m: ScreenModel): string {
    const p = m.flow.phase;
    switch (p.kind) {
      case 'intro': return introHtml(m);
      case 'loading': return loadingHtml();
      case 'error': return errorHtml(p.message);
      case 'calibrating': return calibHtml();
      case 'warmup': return warmupHtml(p.step, p.doneAt !== null, p.skipped);
      case 'countdown': return countdownHtml(countdownLeft(m.flow), m.selected.song.title);
      case 'dancing': return '';
      case 'results': return m.result ? resultsHtml(m.result, m) : '';
      default: {
        const _exhaustive: never = p;
        return _exhaustive;
      }
    }
  }
}
