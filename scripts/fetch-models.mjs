// Downloads the dancer models into public/models/ before dev and build.
// They are published in the three.js examples: Michelle, Xbot and Soldier come from Mixamo (Adobe),
// the avatar from Ready Player Me. Their terms allow using them in games but not redistributing
// the raw files, so they are not committed to the repo. If a download fails, that dancer falls back
// to the built-in cartoon figure.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const MODELS = [
  // The coach.
  { url: 'https://threejs.org/examples/models/gltf/Michelle.glb', path: 'public/models/michelle.glb' },
  // Other players' avatars in multiplayer: one distinct model per slot.
  { url: 'https://threejs.org/examples/models/gltf/Xbot.glb', path: 'public/models/xbot.glb' },
  { url: 'https://threejs.org/examples/models/gltf/Soldier.glb', path: 'public/models/soldier.glb' },
  { url: 'https://threejs.org/examples/models/gltf/readyplayer.me.glb', path: 'public/models/avatar.glb' },
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
