import { countdownLeft, RESTART_LOCK_S, STEP_TIMEOUT_S, STEP_WARN_S, TUTORIAL, type Flow } from '../app/flow.ts';
import type { ScoreEntry } from '../app/leaderboard.ts';
import { GESTURE_ICONS } from './icons.ts';

export interface RoundResult {
  score: number;
  coins: number;
  distance: number;
  cleared: number;
  place: number;
  board: ScoreEntry[];
  entry: ScoreEntry;
  advice: string[];
}

export interface ScreenModel {
  flow: Flow;
  calibProgress: number;
  /** Download share of the recognition model, 0..1. */
  loadProgress: number;
  result: RoundResult | null;
  demo: boolean;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

const INTRO_GESTURES = [
  { icon: GESTURE_ICONS.jump, name: 'Прыжок', how: 'рука выше головы', what: 'через барьер' },
  { icon: GESTURE_ICONS.duck, name: 'Присед', how: 'плечи вниз', what: 'под перекладиной' },
  { icon: GESTURE_ICONS.leanL, name: 'Наклон', how: 'плечи влево или вправо', what: 'смена дорожки' },
  { icon: GESTURE_ICONS.punch, name: 'Удар', how: 'прямая рука в сторону', what: 'разбить ящик' },
];

function introHtml(demo: boolean): string {
  return `
  <section class="screen intro">
    <div class="intro-card">
      <p class="eyebrow">Admit Hackathon · кейс Motion</p>
      <h1 class="logo">Motion<span>Runner</span></h1>
      <p class="lead">Беги телом. Камера вместо джойстика: прыгай, приседай, наклоняйся и бей, а игра подскажет, если движение получилось неточным.</p>
      <ul class="gesture-grid">
        ${INTRO_GESTURES.map((g) => `
          <li class="gesture-card">
            <span class="gesture-icon">${g.icon}</span>
            <strong>${g.name}</strong>
            <span>${g.how}</span>
            <em>${g.what}</em>
          </li>`).join('')}
      </ul>
      <button class="cta" id="start-btn" type="button">${demo ? 'Запустить демо без камеры' : 'Включить камеру и играть'}</button>
      <p class="fineprint">Дальше мышь и клавиатура не нужны. Встань в 1,5–2 м от камеры или сядь так, чтобы в кадре были голова, плечи и руки. Видео обрабатывается прямо в браузере и никуда не отправляется.</p>
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
      <p class="eyebrow">Шаг 1 · калибровка</p>
      <h2>Встань ровно и опусти руки</h2>
      <p class="muted">Я запомню твою обычную позу. От неё считаются присед и наклоны.</p>
      <div class="ring" id="calib-ring" style="--p:0"><span id="calib-pct">0%</span></div>
    </div>
  </section>`;

function tutorialHtml(step: number, done: boolean, skipped: boolean): string {
  const s = TUTORIAL[step];
  const title = skipped ? 'Пропустим пока' : done ? 'Отлично!' : s.title;
  const text = skipped
    ? 'Этот жест не распознался. Попробуешь его в игре, подсказки внизу помогут.'
    : done ? 'Жест распознан.' : s.text;
  return `
  <section class="screen side">
    <div class="panel ${skipped ? 'panel-skipped' : done ? 'panel-done' : ''}">
      <p class="eyebrow">Обучение · ${step + 1} из ${TUTORIAL.length}</p>
      <div class="dots">${TUTORIAL.map((_, i) => `<i class="${i < step || (i === step && done) ? 'on' : ''}"></i>`).join('')}</div>
      <span class="tutorial-icon">${GESTURE_ICONS[s.gesture]}</span>
      <h2>${title}</h2>
      <p class="muted">${text}</p>
      <p class="step-warn" id="step-warn"></p>
    </div>
  </section>`;
}

const countdownHtml = (n: number) => `
  <section class="screen center countdown">
    <div class="count" id="count">${n}</div>
    <p class="muted">Приготовься: препятствия уже бегут навстречу</p>
  </section>`;

function overHtml(r: RoundResult): string {
  const record = r.place === 0;
  const date = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return `
  <section class="screen center over">
    <div class="over-card">
      <p class="eyebrow">${record ? 'Новый рекорд!' : 'Забег окончен'}</p>
      <div class="big-score">${r.score}</div>
      <ul class="stats">
        <li><strong>${Math.round(r.distance * 100)} м</strong><span>дистанция</span></li>
        <li><strong>${r.coins}</strong><span>монеты</span></li>
        <li><strong>${r.cleared}</strong><span>препятствий пройдено</span></li>
      </ul>
      <div class="over-columns">
        <div>
          <h3>Разбор движений</h3>
          ${r.advice.length
            ? `<ol class="advice">${r.advice.map((a) => `<li>${esc(a)}</li>`).join('')}</ol>`
            : '<p class="muted">Ошибок почти не было. Чистый забег!</p>'}
        </div>
        <div>
          <h3>Рекорды на этом устройстве</h3>
          <ol class="board">
            ${r.board.map((e) => `<li class="${e === r.entry ? 'me' : ''}"><span>${e.score}</span><em>${date(e.at)}</em></li>`).join('')}
          </ol>
        </div>
      </div>
      <p class="restart" id="restart">Подними руку над головой, чтобы сыграть снова</p>
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
    const key = p.kind === 'tutorial' ? `tutorial-${p.step}-${p.doneAt !== null}-${p.skipped}` : p.kind;
    if (key !== this.key) {
      this.key = key;
      this.root.innerHTML = this.html(m);
    }
    if (p.kind === 'loading') {
      const bar = document.getElementById('load-bar');
      const text = document.getElementById('load-text');
      bar?.style.setProperty('--p', String(m.loadProgress));
      if (text) {
        text.textContent = m.loadProgress < 1
          ? `Модель распознавания: ${Math.round(m.loadProgress * 100)}%. Разреши доступ к камере, если браузер спросит.`
          : 'Запускаю нейросеть. Это займёт пару секунд.';
      }
    } else if (p.kind === 'calibrating') {
      const ring = document.getElementById('calib-ring');
      const pct = document.getElementById('calib-pct');
      ring?.style.setProperty('--p', String(m.calibProgress));
      if (pct) pct.textContent = `${Math.round(m.calibProgress * 100)}%`;
    } else if (p.kind === 'tutorial') {
      const el = document.getElementById('step-warn');
      if (el) {
        el.textContent = p.doneAt === null && m.flow.t >= STEP_WARN_S
          ? `Не получается? Через ${Math.ceil(STEP_TIMEOUT_S - m.flow.t)} с перейдём к следующему жесту.`
          : '';
      }
    } else if (p.kind === 'countdown') {
      const el = document.getElementById('count');
      const n = String(countdownLeft(m.flow));
      if (el && el.textContent !== n) {
        el.textContent = n;
        el.classList.remove('pop');
        void el.offsetWidth;
        el.classList.add('pop');
      }
    } else if (p.kind === 'over') {
      const el = document.getElementById('restart');
      const left = Math.ceil(RESTART_LOCK_S - m.flow.t);
      if (el) {
        el.textContent = left > 0 ? `Можно начать заново через ${left} с` : 'Подними руку над головой, чтобы сыграть снова';
        el.classList.toggle('ready', left <= 0);
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
      case 'tutorial': return tutorialHtml(p.step, p.doneAt !== null, p.skipped);
      case 'countdown': return countdownHtml(countdownLeft(m.flow));
      case 'playing': return '';
      case 'over': return m.result ? overHtml(m.result) : '';
      default: {
        const _exhaustive: never = p;
        return _exhaustive;
      }
    }
  }
}
