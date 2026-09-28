import { DUCK_DROP, JUMP_UP, type Calibration, type GestureId } from '../pose/gestures.ts';
import { IDX, SKELETON } from '../pose/landmarks.ts';
import type { TrackerOutput } from '../pose/tracker.ts';

const OK = '#4ade80', NEAR = '#ffb020', IDLE = '#eef1ff';

const ARM_JOINTS = new Set<number>([IDX.LEFT_ELBOW, IDX.RIGHT_ELBOW, IDX.LEFT_WRIST, IDX.RIGHT_WRIST]);

/** Mirrored camera view with the recognized skeleton, so the player sees what the system sees. */
export class PoseView {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not supported');
    this.ctx = ctx;
  }

  draw(video: HTMLVideoElement | null, out: TrackerOutput | null, calib: Calibration | null): void {
    const { canvas, ctx } = this;
    const aspect = video && video.videoWidth ? video.videoWidth / video.videoHeight : 4 / 3;
    const W = canvas.clientWidth * Math.min(2, window.devicePixelRatio || 1);
    const H = W / aspect;
    if (canvas.width !== Math.round(W) || canvas.height !== Math.round(H)) {
      canvas.width = Math.round(W);
      canvas.height = Math.round(H);
    }
    ctx.fillStyle = '#05060d';
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
    if (f.present) {
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 1.5;
      ctx.font = `600 ${Math.round(H / 22)}px Manrope, system-ui, sans-serif`;
      const jumpY = (Math.min(pose[IDX.LEFT_SHOULDER].y, pose[IDX.RIGHT_SHOULDER].y) - JUMP_UP * f.sw) * H;
      this.guide(jumpY, '#7c93ff', 'прыжок');
      if (calib) this.guide((calib.midY + DUCK_DROP * calib.sw) * H, '#c084fc', 'присед');
      ctx.setLineDash([]);
    }

    const state = (ids: readonly GestureId[]) => {
      if (ids.some((id) => out.readout[id]?.phase === 'active')) return OK;
      if (ids.some((id) => out.readout[id]?.hinting)) return NEAR;
      return IDLE;
    };
    const arms = state(['jump', 'punch']);
    const body = state(['duck', 'leanL', 'leanR']);

    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(3, W / 90);
    for (const [a, b] of SKELETON) {
      ctx.strokeStyle = ARM_JOINTS.has(a) || ARM_JOINTS.has(b) ? arms : body;
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

  private guide(y: number, color: string, label: string): void {
    const { ctx, canvas } = this;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    ctx.fillText(label, 8, y - 5);
  }
}
