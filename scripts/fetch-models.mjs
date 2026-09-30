// Downloads the dancer model into public/models/ before dev and build.
// Michelle is published in the three.js examples and comes from Mixamo (Adobe). Its terms allow
// using it in games but not redistributing the raw file, so it is not committed to the repo.
// The coach and every multiplayer avatar are this one model. If the download fails, the dancers
// fall back to the built-in cartoon figure.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const MODELS = [
  {
    // The same file from the three.js repository, for networks that can't reach threejs.org.
    urls: ['https://threejs.org/examples/models/gltf/Michelle.glb', 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/Michelle.glb'],
    path: 'public/models/michelle.glb',
  },
];

mkdirSync('public/models', { recursive: true });
for (const m of MODELS) {
  if (existsSync(m.path)) continue;
  const errors = [];
  for (const url of m.urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      writeFileSync(m.path, Buffer.from(await res.arrayBuffer()));
      console.log(`fetched ${m.path}`);
      break;
    } catch (err) {
      errors.push(`${url} (${err.message})`);
    }
  }
  if (!existsSync(m.path)) console.warn(`Could not fetch ${errors.join(', ')}. The cartoon coach will be used instead.`);
}
