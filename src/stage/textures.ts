import { CanvasTexture, DataTexture, NearestFilter, RedFormat, RepeatWrapping, SRGBColorSpace } from 'three';

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
  return t;
}

/** Three-step ramp for MeshToonMaterial: flat cartoon shading. */
export function toonRamp(): DataTexture {
  const t = new DataTexture(new Uint8Array([110, 190, 255]), 3, 1, RedFormat);
  t.minFilter = t.magFilter = NearestFilter;
  t.needsUpdate = true;
  return t;
}

/** Three-colour backdrop with soft light blobs, like a music video stage. */
export const backdrop = (stops: readonly string[]) => canvasTexture(512, 512, (ctx) => {
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  let seed = 9;
  const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 26; i++) {
    const x = r() * 512, y = r() * 380, rad = 20 + r() * 90;
    const blob = ctx.createRadialGradient(x, y, 0, x, y, rad);
    blob.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
    blob.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = blob;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
});

/** Dance-floor tile: a light square with a bright rim; tinted per tile. */
export const floorTile = () => canvasTexture(128, 128, (ctx) => {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#dcdcdc';
  ctx.fillRect(8, 8, 112, 112);
  const g = ctx.createRadialGradient(64, 64, 10, 64, 64, 80);
  g.addColorStop(0, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(8, 8, 112, 112);
}, true);

/** Soft vertical fade for light beams: bright at the source, transparent at the end. */
export const beam = () => canvasTexture(4, 256, (ctx) => {
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
});
