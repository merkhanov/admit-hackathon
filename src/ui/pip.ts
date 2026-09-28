import type { MoveEval, PartId } from '../dance/judge.ts';
import type { MoveTarget } from '../dance/moves.ts';
import type { Side } from '../pose/features.ts';
import { IDX, SKELETON } from '../pose/landmarks.ts';
import type { TrackerOutput } from '../pose/tracker.ts';

const GOOD = '#4ade80', NEAR = '#ffd21f', BAD = '#ff4d5e', IDLE = '#ffffff', GHOST = '#ffd21f';
const RAD = Math.PI / 180;
const ARM_LENGTH = 1.6; // shoulder widths

const LEFT_ARM = new Set<number>([IDX.LEFT_ELBOW, IDX.LEFT_WRIST]);
const RIGHT_ARM = new Set<number>([IDX.RIGHT_ELBOW, IDX.RIGHT_WRIST]);

function partColor(e: MoveEval | null, part: PartId): string {
  const p = e?.parts.find((x) => x.part === part);
  if (!p) return IDLE;
  return p.score >= 0.85 ? GOOD : p.score >= 0.5 ? NEAR : BAD;
}

/**
 * Mirrored camera view with the recognized skeleton. During a move it also draws the target
 * arms as a dashed ghost from the player's own shoulders, so the fix is visible without reading.
 */
export class PoseView {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not supported');
    this.ctx = ctx;
  }

  draw(video: HTMLVideoElement | null, out: TrackerOutput | null, target: MoveTarget | null, match: MoveEval | null): void {
    const { canvas, ctx } = this;
    const aspect = video && video.videoWidth ? video.videoWidth / video.videoHeight : 4 / 3;
    const W = canvas.clientWidth * Math.min(2, window.devicePixelRatio || 1);
    const H = W / aspect;
    if (canvas.width !== Math.round(W) || canvas.height !== Math.round(H)) {
      canvas.width = Math.round(W);
      canvas.height = Math.round(H);
    }
    ctx.fillStyle = '#0b1026';
    ctx.fillRect(0, 0, W, H);
    if (video && video.readyState >= 2) {
      ctx.save();
      ctx.translate(W, 0);
      ctx.scale(-1, 1);
      ctx.globalAlpha = 0.7;
      ctx.drawImage(video, 0, 0, W, H);
      ctx.restore();
    }
    const pose = out?.pose;
    if (!out || !pose) return;
    const P = (i: number) => ({ x: (1 - pose[i].x) * W, y: pose[i].y * H });
    const f = out.features;
    ctx.lineCap = 'round';

    if (target && f.present) {
      // Ghost of the target arms, measured in the player's own shoulder widths.
      const reach = ARM_LENGTH * f.sw * H;
      ctx.setLineDash([8, 7]);
      ctx.lineWidth = Math.max(4, W / 55);
      ctx.strokeStyle = GHOST;
      ctx.globalAlpha = 0.9;
      const shoulders: readonly (readonly [Side, number])[] = [['L', IDX.LEFT_SHOULDER], ['R', IDX.RIGHT_SHOULDER]];
      for (const [s, idx] of shoulders) {
        const sh = P(idx);
        const sign = s === 'L' ? -1 : 1;
        const { dir, elbow } = target.arms[s];
        const bend = 180 - elbow;
        const upper = (dir - bend / 2) * RAD, fore = (dir + bend / 2) * RAD;
        const ex = sh.x + (sign * Math.sin(upper) * reach) / 2, ey = sh.y + (Math.cos(upper) * reach) / 2;
        ctx.beginPath();
        ctx.moveTo(sh.x, sh.y);
        ctx.lineTo(ex, ey);
        ctx.lineTo(ex + (sign * Math.sin(fore) * reach) / 2, ey + (Math.cos(fore) * reach) / 2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    const left = partColor(match, 'armL'), right = partColor(match, 'armR');
    const body = match ? partColor(match, 'tilt') : IDLE;
    ctx.lineWidth = Math.max(3, W / 90);
    for (const [a, b] of SKELETON) {
      ctx.strokeStyle = LEFT_ARM.has(a) || LEFT_ARM.has(b) ? left : RIGHT_ARM.has(a) || RIGHT_ARM.has(b) ? right : body;
      const A = P(a), B = P(b);
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
    }
    const nose = P(IDX.NOSE);
    ctx.strokeStyle = body;
    ctx.beginPath(); ctx.arc(nose.x, nose.y, (f.present ? f.sw : 0.2) * H * 0.33, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff';
    for (const i of [IDX.NOSE, IDX.LEFT_SHOULDER, IDX.RIGHT_SHOULDER, IDX.LEFT_ELBOW, IDX.RIGHT_ELBOW, IDX.LEFT_WRIST, IDX.RIGHT_WRIST]) {
      const q = P(i);
      ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(2.5, W / 150), 0, Math.PI * 2); ctx.fill();
    }
  }
}
