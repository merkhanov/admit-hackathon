// Downloads the dancer model into public/models/ before dev and build.
// The model is Mixamo's "Michelle" (Adobe), as published in the three.js examples. Mixamo's terms
// allow using it in games but not redistributing the raw file, so it is not committed to the repo.
// If the download fails, the game falls back to its built-in cartoon coach.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const MODELS = [
  { url: 'https://threejs.org/examples/models/gltf/Michelle.glb', path: 'public/models/michelle.glb' },
];

mkdirSync('public/models', { recursive: true });
for (const m of MODELS) {
  if (existsSync(m.path)) continue;
  try {
    const res = await fetch(m.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    writeFileSync(m.path, Buffer.from(await res.arrayBuffer()));
    console.log(`fetched ${m.path}`);
  } catch (err) {
    console.warn(`Could not fetch ${m.url} (${err.message}). The cartoon coach will be used instead.`);
  }
}
