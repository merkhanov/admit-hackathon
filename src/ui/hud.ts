import { LIVES, type GameState } from '../game/game.ts';

export type Banner =
  | { tone: 'fix'; label: string; text: string; progress: number }
  | { tone: 'frame' | 'miss'; label: string; text: string }
  | { tone: 'calib'; label: string; text: string; progress: number };

function el<T extends HTMLElement>(id: string, type: new () => T): T {
  const node = document.getElementById(id);
  if (!(node instanceof type)) throw new Error(`Missing #${id}`);
  return node;
}

/** Score, lives, the camera window and the hint banner. */
export class Hud {
  private readonly hud = el('hud', HTMLElement);
  private readonly score = el('hud-score', HTMLElement);
  private readonly coins = el('hud-coins', HTMLElement);
  private readonly lives = el('hud-lives', HTMLElement);
  private readonly pip = el('pip', HTMLElement);
  private readonly banner = el('banner', HTMLElement);
  private readonly bannerLabel = el('banner-label', HTMLElement);
  private readonly bannerText = el('banner-text', HTMLElement);
  private readonly bannerMeter = el('banner-meter', HTMLElement);
  private shownLives = -1;

  showGame(game: GameState | null): void {
    this.hud.hidden = game === null;
    if (!game) return;
    this.score.textContent = String(Math.round(game.score));
    this.coins.textContent = String(game.coins);
    if (game.lives !== this.shownLives) {
      if (game.lives < this.shownLives) {
        this.lives.classList.remove('lost');
        void this.lives.offsetWidth;
        this.lives.classList.add('lost');
      }
      this.shownLives = game.lives;
      this.lives.innerHTML = Array.from({ length: LIVES }, (_, i) => `<i class="${i < game.lives ? 'on' : ''}"></i>`).join('');
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
    if (this.bannerText.textContent !== b.text) this.bannerText.textContent = b.text;
    const hasMeter = b.tone === 'fix' || b.tone === 'calib';
    this.bannerMeter.hidden = !hasMeter;
    if (hasMeter) this.bannerMeter.style.setProperty('--p', String(Math.max(0, Math.min(1, b.progress))));
  }
}
