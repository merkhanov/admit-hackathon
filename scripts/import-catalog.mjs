// Builds the shop's character catalogue from the 100 Avatars collection by Polygonal Mind (300 characters,
// CC0: free to use, change and publish). Each character is downloaded once, tried as a dancer in a headless
// browser, and, if it dances right, gets a portrait in public/avatars/catalog/ and an entry in
// src/stage/catalog.ts. The game itself loads a character's model from Arweave, the collection's permanent
// storage, only when a player picks it, so the repo keeps just the small portraits.
//
//   pnpm import:catalog
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const REGISTRY = 'https://raw.githubusercontent.com/ToxSam/open-source-avatars/main/data/avatars/100avatars-';
const CACHE = '.cache/avatars';
/** Bones a dancer can't do without, by their VRM names. */
const REQUIRED = ['hips', 'spine', 'neck', 'head', 'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightUpperArm', 'rightLowerArm', 'rightHand', 'leftUpperLeg', 'leftLowerLeg', 'rightUpperLeg', 'rightLowerLeg'];
/**
 * Left out of a kids' game: blood and horror (the nurse, Bloody, the zombie, Nightmare, the eyes), a rude
 * joke (the eggplant), and Sticker, a plain black silhouette that looks like a missing model.
 */
const EXCLUDED = new Set(['015', '030', '040', '041', '044', '065', '068', '090']);
/** Already in the shop with their own compressed model. */
const BUILT_IN = new Set(['252', '293', '226']);

mkdirSync(CACHE, { recursive: true });
mkdirSync('public/avatars/catalog', { recursive: true });

const entries = [];
for (const series of ['r1', 'r2', 'r3']) entries.push(...(await (await fetch(`${REGISTRY}${series}.json`)).json()));
entries.sort((a, b) => a.metadata.number.localeCompare(b.metadata.number));

/** Downloads with a few at a time, retrying once, into the cache. */
async function download(e) {
  const path = `${CACHE}/${e.metadata.number}.vrm`;
  if (existsSync(path)) return path;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(e.model_file_url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      writeFileSync(path, Buffer.from(await res.arrayBuffer()));
      return path;
    } catch (err) {
      if (attempt) throw err;
    }
  }
}
const queue = [...entries];
await Promise.all(Array.from({ length: 8 }, async () => {
  for (let e; (e = queue.shift());) {
    try { await download(e); } catch (err) { console.warn(`${e.metadata.number} ${e.name}: download failed (${err.message})`); }
  }
}));

/** The humanoid bones a VRM declares, read from its JSON chunk. */
function humanBones(path) {
  const b = readFileSync(path);
  if (b.readUInt32LE(0) !== 0x46546c67) return null;
  const json = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
  const v0 = json.extensions?.VRM?.humanoid?.humanBones;
  const v1 = json.extensions?.VRMC_vrm?.humanoid?.humanBones;
  return v0 ? v0.map((x) => x.bone) : v1 ? Object.keys(v1) : null;
}

const server = await createServer({ server: { port: 5197, strictPort: false }, logLevel: 'error' });
await server.listen();
const chrome = process.env.CHROME
  ?? `${homedir()}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--enable-unsafe-swiftshader'] });
const catalog = [];
const skipped = [];
try {
  const page = await browser.newPage();
  await page.route('**/vrm/*', (route) => {
    const n = new URL(route.request().url()).pathname.split('/').pop();
    return route.fulfill({ body: readFileSync(`${CACHE}/${n}.vrm`), contentType: 'model/gltf-binary' });
  });
  await page.goto(`${server.resolvedUrls.local[0]}scripts/catalog.html`);
  await page.waitForFunction(() => window.ready, null, { timeout: 60_000 });
  for (const e of entries) {
    const n = e.metadata.number;
    if (BUILT_IN.has(n) || EXCLUDED.has(n)) continue;
    const path = `${CACHE}/${n}.vrm`;
    if (!existsSync(path)) { skipped.push(`${n} ${e.name}: not downloaded`); continue; }
    const bones = humanBones(path);
    const missing = bones ? REQUIRED.filter((r) => !bones.includes(r)) : REQUIRED;
    if (missing.length) { skipped.push(`${n} ${e.name}: missing ${missing.join(', ')}`); continue; }
    // A fresh page per character keeps memory flat across 300 models.
    if (catalog.length % 25 === 24) await page.reload().then(() => page.waitForFunction(() => window.ready));
    const r = await page.evaluate((url) => window.tryCharacter(url), `/vrm/${n}`).catch((err) => ({ ok: false, reason: String(err.message).slice(0, 80) }));
    if (!r.ok) { skipped.push(`${n} ${e.name}: ${r.reason}`); continue; }
    writeFileSync(`public/avatars/catalog/${n}.webp`, Buffer.from(r.portrait.split(',')[1], 'base64'));
    catalog.push({ id: `pm${n}`, number: n, name: e.name, model: e.model_file_url });
    process.stdout.write(`\r${catalog.length} characters ready`);
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(`\n${catalog.length} characters in the catalogue, ${skipped.length} skipped:`);
for (const s of skipped) console.log(`  ${s}`);

/** "CoolBanana" -> "Cool Banana", "COOLFRIES" -> "Coolfries". */
const label = (name) => {
  const word = /^[A-Z0-9]+$/.test(name) && name.length > 3 ? name[0] + name.slice(1).toLowerCase() : name;
  return word.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').trim();
};
writeFileSync('src/stage/catalog.ts', `// Generated by scripts/import-catalog.mjs from the 100 Avatars collection by Polygonal Mind (CC0). Don't edit.
// Each model is loaded from Arweave when a player picks the character; portraits are in public/avatars/catalog/.

export interface CatalogCharacter {
  id: string;
  /** The collection's number, which names the portrait file. */
  number: string;
  name: string;
  model: string;
}

export const CATALOG: readonly CatalogCharacter[] = ${JSON.stringify(catalog.map((c) => ({ ...c, name: label(c.name) })), null, 2).replace(/"(\w+)":/g, '$1:')};
`);
