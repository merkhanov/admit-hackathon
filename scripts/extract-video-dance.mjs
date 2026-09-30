// Turns a video of a real dancer into a recorded dance the game can play and judge:
// the six numbers the camera measures on a player, 30 times a second, and the music's beat.
//
//   FFMPEG=/path/to/ffmpeg node scripts/extract-video-dance.mjs ~/Movies/dance.mov dance1
//
// writes src/dance/mocap/dance1.ts. The pose is found with MediaPipe's most accurate model in headless
// Chrome, measured by the game's own src/pose/features.ts. The video's sound is only used for the
// beat: the music itself is never stored, the game plays its own at the same tempo.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const [video, id] = process.argv.slice(2);
if (!video || !id) {
  console.error('Usage: node scripts/extract-video-dance.mjs <video> <dance id>');
  process.exit(2);
}
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
const FPS = 30;
const WIDTH = 540;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task';
const MODEL = 'node_modules/.cache/motion-dance/pose_landmarker_heavy.task';

if (!existsSync(MODEL)) {
  mkdirSync('node_modules/.cache/motion-dance', { recursive: true });
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`Pose model: HTTP ${res.status}`);
  writeFileSync(MODEL, Buffer.from(await res.arrayBuffer()));
}

// --- Frames and sound.
const work = mkdtempSync(join(tmpdir(), 'dance-'));
execFileSync(FFMPEG, ['-v', 'error', '-i', video, '-vf', `fps=${FPS},scale=${WIDTH}:-2`, '-q:v', '3', join(work, 'f%05d.jpg')]);
execFileSync(FFMPEG, ['-v', 'error', '-i', video, '-vn', '-ac', '1', '-ar', '22050', join(work, 'audio.wav')]);
const frameFiles = readdirSync(work).filter((f) => f.endsWith('.jpg')).sort();
// Frame aspect from the JPEG header (SOF0 marker holds height, then width).
function jpegSize(buf) {
  for (let i = 2; i < buf.length;) {
    const marker = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  throw new Error('Unreadable frame');
}
const { w, h } = jpegSize(readFileSync(join(work, frameFiles[0])));

// --- Pose and beat, in the browser.
const server = await createServer({ server: { port: 5198, strictPort: false }, logLevel: 'error' });
await server.listen();
const chrome = process.env.CHROME
  ?? `${homedir()}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const browser = await chromium.launch({ executablePath: chrome, headless: true });
let result;
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.route('**/frames/*', (route) => {
    const n = Number(new URL(route.request().url()).pathname.split('/').pop());
    return route.fulfill({ body: readFileSync(join(work, frameFiles[n])), contentType: 'image/jpeg' });
  });
  await page.route('**/audio', (route) => route.fulfill({ body: readFileSync(join(work, 'audio.wav')), contentType: 'audio/wav' }));
  await page.route('**/model/pose.task', (route) => route.fulfill({ body: readFileSync(MODEL), contentType: 'application/octet-stream' }));
  await page.goto(`${server.resolvedUrls.local[0]}scripts/extract-video.html`);
  await page.waitForFunction(() => window.ready, null, { timeout: 60_000 });
  result = await page.evaluate(([n, fps, aspect]) => window.run(n, fps, aspect), [frameFiles.length, FPS, w / h]);
} finally {
  await browser.close();
  await server.close();
  rmSync(work, { recursive: true, force: true });
}

// --- Clean up the measurements.
const seen = result.frames.filter(Boolean).length;
if (seen < result.frames.length * 0.8) throw new Error(`The dancer was found in only ${seen} of ${result.frames.length} frames`);
// Frames where the dancer or an arm wasn't found keep the last good reading.
const raw = [];
let last = result.frames.find(Boolean);
for (const f of result.frames) {
  const cur = f ?? last;
  raw.push({
    ...cur,
    L: cur.L.ok ? cur.L : { ...last.L },
    R: cur.R.ok ? cur.R : { ...last.R },
  });
  last = raw[raw.length - 1];
}

const wrap = (a) => ((((a + 180) % 360) + 360) % 360) - 180;
const diff = (a, b) => wrap(a - b);
/** Weighted moving average over ±span frames (no wrap-around: a video is not a loop). */
function avg(pick, angle, span, weight = () => 1) {
  return raw.map((_, i) => {
    const base = pick(raw[i]);
    let sum = 0, n = 0;
    for (let k = -span; k <= span; k++) {
      const r = raw[Math.max(0, Math.min(raw.length - 1, i + k))];
      const wt = weight(r) * (1 - Math.abs(k) / (span + 1));
      sum += wt * (angle ? diff(pick(r), base) : pick(r) - base);
      n += wt;
    }
    const out = base + sum / (n || 1);
    return angle ? wrap(out) : out;
  });
}
/** A folded arm's direction means little: it holds where it last pointed while the arm was out. */
const SHOWN_REACH = 0.35;
function hold(dirs, reachOf) {
  const out = [...dirs];
  let prev = dirs[0];
  for (let i = 0; i < out.length; i++) {
    const wt = Math.min(1, reachOf(raw[i]) / SHOWN_REACH) ** 2;
    out[i] = wrap(prev + wt * diff(dirs[i], prev));
    prev = out[i];
  }
  return out;
}
const dirL = hold(avg((r) => r.L.dir, true, 3, (r) => r.L.reach ** 2 + 0.02), (r) => r.L.reach);
const dirR = hold(avg((r) => r.R.dir, true, 3, (r) => r.R.reach ** 2 + 0.02), (r) => r.R.reach);
const elbowL = avg((r) => r.L.elbow, false, 2), elbowR = avg((r) => r.R.elbow, false, 2);
const tilt = avg((r) => r.tilt, false, 2);
// Squat: how far the shoulders sink below her usual stance (image y grows downwards), in shoulder widths.
const stance = [...raw.map((r) => r.midY)].sort((a, b) => a - b)[Math.floor(raw.length / 2)];
const midY = avg((r) => r.midY, false, 2);
const DIP_FREE = 0.1, FULL_SQUAT = 0.35;
const frames = raw.map((r, i) => [
  Math.round(dirL[i]), Math.round(Math.max(45, elbowL[i])), Math.round(dirR[i]), Math.round(Math.max(45, elbowR[i])),
  Math.round(tilt[i]), Math.round(Math.max(0, Math.min(1, ((midY[i] - stance) / r.sw - DIP_FREE) / FULL_SQUAT)) * 100),
]);

const { bpm, firstBeat, confidence } = result.beat;
const beat = 60 / bpm;
mkdirSync('src/dance/mocap', { recursive: true });
const out = `src/dance/mocap/${id}.ts`;
writeFileSync(out, `// Generated by scripts/extract-video-dance.mjs from a video of a real dancer. Do not edit by hand.
import type { Mocap } from '../mocap.ts';

export const ${id.toUpperCase()}: Mocap = {
  id: '${id}',
  fps: ${FPS},
  /** Seconds per beat of the music she danced to. */
  beat: ${beat.toFixed(5)},
  /** Seconds into the recording of the first beat. */
  offset: ${firstBeat.toFixed(3)},
  /** Danced once, start to finish: it doesn't repeat. */
  loop: false,
  /** Per frame: left arm direction, left elbow, right arm direction, right elbow, tilt, squat %. */
  frames: ${JSON.stringify(frames)},
};
`);
console.log(`${out}: ${frames.length} frames (${(frames.length / FPS).toFixed(1)} s), dancer found in ${seen}, ${bpm.toFixed(1)} bpm (confidence ${confidence.toFixed(2)}), first beat at ${firstBeat.toFixed(2)} s, video ${w}x${h}`);
