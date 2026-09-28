import { countdownLeft, RESTART_LOCK_S, STEP_TIMEOUT_S, STEP_WARN_S, WARMUP, WARMUP_HOLD_S, type Flow } from '../app/flow.ts';
import type { ScoreEntry } from '../app/leaderboard.ts';
import type { PartAccuracy } from '../app/summary.ts';
import { RATING_NAMES, type Rating } from '../dance/dance.ts';
import { MOVES, type MoveId } from '../dance/moves.ts';
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

function introHtml(demo: boolean): string {
  return `
  <section class="screen intro">
    <div class="intro-card">
      <p class="eyebrow">Admit Hackathon · кейс Motion</p>
      <h1 class="logo">Motion<span>Dance</span></h1>
      <p class="lead">Танцуй перед камерой. Повторяй движения за тренером как в зеркале, а игра оценит каждое движение и подскажет, что поправить: какую руку поднять выше и насколько.</p>
      <ul class="gesture-grid">
        ${SHOWCASE.map((id) => `
          <li class="gesture-card">
            <span class="gesture-icon">${pictogramSvg(MOVES[id])}</span>
            <strong>${MOVES[id].name}</strong>
          </li>`).join('')}
      </ul>
      <button class="cta" id="start-btn" type="button">${demo ? 'Запустить демо без камеры' : 'Включить камеру и танцевать'}</button>
      <p class="fineprint">Дальше мышь и клавиатура не нужны. Встань в 1,5–2 м от камеры, чтобы в кадре были голова, плечи и разведённые руки. Можно танцевать сидя. Видео обрабатывается прямо в браузере и никуда не отправляется, музыка генерируется там же.</p>
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
      <p class="eyebrow">Калибровка</p>
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
      <p class="eyebrow">Разминка · ${step + 1} из ${WARMUP.length}</p>
      <div class="dots">${WARMUP.map((_, i) => `<i class="${i < step || (i === step && done) ? 'on' : ''}"></i>`).join('')}</div>
      <span class="tutorial-icon">${pictogramSvg(MOVES[s.move])}</span>
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
      <p class="eyebrow">${r.place === 0 ? 'Новый рекорд!' : 'Танец окончен'}</p>
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
      <p class="restart" id="restart">Подними руку над головой, чтобы станцевать ещё раз</p>
    </div>
  </section>`;
}

/** Renders the overlay for the current phase. Rebuilds DOM only when the phase changes. */
export class Screens {
  private readonly root: HTMLElement;
  private readonly onStart: () => void;
  private key = '';

  constructor(root: HTMLElement, onStart: () => void) {
    this.root = root;
    this.onStart = onStart;
    root.addEventListener('click', (e) => {
      const target = e.target;
      if (target instanceof HTMLElement && (target.id === 'start-btn' || target.id === 'retry-btn')) this.onStart();
    });
  }

  update(m: ScreenModel): void {
    const p = m.flow.phase;
    const key = p.kind === 'warmup' ? `warmup-${p.step}-${p.doneAt !== null}-${p.skipped}` : p.kind;
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
      case 'intro': return introHtml(m.demo);
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
