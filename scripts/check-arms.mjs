// Regression check for "the coach's arms go through her body". Plays every song, and every move held
// still, on each character, and fails when the torso mesh hides any part of an arm from the camera.
// Needs public/models/michelle.glb (pnpm dev or pnpm build fetches it) and Chrome for Testing.
//
//   pnpm check:arms                      all characters, all songs
//   pnpm check:arms attract michelle     one song, one character
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const songs = (process.argv[2] ?? 'attract,neon,party,korobeiniki,cancan,troll,zhorga').split(',');
const models = (process.argv[3] ?? 'michelle,juanita,snailkid,eugenia').split(',')
  .map((m) => (m === 'michelle' ? '/models/michelle.glb' : `/avatars/${m}.glb`));

const server = await createServer({ server: { port: 5198, strictPort: false }, logLevel: 'error' });
await server.listen();
// Chrome for Testing on a Mac, or the Chromium of a Linux box (CI, cloud sessions); CHROME overrides both.
const chrome = process.env.CHROME ?? [
  `${homedir()}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
  '/opt/pw-browsers/chromium',
].find((p) => existsSync(p));
const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--enable-unsafe-swiftshader'] });
let bad = 0;
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => { console.error('page error:', e.message); bad++; });
  await page.goto(`${server.resolvedUrls.local[0]}scripts/check-arms.html`);
  await page.waitForFunction(() => window.ready, null, { timeout: 60_000 });
  for (const model of models) {
    const still = await page.evaluate((m) => window.still(m), model);
    const held = Object.keys(still);
    bad += held.length;
    console.log(`${model}: ${held.length ? `held poses with a hidden arm: ${held.join(', ')}` : 'every held pose clear'}`);
    for (const id of songs) {
      const r = await page.evaluate(([s, m]) => window.dance(s, m), [id, model]);
      bad += r.bad;
      if (r.bad) console.log(`   ${id}: ${r.bad} of ${r.checked} frames hide an arm ${JSON.stringify(r.where)}`);
    }
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? 'FAIL: an arm goes through the body' : 'PASS: arms stay in front of the body');
process.exit(bad ? 1 : 0);
