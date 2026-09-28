import type { MPPlayer } from '../multiplayer/types.ts';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return c;
    }
  });
}

/**
 * Компактное live-табло для мультиплеера (правый верхний угол, под HUD).
 *
 * Intended call: main.ts calls `show()` every frame during dance with
 * `Object.values(mp.getState().players)` and the local player id
 * (`mp` broadcasts live scores; peers receive via `mp.getState().players`),
 * and calls `hide()` when the dance ends / room closes / single-player.
 * Not wired to main.ts here: main.ts is owned by another lane.
 */
export class Scoreboard {
  private readonly el: HTMLElement;
  private lastHtml = '';

  constructor() {
    const existing = document.getElementById('scoreboard');
    if (existing instanceof HTMLElement) {
      this.el = existing;
    } else {
      this.el = document.createElement('div');
      this.el.id = 'scoreboard';
      document.body.append(this.el);
    }
    this.el.hidden = true;
  }

  show(players: MPPlayer[], selfId: string): void {
    if (players.length <= 1) {
      this.hide();
      return;
    }
    const top = [...players].sort((a, b) => b.score - a.score).slice(0, 4);
    const leaderId = top[0]?.id;
    const html = top
      .map((p) => {
        const cls = ['sb-row'];
        if (p.id === selfId) cls.push('self');
        if (p.id === leaderId) cls.push('leader');
        return `<div class="${cls.join(' ')}">${escapeHtml(p.name)} ${p.score} ×${p.combo}</div>`;
      })
      .join('');
    if (html !== this.lastHtml) {
      this.el.innerHTML = html;
      this.lastHtml = html;
    }
    this.el.hidden = false;
  }

  hide(): void {
    this.el.hidden = true;
  }
}
