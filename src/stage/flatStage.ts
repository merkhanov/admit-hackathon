import type { Rating } from '../dance/dance.ts';
import { figureSegments } from '../ui/pictogram.ts';
import type { StageFrame, StageView } from './stage.ts';

/** 2D fallback when WebGL is unavailable: the coach as a big glowing stick figure. */
export class FlatStage implements StageView {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private flash = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not supported');
    this.ctx = ctx;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  /** The flat fallback shows only the coach. */
  setCrew(): void {}

  preloadCrew(): void {}

  react(rating: Rating): void {
    if (rating === 'perfect') this.flash = 1;
  }

  draw(frame: StageFrame, dt: number): void {
    const { ctx, canvas } = this;
    const w = canvas.width, h = canvas.height;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#9d99ed');
    g.addColorStop(0.55, '#ea9dd9');
    g.addColorStop(1, '#ffc1b5');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    this.flash = Math.max(0, this.flash - dt * 2);
    if (frame.target) {
      const size = Math.min(w, h) * 0.8;
      const bounce = frame.playing ? Math.abs(Math.sin(Math.PI * (frame.beat % 1))) * 10 : 0;
      const { segs, head, tilt } = figureSegments(frame.target);
      ctx.save();
      ctx.translate(w / 2 - size / 2, h * 0.52 - size / 2 - bounce);
      ctx.scale(size / 64, size / 64);
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#ffffff';
      ctx.shadowColor = this.flash > 0 ? '#ffda4b' : '#8140d0';
      ctx.shadowBlur = 12;
      ctx.lineWidth = 4;
      const hipY = frame.target.squat ? 44 : 40;
      const legCount = frame.target.squat ? 4 : 2;
      segs.forEach((s, i) => {
        if (i === legCount) { ctx.translate(32, hipY); ctx.rotate((-tilt * Math.PI) / 180); ctx.translate(-32, -hipY); }
        ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
      });
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(head.x, head.y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
}
