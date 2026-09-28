import { JUMP_S, PUNCH_S, type Entity, type GameNote, type GameState, type HazardType } from './game.ts';
import type { SceneRenderer } from './sceneRenderer.ts';

const COLORS = {
  accent: '#4d6bff',
  barrier: '#ff8a3d',
  bar: '#3ddcff',
  wall: '#ff3d7f',
  crate: '#ffc53d',
  coin: '#ffe066',
  good: '#4ade80',
  bad: '#ff4d5e',
} as const;

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number }
interface FloatText { text: string; x: number; y: number; life: number; color: string }

/** Perspective: z = 0 at the player, z = 1 where entities spawn. */
const NEAR = 1;
const DEPTH = 6;
const scaleAt = (z: number) => NEAR / (NEAR + Math.max(-0.12, z) * DEPTH);

/** Draws the runner scene. Keeps only visual state (particles, shake, smooth lane); game rules live in game.ts. */
export class GameRenderer implements SceneRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private displayLane = 1;
  private runPhase = 0;
  private scroll = 0;
  private shake = 0;
  private flash: { color: string; a: number } = { color: COLORS.bad, a: 0 };
  private particles: Particle[] = [];
  private texts: FloatText[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not supported');
    this.ctx = ctx;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private get horizonY() { return this.h * 0.36; }
  private get playerY() { return this.h * 0.8; }
  private get laneW() { return Math.min(this.w * (this.w < 720 ? 0.28 : 0.22), this.h * 0.32, 280); }

  private project(lane: number, z: number): { x: number; y: number; s: number } {
    const s = scaleAt(z);
    return { x: this.w / 2 + (lane - 1) * this.laneW * s, y: this.horizonY + (this.playerY - this.horizonY) * s, s };
  }

  /** Turns game notes into effects. */
  handle(notes: readonly GameNote[]): void {
    const at = (lane: number, lift = 0.5) => {
      const p = this.project(lane, 0);
      return { x: p.x, y: p.y - this.laneW * lift };
    };
    for (const n of notes) {
      switch (n.kind) {
        case 'smash': {
          const p = at(n.lane, 0.4);
          this.burst(p.x, p.y, COLORS.crate, 28);
          this.float('+30', p.x, p.y, COLORS.crate);
          this.shake = Math.max(this.shake, 6);
          break;
        }
        case 'coin': {
          const p = at(n.lane, 0.35);
          this.burst(p.x, p.y, COLORS.coin, 12);
          this.float('+25', p.x, p.y, COLORS.coin);
          break;
        }
        case 'clear': {
          const p = at(this.displayLane, 0.9);
          this.float(n.text, p.x, p.y, COLORS.good);
          this.flash = { color: COLORS.good, a: 0.12 };
          break;
        }
        case 'hit': {
          const p = at(this.displayLane, 0.5);
          this.burst(p.x, p.y, COLORS[n.type], 22);
          this.shake = 16;
          this.flash = { color: COLORS.bad, a: 0.35 };
          break;
        }
        case 'over':
          this.shake = 22;
          break;
        case 'jump':
        case 'punch':
        case 'lane':
          break;
        default: {
          const _exhaustive: never = n;
          void _exhaustive;
        }
      }
    }
  }

  private burst(x: number, y: number, color: string, count: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, v = 120 + Math.random() * 320;
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 160, life: 0, max: 0.5 + Math.random() * 0.5, color, size: 2 + Math.random() * 4 });
    }
  }

  private float(text: string, x: number, y: number, color: string): void {
    this.texts.push({ text, x, y, life: 0, color });
  }

  draw(game: GameState, dt: number): void {
    const { ctx, w, h } = this;
    this.displayLane += (game.lane - this.displayLane) * Math.min(1, dt * 14);
    this.scroll = game.distance;
    this.runPhase += dt * (6 + game.speed * 10);
    this.shake = Math.max(0, this.shake - dt * 40);
    this.flash.a = Math.max(0, this.flash.a - dt * 1.2);

    ctx.save();
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    this.drawSky();
    this.drawGround();
    const sorted = [...game.entities].sort((a, b) => b.z - a.z);
    for (const e of sorted) if (e.z > 0) this.drawEntity(e);
    this.drawPlayer(game);
    for (const e of sorted) if (e.z <= 0) this.drawEntity(e);
    this.drawEffects(dt);
    ctx.restore();

    if (this.flash.a > 0) {
      ctx.fillStyle = this.flash.color;
      ctx.globalAlpha = this.flash.a;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  }

  private drawSky(): void {
    const { ctx, w, h } = this;
    const hy = this.horizonY;
    const sky = ctx.createLinearGradient(0, 0, 0, hy);
    sky.addColorStop(0, '#03040a');
    sky.addColorStop(1, '#0c1440');
    ctx.fillStyle = sky;
    ctx.fillRect(-40, -40, w + 80, hy + 40);
    const glow = ctx.createRadialGradient(w / 2, hy, 0, w / 2, hy, w * 0.5);
    glow.addColorStop(0, 'rgba(77,107,255,0.55)');
    glow.addColorStop(1, 'rgba(77,107,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-40, 0, w + 80, hy * 1.6);
    // Pixel skyline, a nod to the hackathon's pixel logo.
    ctx.fillStyle = '#070b22';
    const block = Math.max(6, Math.round(w / 120));
    for (let x = -block, i = 0; x < w + block; x += block, i++) {
      const n = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
      const bh = block * (2 + Math.floor(n * 7));
      ctx.fillRect(x, hy - bh, block, bh);
    }
    ctx.fillStyle = '#03040a';
    ctx.fillRect(-40, hy, w + 80, h - hy + 40);
  }

  private drawGround(): void {
    const { ctx, w } = this;
    const far = 4;
    // Grid on the ground.
    ctx.strokeStyle = 'rgba(77,107,255,0.18)';
    ctx.lineWidth = 1;
    const step = 0.1;
    for (let z = -(this.scroll % step); z < far; z += step) {
      const { y, s } = this.project(1, z);
      ctx.globalAlpha = Math.min(1, s * 1.6);
      ctx.beginPath(); ctx.moveTo(-40, y); ctx.lineTo(w + 40, y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (let lane = -6; lane <= 8; lane++) {
      const a = this.project(lane - 0.5, -0.12), b = this.project(lane - 0.5, far);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }

    // Road.
    const l0 = this.project(-0.5, -0.12), r0 = this.project(2.5, -0.12), l1 = this.project(-0.5, far), r1 = this.project(2.5, far);
    const road = ctx.createLinearGradient(0, l1.y, 0, l0.y);
    road.addColorStop(0, 'rgba(18,24,60,0.6)');
    road.addColorStop(1, 'rgba(22,30,80,0.95)');
    ctx.fillStyle = road;
    ctx.beginPath(); ctx.moveTo(l0.x, l0.y); ctx.lineTo(r0.x, r0.y); ctx.lineTo(r1.x, r1.y); ctx.lineTo(l1.x, l1.y); ctx.fill();

    ctx.save();
    ctx.shadowColor = COLORS.accent;
    ctx.shadowBlur = 16;
    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 3;
    for (const edge of [-0.5, 2.5]) {
      const a = this.project(edge, -0.12), b = this.project(edge, far);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.restore();

    // Dashed lane separators that scroll with the run.
    ctx.fillStyle = 'rgba(160,180,255,0.45)';
    const dash = 0.16;
    for (const sep of [0.5, 1.5]) {
      for (let z = -(this.scroll % dash); z < far; z += dash) {
        const a = this.project(sep, z), b = this.project(sep, z + dash * 0.45);
        const wa = 4 * a.s, wb = 4 * b.s;
        ctx.beginPath();
        ctx.moveTo(a.x - wa, a.y); ctx.lineTo(a.x + wa, a.y); ctx.lineTo(b.x + wb, b.y); ctx.lineTo(b.x - wb, b.y);
        ctx.fill();
      }
    }
  }

  private drawEntity(e: Entity): void {
    const { ctx } = this;
    const p = this.project(e.lane, e.z);
    const u = this.laneW * p.s;
    ctx.save();
    ctx.globalAlpha = Math.min(1, (1.08 - e.z) * 4);
    if (e.kind === 'coin') {
      const r = u * 0.13, spin = Math.abs(Math.cos(this.runPhase * 0.6 + e.id));
      ctx.shadowColor = COLORS.coin; ctx.shadowBlur = 18 * p.s;
      ctx.fillStyle = COLORS.coin;
      ctx.beginPath(); ctx.ellipse(p.x, p.y - u * 0.35, r * Math.max(0.2, spin), r, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }
    this.drawHazard(e.type, p.x, p.y, u);
    ctx.restore();
  }

  private drawHazard(type: HazardType, x: number, y: number, u: number): void {
    const { ctx } = this;
    const color = COLORS[type];
    ctx.shadowColor = color;
    ctx.shadowBlur = 20 * (u / this.laneW);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    const hw = u * 0.4;
    switch (type) {
      case 'barrier': {
        const top = y - u * 0.26;
        ctx.lineWidth = Math.max(2, u * 0.04);
        ctx.beginPath(); ctx.moveTo(x - hw * 0.8, y); ctx.lineTo(x - hw * 0.8, top); ctx.moveTo(x + hw * 0.8, y); ctx.lineTo(x + hw * 0.8, top); ctx.stroke();
        ctx.fillRect(x - hw, top, hw * 2, u * 0.1);
        ctx.fillStyle = '#1a0d05';
        for (let i = 0; i < 4; i++) ctx.fillRect(x - hw + (i * 2 + 0.5) * (hw / 4), top, hw / 6, u * 0.1);
        break;
      }
      case 'bar': {
        const top = y - u * 0.95;
        ctx.lineWidth = Math.max(2, u * 0.035);
        ctx.beginPath(); ctx.moveTo(x - hw, y); ctx.lineTo(x - hw, top); ctx.moveTo(x + hw, y); ctx.lineTo(x + hw, top); ctx.stroke();
        ctx.fillRect(x - hw, y - u * 0.62, hw * 2, u * 0.09);
        break;
      }
      case 'wall': {
        const top = y - u * 1.0;
        ctx.globalAlpha *= 0.9;
        ctx.fillStyle = '#2a0718';
        ctx.fillRect(x - hw, top, hw * 2, u);
        ctx.lineWidth = Math.max(2, u * 0.03);
        ctx.strokeRect(x - hw, top, hw * 2, u);
        ctx.beginPath();
        for (let i = -3; i <= 3; i++) { ctx.moveTo(x + i * hw * 0.35 - hw * 0.3, y); ctx.lineTo(x + i * hw * 0.35 + hw * 0.3, top); }
        ctx.save(); ctx.clip(new Path2D(`M${x - hw} ${top}h${hw * 2}v${u}h${-hw * 2}z`)); ctx.globalAlpha *= 0.5; ctx.stroke(); ctx.restore();
        break;
      }
      case 'crate': {
        const s = u * 0.5, top = y - s;
        ctx.fillStyle = '#3a2605';
        ctx.fillRect(x - s / 2, top, s, s);
        ctx.lineWidth = Math.max(2, u * 0.03);
        ctx.strokeRect(x - s / 2, top, s, s);
        ctx.beginPath(); ctx.moveTo(x - s / 2, top); ctx.lineTo(x + s / 2, y); ctx.moveTo(x + s / 2, top); ctx.lineTo(x - s / 2, y); ctx.stroke();
        break;
      }
      default: {
        const _exhaustive: never = type;
        void _exhaustive;
      }
    }
  }

  private drawPlayer(game: GameState): void {
    const { ctx } = this;
    const p = this.project(this.displayLane, 0);
    const u = this.laneW * 0.72;
    const jumpT = game.jumpT > 0 ? 1 - game.jumpT / JUMP_S : 0;
    const lift = game.jumpT > 0 ? Math.sin(Math.PI * jumpT) * u * 0.55 : 0;
    const crouch = game.ducking ? 0.45 : 0;
    const punching = game.punchT > 0 ? game.punchT / PUNCH_S : 0;
    if (game.invulnT > 0 && Math.floor(game.invulnT * 12) % 2 === 0) return;

    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y, u * 0.2 * (1 - lift / u), u * 0.05, 0, 0, Math.PI * 2); ctx.fill();

    const feet = p.y - lift;
    const legLen = u * 0.28 * (1 - crouch * 0.5);
    const hip = { x: p.x, y: feet - legLen };
    const torso = u * 0.3 * (1 - crouch * 0.4);
    const neck = { x: p.x, y: hip.y - torso };
    const swing = game.jumpT > 0 ? 0.4 : Math.sin(this.runPhase);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = COLORS.accent;
    ctx.shadowBlur = 24;
    ctx.strokeStyle = '#eef1ff';
    ctx.lineWidth = u * 0.075;
    const limb = (from: { x: number; y: number }, dx: number, dy: number) => {
      ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(from.x + dx, from.y + dy); ctx.stroke();
    };
    // Legs.
    limb(hip, -u * 0.07 + swing * u * 0.05, legLen * (0.95 - Math.max(0, swing) * 0.25));
    limb(hip, u * 0.07 - swing * u * 0.05, legLen * (0.95 - Math.max(0, -swing) * 0.25));
    // Torso and head.
    limb(hip, 0, -torso);
    ctx.fillStyle = '#eef1ff';
    ctx.beginPath(); ctx.arc(neck.x, neck.y - u * 0.1, u * 0.085, 0, Math.PI * 2); ctx.fill();
    // Arms.
    const shoulder = { x: neck.x, y: neck.y + u * 0.03 };
    if (game.jumpT > 0) {
      limb(shoulder, -u * 0.12, -u * 0.2);
      limb(shoulder, u * 0.12, -u * 0.2);
    } else {
      limb(shoulder, -u * 0.14, u * 0.12 + swing * u * 0.06);
      if (punching > 0) {
        ctx.strokeStyle = COLORS.crate;
        ctx.shadowColor = COLORS.crate;
        limb(shoulder, u * 0.34, -u * 0.02);
        ctx.fillStyle = COLORS.crate;
        ctx.beginPath(); ctx.arc(shoulder.x + u * 0.34, shoulder.y - u * 0.02, u * 0.06 * (1 + punching), 0, Math.PI * 2); ctx.fill();
      } else {
        limb(shoulder, u * 0.14, u * 0.12 - swing * u * 0.06);
      }
    }
    ctx.restore();
  }

  private drawEffects(dt: number): void {
    const { ctx } = this;
    this.particles = this.particles.filter((q) => (q.life += dt) < q.max);
    for (const q of this.particles) {
      q.vy += 900 * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      ctx.globalAlpha = 1 - q.life / q.max;
      ctx.fillStyle = q.color;
      ctx.fillRect(q.x, q.y, q.size, q.size);
    }
    this.texts = this.texts.filter((t) => (t.life += dt) < 1.1);
    ctx.font = `700 ${Math.round(this.laneW * 0.13)}px Rubik, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    for (const t of this.texts) {
      ctx.globalAlpha = 1 - t.life / 1.1;
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y - t.life * 70);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }
}
