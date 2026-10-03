// Feedback loop for arm tracking: a rigged dancer performs songs in front of a virtual camera, MediaPipe Pose
// (the game's lite model) reads every frame, and the game's tracker turns that into arm angles, which are
// compared with the dancer's real bones. See scripts/track-loop.html for what each count means.
// Needs .cache/mediapipe/pose_landmarker_lite.task (the URL is in src/pose/camera.ts) and public/models/michelle.glb.
//
//   pnpm check:tracking                       default songs, 20 s each
//   pnpm check:tracking party,korobeiniki 40  chosen songs and length
import { homedir } from 'node:os';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const songs = (process.argv[2] ?? 'attract,party,korobeiniki,troll').split(',');
const seconds = Number(process.argv[3] ?? 20);
const models = (process.env.MODELS ?? '/models/michelle.glb').split(',');

const server = await createServer({ server: { port: 5196, strictPort: false }, logLevel: 'error' });
await server.listen();
const chrome = process.env.CHROME
  ?? `${homedir()}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--enable-unsafe-swiftshader'] });
const total = { frames: 0, measured: 0, swapped: 0, wrong: 0, invented: 0, jump: 0, broken: 0, lost: 0 };
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  page.on('console', (m) => { if (m.text().includes('[DEBUG-trk]')) console.log(m.text()); });
  if (process.env.DEBUG) await page.addInitScript(() => { window.DEBUG = true; });
  // MODEL=full or MODEL=heavy tries MediaPipe's bigger pose models instead of the game's lite one.
  await page.addInitScript((m) => { window.MODEL = m; }, process.env.MODEL ?? 'lite');
  await page.goto(`${server.resolvedUrls.local[0]}scripts/track-loop.html`);
  await page.waitForFunction(() => window.ready, null, { timeout: 60_000 });
  await page.evaluate(() => window.setup());
  for (const model of models) {
    for (const song of songs) {
      const r = await page.evaluate((a) => window.run(a), { model, song, seconds });
      for (const k of Object.keys(total)) total[k] += r.stats[k];
      const s = r.stats;
      console.log(`${model.split('/').pop()} ${song.padEnd(12)} frames ${s.frames}  measured arms ${s.measured}  swapped ${s.swapped}  wrong ${s.wrong}  invented ${s.invented}  jump ${s.jump}  broken ${s.broken}  lost ${s.lost}`);
      for (const b of r.bad.slice(0, Number(process.env.SHOW ?? 6))) console.log(`   t=${b.t} ${b.move ?? 'rest'} arm ${b.arm}: true ${b.want}°, game ${b.got}°, model alone ${b.raw}°, wrist ${b.seen ? 'in view' : 'hidden'} (model visibility ${b.vis})`);
      if (s.broken) console.log(`   broken: ${JSON.stringify(s.brokenWhere)}; e.g. ${JSON.stringify(s.brokenSamples)}`);
    }
  }
} finally {
  await browser.close();
  await server.close();
}
const faults = total.swapped + total.wrong + total.invented + total.jump + total.broken;
const pct = (n) => ((100 * n) / Math.max(1, total.measured)).toFixed(1);
console.log(`TOTAL arms measured ${total.measured}: swapped ${pct(total.swapped)}%  wrong ${pct(total.wrong)}%  invented ${pct(total.invented)}%  jump ${pct(total.jump)}%  broken ${pct(total.broken)}%  lost frames ${total.lost}`);
console.log(`FAULTS ${faults} (${pct(faults)}% of measured arms)`);
