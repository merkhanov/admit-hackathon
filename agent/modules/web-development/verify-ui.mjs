#!/usr/bin/env node
// Usage: node verify-ui.mjs <url> [outDir]  — run from the project root (needs playwright in node_modules)
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(join(process.cwd(), 'package.json'));
const { chromium } = require('playwright');
const url = process.argv[2] ?? 'http://localhost:3000';
const out = process.argv[3] ?? '.context/verify';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const consoleLines = [], failures = [];
for (const [name, width, height] of [['desktop-1440', 1440, 900], ['mobile-390', 390, 844]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on('console', m => (m.type() === 'error' || m.type() === 'warning') && consoleLines.push(`[${name}] ${m.type()}: ${m.text()}`));
  page.on('requestfailed', r => failures.push(`[${name}] ${r.failure()?.errorText} ${r.url()}`));
  page.on('response', r => r.status() >= 400 && failures.push(`[${name}] HTTP ${r.status()} ${r.url()}`));
  const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  console.log(`${name}: HTTP ${resp?.status()}`);
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
  await page.close();
}
await browser.close();
writeFileSync(join(out, 'console.txt'), consoleLines.join('\n') || 'clean');
writeFileSync(join(out, 'network-failures.txt'), failures.join('\n') || 'clean');
console.log(`artifacts: ${out}; console: ${consoleLines.length}; network failures: ${failures.length}`);
if (consoleLines.some(l => l.includes('error:')) || failures.length) process.exit(1);
