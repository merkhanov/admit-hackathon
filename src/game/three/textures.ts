import { CanvasTexture, RepeatWrapping, SRGBColorSpace, DataTexture, RedFormat, NearestFilter } from 'three';

// Every texture is drawn in code: no image files, nothing borrowed from other games.

function canvasTexture(w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void, repeat = false): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not supported');
  paint(ctx);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Deterministic noise, so the textures look the same on every load. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export const stripes = (a: string, b: string) => canvasTexture(256, 64, (ctx) => {
  ctx.fillStyle = a;
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = b;
  for (let x = -64; x < 256 + 64; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 64); ctx.lineTo(x + 32, 64); ctx.lineTo(x + 64, 0); ctx.lineTo(x + 32, 0);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 6;
  ctx.strokeRect(0, 0, 256, 64);
});

export const wood = () => canvasTexture(128, 128, (ctx) => {
  const r = rng(3);
  ctx.fillStyle = '#c98a3e';
  ctx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 32) {
    ctx.fillStyle = y % 64 ? '#b97a31' : '#d69a4c';
    ctx.fillRect(0, y + 2, 128, 28);
    ctx.strokeStyle = 'rgba(90,50,10,0.35)';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      const yy = y + 6 + r() * 20;
      ctx.moveTo(0, yy); ctx.bezierCurveTo(40, yy + 4, 80, yy - 4, 128, yy);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = '#6b3f12';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 118, 118);
  ctx.beginPath(); ctx.moveTo(8, 8); ctx.lineTo(120, 120); ctx.stroke();
});

export const gravel = () => canvasTexture(256, 256, (ctx) => {
  const r = rng(11);
  ctx.fillStyle = '#9b8a76';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const v = 110 + Math.floor(r() * 90);
    ctx.fillStyle = `rgb(${v},${v - 12},${v - 26})`;
    ctx.fillRect(r() * 256, r() * 256, 2 + r() * 3, 2 + r() * 3);
  }
}, true);

const GRAFFITI = ['#ff4fa3', '#ffd21f', '#35d0ff', '#7cff4f', '#ff7a1a', '#b46bff'];

/** A long concrete wall with bright tags, repeated along the track. */
export const graffitiWall = () => canvasTexture(1024, 256, (ctx) => {
  const r = rng(7);
  ctx.fillStyle = '#b9b3a8';
  ctx.fillRect(0, 0, 1024, 256);
  for (let x = 0; x < 1024; x += 128) {
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(x, 0, 4, 256);
  }
  for (let i = 0; i < 9; i++) {
    const x = 40 + i * 110 + r() * 30, y = 90 + r() * 90, w = 90 + r() * 60;
    const color = GRAFFITI[Math.floor(r() * GRAFFITI.length)];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((r() - 0.5) * 0.4);
    ctx.fillStyle = color;
    ctx.strokeStyle = '#1b1b2f';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.ellipse(0, 0, w / 2, 34 + r() * 20, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fill();
    ctx.font = '900 44px Rubik, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 6;
    const tags = ['GO!', 'RUN', 'JUMP', 'WOW', 'MOVE', 'YO'];
    const tag = tags[Math.floor(r() * tags.length)];
    ctx.strokeText(tag, 0, 2);
    ctx.fillStyle = '#fff';
    ctx.fillText(tag, 0, 2);
    ctx.restore();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, 236, 1024, 20);
}, true);

export const windows = (base: string) => canvasTexture(128, 256, (ctx) => {
  const r = rng(base.length * 31);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 256);
  for (let y = 16; y < 240; y += 40) {
    for (let x = 14; x < 118; x += 36) {
      ctx.fillStyle = r() > 0.35 ? '#dff4ff' : '#8fc7e8';
      ctx.fillRect(x, y, 22, 26);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(x, y + 22, 22, 4);
    }
  }
}, true);

/** Side of a train car: body colour with a band of windows and a stripe. */
export const trainSide = (body: string) => canvasTexture(512, 128, (ctx) => {
  ctx.fillStyle = body;
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(0, 92, 512, 10);
  for (let x = 24; x < 500; x += 70) {
    ctx.fillStyle = '#1d2a44';
    ctx.beginPath();
    ctx.roundRect(x, 22, 48, 44, 8);
    ctx.fill();
    ctx.fillStyle = 'rgba(160,220,255,0.55)';
    ctx.fillRect(x + 6, 26, 14, 36);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, 118, 512, 10);
});

export const trainFront = (body: string) => canvasTexture(128, 128, (ctx) => {
  ctx.fillStyle = body;
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#1d2a44';
  ctx.beginPath();
  ctx.roundRect(14, 14, 100, 46, 10);
  ctx.fill();
  ctx.fillStyle = 'rgba(160,220,255,0.5)';
  ctx.fillRect(20, 18, 30, 38);
  ctx.fillStyle = '#fff6b0';
  ctx.beginPath(); ctx.arc(28, 96, 11, 0, Math.PI * 2); ctx.arc(100, 96, 11, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(44, 84, 40, 26);
});

/** Three-step ramp for MeshToonMaterial: flat cartoon shading. */
export function toonRamp(): DataTexture {
  const t = new DataTexture(new Uint8Array([90, 170, 255]), 3, 1, RedFormat);
  t.minFilter = t.magFilter = NearestFilter;
  t.needsUpdate = true;
  return t;
}

/** Vertical sky gradient for the scene background. */
export const sky = () => canvasTexture(4, 256, (ctx) => {
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#3aa6ff');
  g.addColorStop(0.55, '#8fd3ff');
  g.addColorStop(1, '#d9f1ff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
});

export const SKY_HORIZON = 0xd9f1ff;
