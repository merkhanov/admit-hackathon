// Builds the multiplayer avatars public/avatars/*.glb from three characters of the 100 Avatars
// collection by Polygonal Mind (CC0, public domain: free to use, change and publish). The source
// VRM files live on Arweave; this downloads them, shrinks their textures and saves small GLBs.
// The results are committed, so a normal build needs neither this script nor the network.
//
//   pnpm import:avatars
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

/** Slot order: the first friend to join gets Juanita, then SnailKid, then Eugenia. */
export const AVATARS = [
  { name: 'juanita', title: '252 Juanita', number: '252', url: '' },
  { name: 'snailkid', title: '293 SnailKid', number: '293', url: '' },
  { name: 'eugenia', title: '226 Eugenia', number: '226', url: '' },
];

// The collection's registry gives each avatar's permanent file address.
const registry = await (await fetch('https://raw.githubusercontent.com/ToxSam/open-source-avatars/main/data/avatars/100avatars-r3.json')).json();
for (const a of AVATARS) {
  const entry = registry.find((r) => r.metadata?.number === a.number);
  if (!entry) throw new Error(`Avatar ${a.title} is missing from the registry`);
  a.url = entry.model_file_url;
}

const server = await createServer({ server: { port: 5199, strictPort: false }, logLevel: 'error' });
await server.listen();
const chrome = process.env.CHROME
  ?? `${homedir()}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const browser = await chromium.launch({ executablePath: chrome, headless: true });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  // Each source file is fetched here and handed to the page, so the browser needs no network access.
  const sources = await Promise.all(AVATARS.map(async (a) => Buffer.from(await (await fetch(a.url)).arrayBuffer())));
  await page.route('**/avatar-src/*', (route) => {
    const i = Number(new URL(route.request().url()).pathname.split('/').pop());
    return route.fulfill({ body: sources[i], contentType: 'model/gltf-binary' });
  });
  await page.goto(`${server.resolvedUrls.local[0]}scripts/convert-character.html`);
  await page.waitForFunction(() => window.ready, null, { timeout: 60_000 });
  mkdirSync('public/avatars', { recursive: true });
  for (let i = 0; i < AVATARS.length; i++) {
    const glb = Buffer.from(await page.evaluate((url) => window.convertGltf(url), `/avatar-src/${i}`), 'base64');
    const out = `public/avatars/${AVATARS[i].name}.glb`;
    writeFileSync(out, glb);
    console.log(`${AVATARS[i].title} (${(sources[i].length / 1e6).toFixed(1)} MB) -> ${out} (${(statSync(out).size / 1e6).toFixed(1)} MB)`);
  }
} finally {
  await browser.close();
  await server.close();
}
