// Turns Mixamo characters into the multiplayer avatars public/models/crew-1.glb, crew-2.glb, crew-3.glb.
// Mixamo gives characters only to signed-in Adobe users and doesn't allow redistributing the files,
// so they are not in the repo: download three characters as FBX Binary in T-pose, then run
//
//   pnpm import:mixamo ~/Downloads/Remy.fbx ~/Downloads/Amy.fbx ~/Downloads/Kaya.fbx
//
// Without these files the avatars are recoloured copies of the coach. The conversion runs in
// headless Chrome with three.js's FBXLoader and GLTFExporter, and shrinks textures to 1024 px.
import { readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const files = process.argv.slice(2);
if (files.length === 0 || files.length > 3) {
  console.error('Usage: pnpm import:mixamo <one to three .fbx files>');
  process.exit(2);
}

const server = await createServer({ server: { port: 5199, strictPort: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0];
const chrome = process.env.CHROME
  ?? `${homedir()}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const browser = await chromium.launch({ executablePath: chrome, headless: true });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  // The page asks for /fbx/<n>; each request is answered with the matching file from disk.
  await page.route('**/fbx/*', (route) => {
    const n = Number(new URL(route.request().url()).pathname.split('/').pop());
    // Textures are embedded in Mixamo's FBX; any other file it asks for doesn't exist.
    if (!files[n]) return route.fulfill({ status: 404 });
    return route.fulfill({ body: readFileSync(files[n]), contentType: 'application/octet-stream' });
  });
  await page.goto(`${base}scripts/import-mixamo.html`);
  await page.waitForFunction(() => window.ready, null, { timeout: 60_000 });
  mkdirSync('public/models', { recursive: true });
  for (let i = 0; i < files.length; i++) {
    const glb = Buffer.from(await page.evaluate((url) => window.convert(url), `/fbx/${i}`), 'base64');
    const out = `public/models/crew-${i + 1}.glb`;
    writeFileSync(out, glb);
    const mb = (bytes) => (bytes / 1e6).toFixed(1);
    console.log(`${files[i]} (${mb(statSync(files[i]).size)} MB) -> ${out} (${mb(glb.length)} MB)`);
  }
} finally {
  await browser.close();
  await server.close();
}
