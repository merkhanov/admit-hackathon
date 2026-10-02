import { maxPoints, ratingName, STAR_THRESHOLDS, stars, type DanceState, type Rating } from '../dance/dance.ts';
import { MOVES } from '../dance/moves.ts';
import type { Cue } from '../dance/judge.ts';
import { beatTime, type Song } from '../dance/song.ts';
import { t } from '../i18n.ts';
import { pictogramSvg } from './pictogram.ts';

export type Banner = (
  | { tone: 'fix' | 'calib'; label: string; text: string; progress: number }
  | { tone: 'frame' | 'miss' | 'good'; label: string; text: string }
) & { cue?: Cue | null };

/** Big direction icons next to a correction, readable from across the room. Arrows rotate by CSS. */
const CUE_SVG: Record<Cue, string> = {
  up: '<path d="M24 40V9M11 22 24 9l13 13"/>',
  down: '<path d="M24 40V9M11 22 24 9l13 13"/>',
  left: '<path d="M24 40V9M11 22 24 9l13 13"/>',
  right: '<path d="M24 40V9M11 22 24 9l13 13"/>',
  bend: '<path d="M10 38c0-16 10-26 28-26"/><path d="m30 4 8 8-8 8"/>',
  straighten: '<path d="M7 24h34M15 16l-8 8 8 8M33 16l8 8-8 8"/>',
  look: '<path d="M4 24c6-9 13-13 20-13s14 4 20 13c-6 9-13 13-20 13S10 33 4 24z"/><circle cx="24" cy="24" r="5"/>',
};
const cueSvg = (cue: Cue) => `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">${CUE_SVG[cue]}</svg>`;

function el<T extends HTMLElement>(id: string, type: new () => T): T {
  const node = document.getElementById(id);
  if (!(node instanceof type)) throw new Error(`Missing #${id}`);
  return node;
}

const PICTO_COLORS = ['var(--bubblegum)', 'var(--sky)', 'var(--mint)', 'var(--sunshine)', 'var(--tangerine)'];

/** Pixels the move strip scrolls per second. */
const PICTO_SPEED = 170;
/** Distance from the strip's left edge to the "now" marker. */
const PICTO_NOW = 60;

/** Score, stars, combo, the verdict pop-up, the move strip, the camera window and the hint banner. */
export class Hud {
  private readonly hud = el('hud', HTMLElement);
  private readonly score = el('hud-score', HTMLElement);
  private readonly starsEl = el('hud-stars', HTMLElement);
  private readonly starBar = el('hud-star-bar', HTMLElement);
  private readonly combo = el('hud-combo', HTMLElement);
  private readonly verdict = el('verdict', HTMLElement);
  private readonly pictos = el('pictos', HTMLElement);
  private readonly track = el('pictos-track', HTMLElement);
  private readonly pip = el('pip', HTMLElement);
  private readonly banner = el('banner', HTMLElement);
  private readonly bannerLabel = el('banner-label', HTMLElement);
  private readonly bannerText = el('banner-text', HTMLElement);
  private readonly bannerMeter = el('banner-meter', HTMLElement);
  private readonly bannerCue = el('banner-cue', HTMLElement);
  private shownCue: Cue | null = null;
  private readonly pictoEls = new Map<number, HTMLElement>();
  private shownStars = -1;

  showDance(state: DanceState | null, song: Song): void {
    this.hud.hidden = state === null;
    if (!state) return;
    this.score.textContent = String(state.points);
    this.combo.hidden = state.combo < 2;
    this.combo.textContent = t('hud.combo', { n: state.combo });
    // The gauge fills bottom to top; each star sits at the share of the maximum that lights it.
    this.starBar.style.setProperty('--p', String(Math.min(1, state.points / maxPoints(song))));
    const n = stars(state.points, song);
    if (n !== this.shownStars) {
      const gained = n > this.shownStars && this.shownStars >= 0;
      this.shownStars = n;
      this.starsEl.innerHTML = STAR_THRESHOLDS.map((t, i) =>
        `<i class="${i < n ? 'on' : ''}${gained && i === n - 1 ? ' new' : ''}" style="--at:${t}"></i>`).join('');
    }
  }

  showVerdict(rating: Rating): void {
    this.verdict.hidden = false;
    this.verdict.dataset.rating = rating;
    this.verdict.textContent = ratingName(rating);
    this.verdict.classList.remove('pop');
    void this.verdict.offsetWidth;
    this.verdict.classList.add('pop');
  }

  hideVerdict(): void {
    this.verdict.hidden = true;
  }

  /** Upcoming moves slide towards the "now" marker; each reaches it on the beat the coach hits it. */
  showPictos(song: Song | null, time: number): void {
    this.pictos.hidden = song === null;
    if (!song) return;
    const width = this.track.clientWidth || 560;
    const seen = new Set<number>();
    song.steps.forEach((step, i) => {
      const x = PICTO_NOW + (beatTime(song, step.beat) - time) * PICTO_SPEED;
      if (x < -80 || x > width + 40) return;
      seen.add(i);
      let node = this.pictoEls.get(i);
      if (!node) {
        node = document.createElement('div');
        node.className = 'picto';
        // Each pictogram gets the next colour of the palette, so neighbours are easy to tell apart.
        node.style.setProperty('--picto', PICTO_COLORS[i % PICTO_COLORS.length]);
        node.innerHTML = pictogramSvg(step.pose ?? MOVES[step.move], { outline: true });
        this.track.append(node);
        this.pictoEls.set(i, node);
      }
      node.style.transform = `translateX(${x.toFixed(1)}px)`;
      node.classList.toggle('now', x <= PICTO_NOW + 10 && x > PICTO_NOW - 100);
    });
    for (const [i, node] of this.pictoEls) {
      if (!seen.has(i)) { node.remove(); this.pictoEls.delete(i); }
    }
  }

  showPip(visible: boolean): void {
    this.pip.hidden = !visible;
  }

  showBanner(b: Banner | null): void {
    this.banner.hidden = b === null;
    if (!b) return;
    this.banner.dataset.tone = b.tone;
    this.bannerLabel.textContent = b.label;
    const cue = b.cue ?? null;
    if (cue !== this.shownCue) {
      this.shownCue = cue;
      this.bannerCue.innerHTML = cue ? cueSvg(cue) : '';
      if (cue) this.bannerCue.dataset.cue = cue;
      this.banner.classList.toggle('has-cue', cue !== null);
    }
    if (this.bannerText.textContent !== b.text) {
      this.bannerText.textContent = b.text;
      // A new correction pops, a miss shakes, and the camera window flashes so the eye goes to the limb.
      const alert = b.tone === 'fix' || b.tone === 'miss';
      for (const [node, cls] of [[this.banner, 'pop'], [this.banner, 'shake'], [this.pip, 'alert']] as const) node.classList.remove(cls);
      void this.banner.offsetWidth;
      if (alert) {
        this.banner.classList.add(b.tone === 'miss' ? 'shake' : 'pop');
        this.pip.classList.add('alert');
      }
    }
    const hasMeter = b.tone === 'fix' || b.tone === 'calib';
    this.bannerMeter.hidden = !hasMeter;
    if (hasMeter) this.bannerMeter.style.setProperty('--p', String(Math.max(0, Math.min(1, b.progress))));
  }
}
