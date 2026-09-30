// End-to-end check of cross-device multiplayer, the path that broke on phones.
// Two isolated browser contexts act as two devices (they share no BroadcastChannel or storage):
// a desktop host creates a room in the lobby, an iPhone joins by code, the host starts the song,
// and both must dance. Uses the real PeerJS broker, so it needs internet.
//
//   pnpm dev                     # in another terminal
//   pnpm e2e:multiplayer         # BASE=https://admit-hackathon.vercel.app/ to test the live site
//
// CHROME=/path/to/chrome overrides the browser. Headless Chrome can't resolve the mDNS
// host candidates WebRTC uses between two contexts on one machine, so mDNS masking is
// switched off here; real devices resolve them or use STUN.
import { chromium, devices } from 'playwright-core';
import { homedir } from 'node:os';

const chrome = process.env.CHROME
  ?? `${homedir()}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const base = process.env.BASE ?? 'http://localhost:5173/';

const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--autoplay-policy=user-gesture-required', '--enable-unsafe-swiftshader'],
});

async function open(context, name) {
  const page = await context.newPage();
  await page.addInitScript((n) => localStorage.setItem('motion-dance.playerName.v1', n), name);
  await page.goto(`${base}?demo`);
  await page.click('#start-btn');
  await page.waitForSelector('.lobby-card', { timeout: 10_000 });
  return page;
}
const roster = (page) => page.$$eval('.lobby-players li', (items) => items.length);
const score = (page) => page.$eval('#hud-score', (el) => Number(el.textContent));

async function until(label, check, seconds) {
  for (let i = 0; i < seconds * 2; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out: ${label}`);
}

try {
  const host = await open(await browser.newContext({ viewport: { width: 1280, height: 800 } }), 'Хост');
  await host.click('#lobby-create');
  const code = (await host.textContent('.room-code')).trim();
  const phone = await open(await browser.newContext({ ...devices['iPhone 13'] }), 'Телефон');
  await phone.click('#lobby-join-toggle');
  await phone.fill('#lobby-join-code', code);
  await phone.click('#lobby-join');
  await until('both lobbies list two players', async () => (await roster(host)) === 2 && (await roster(phone)) === 2, 20);
  console.log(`ok  room ${code}: host and phone see each other`);

  await host.click('#lobby-start');
  await until('both players score after the host starts', async () => (await score(host)) > 0 && (await score(phone)) > 0, 45);
  console.log('ok  the host started the song and the phone danced');

  // The desktop host sees the phone player dancing as an avatar; the phone keeps its stage clear.
  const tags = (page) => page.$$eval('.crew-tag', (els) => els.map((e) => e.textContent));
  await until('the host shows the phone player as an avatar', async () => (await tags(host)).some((t) => t.startsWith('Телефон')), 10);
  if ((await tags(phone)).length !== 0) throw new Error('the phone should not draw avatars');
  if (process.env.SHOT) await host.screenshot({ path: process.env.SHOT });
  console.log(`ok  host shows avatars: ${(await tags(host)).join(', ')}`);
  console.log('PASS');
} catch (err) {
  console.error(`FAIL: ${err.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
