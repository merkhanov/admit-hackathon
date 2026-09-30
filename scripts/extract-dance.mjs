// Turns a motion-captured dance in a glTF model into the choreography the game judges:
// the six numbers the camera measures on a player (arm directions and elbows, lean, squat depth),
// 30 times a second, plus the dance's beat found from the bounce of the hips.
//
//   node scripts/extract-dance.mjs public/models/michelle.glb SambaDance samba
//
// writes src/dance/mocap/samba.ts. Only these angles are stored, never the model or its animation.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import {
  AnimationClip, AnimationMixer, Object3D, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack,
} from 'three';

const [file, clipName, id] = process.argv.slice(2);
if (!file || !clipName || !id) {
  console.error('Usage: node scripts/extract-dance.mjs <model.glb> <animation name> <dance id>');
  process.exit(2);
}
const FPS = 30;

// --- Read the glb: a JSON chunk and a binary chunk.
const glb = readFileSync(file);
const jsonLen = glb.readUInt32LE(12);
const gltf = JSON.parse(glb.subarray(20, 20 + jsonLen).toString());
const binStart = 20 + jsonLen + 8;
const bin = glb.subarray(binStart, binStart + glb.readUInt32LE(20 + jsonLen));

const COMPONENTS = { SCALAR: 1, VEC3: 3, VEC4: 4 };
function accessor(i) {
  const a = gltf.accessors[i];
  const view = gltf.bufferViews[a.bufferView];
  if (a.componentType !== 5126) throw new Error('Only float accessors are supported');
  const n = COMPONENTS[a.type];
  const offset = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const stride = view.byteStride ?? n * 4;
  const out = new Float32Array(a.count * n);
  for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = bin.readFloatLE(offset + k * stride + c * 4);
  return out;
}

// --- Rebuild the node tree. Names lose their ':' so three.js can bind tracks to them.
const clean = (name) => (name ?? '').replace(/:/g, '');
const nodes = gltf.nodes.map((n) => {
  const o = new Object3D();
  o.name = clean(n.name);
  if (n.translation) o.position.fromArray(n.translation);
  if (n.rotation) o.quaternion.fromArray(n.rotation);
  if (n.scale) o.scale.fromArray(n.scale);
  return o;
});
gltf.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => nodes[i].add(nodes[c])));
const root = new Object3D();
for (const i of gltf.scenes[gltf.scene ?? 0].nodes) root.add(nodes[i]);

const anim = gltf.animations.find((a) => a.name === clipName);
if (!anim) throw new Error(`No animation "${clipName}"; the file has ${gltf.animations.map((a) => a.name).join(', ')}`);
const tracks = [];
for (const ch of anim.channels) {
  const s = anim.samplers[ch.sampler];
  const name = nodes[ch.target.node].name;
  if (ch.target.path === 'rotation') tracks.push(new QuaternionKeyframeTrack(`${name}.quaternion`, accessor(s.input), accessor(s.output)));
  if (ch.target.path === 'translation') tracks.push(new VectorKeyframeTrack(`${name}.position`, accessor(s.input), accessor(s.output)));
}
const clip = new AnimationClip(clipName, -1, tracks);
const mixer = new AnimationMixer(root);
mixer.clipAction(clip).play();

const bone = (name) => {
  const b = root.getObjectByName(`mixamorig${name}`) ?? root.getObjectByName(name);
  if (!b) throw new Error(`Bone ${name} not found`);
  return b;
};
const J = {
  lShoulder: bone('LeftArm'), lElbow: bone('LeftForeArm'), lWrist: bone('LeftHand'),
  rShoulder: bone('RightArm'), rElbow: bone('RightForeArm'), rWrist: bone('RightHand'),
  hips: bone('Hips'),
  lHip: bone('LeftUpLeg'), rHip: bone('RightUpLeg'),
};

// The dancer faces the camera, so their own left shoulder is on screen-right (+x). A model that
// faces away is turned round, as the game does.
mixer.setTime(0);
root.updateMatrixWorld(true);
const flip = J.lShoulder.getWorldPosition(new Vector3()).x < J.rShoulder.getWorldPosition(new Vector3()).x ? -1 : 1;
/**
 * The dancer turns while dancing, but a player dances facing the camera. Each frame is turned so the
 * hips face the camera (the game turns the coach the same way); the torso's twist on the hips stays.
 */
let facing = new Quaternion();
function faceCamera() {
  const l = J.lHip.getWorldPosition(new Vector3()), r = J.rHip.getWorldPosition(new Vector3());
  const across = l.sub(r).setY(0).normalize();
  facing = new Quaternion().setFromUnitVectors(across, new Vector3(flip, 0, 0));
}
const at = (o) => {
  const p = o.getWorldPosition(new Vector3()).applyQuaternion(facing);
  return { x: p.x * flip, y: p.y };
};

const deg = (r) => (r * 180) / Math.PI;
function elbowAngle(s, e, w) {
  const ax = s.x - e.x, ay = s.y - e.y, bx = w.x - e.x, by = w.y - e.y;
  const cos = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by) || 1);
  return deg(Math.acos(Math.max(-1, Math.min(1, cos))));
}
/** Arm direction as the judge measures it: 0 = down, 90 = out to the side, 180 = up, negative = across the body. */
function armDir(s, w, outward) {
  return deg(Math.atan2(outward * (w.x - s.x), -(w.y - s.y)));
}

const duration = clip.duration;
const raw = [];
for (let t = 0; t < duration - 1e-6; t += 1 / FPS) {
  mixer.setTime(t);
  root.updateMatrixWorld(true);
  faceCamera();
  const ls = at(J.lShoulder), le = at(J.lElbow), lw = at(J.lWrist);
  const rs = at(J.rShoulder), re = at(J.rElbow), rw = at(J.rWrist);
  // Target arm "L" is the one on screen-left: the dancer's own right arm. Its outward side is -x.
  // Reach: shoulder-to-wrist distance over the arm's length. A folded arm's direction is shaky.
  const reach = (s, e, w) => Math.hypot(w.x - s.x, w.y - s.y) / (Math.hypot(e.x - s.x, e.y - s.y) + Math.hypot(w.x - e.x, w.y - e.y) || 1);
  const L = { dir: armDir(rs, rw, -1), elbow: elbowAngle(rs, re, rw), reach: reach(rs, re, rw) };
  const R = { dir: armDir(ls, lw, 1), elbow: elbowAngle(ls, le, lw), reach: reach(ls, le, lw) };
  // Positive tilt tips the torso towards screen-left: the screen-left shoulder (their right) drops.
  const tilt = deg(Math.atan2(ls.y - rs.y, Math.abs(ls.x - rs.x)));
  const sw = Math.hypot(ls.x - rs.x, ls.y - rs.y);
  raw.push({ L, R, tilt, midY: (ls.y + rs.y) / 2, sw, hipsY: J.hips.getWorldPosition(new Vector3()).y });
}

// Squat depth: how far the shoulders sink below the dancer's usual stance, in shoulder widths (as the
// judge measures it). Dancers keep their knees soft, so only a real dip beyond that counts.
const stance = [...raw.map((r) => r.midY)].sort((a, b) => a - b)[Math.floor(raw.length / 2)];
const DIP_FREE = 0.1;
const FULL_SQUAT = 0.35;

// The beat: the hips bounce once per beat, so the strongest repeat of their height between
// 0.3 s and 1 s is one beat.
const hy = raw.map((r) => r.hipsY);
const mean = hy.reduce((a, b) => a + b, 0) / hy.length;
let best = { lag: 0, score: -Infinity };
for (let lag = Math.round(0.3 * FPS); lag <= Math.round(1.0 * FPS); lag++) {
  let s = 0;
  for (let i = 0; i + lag < hy.length; i++) s += (hy[i] - mean) * (hy[i + lag] - mean);
  s /= hy.length - lag;
  if (s > best.score) best = { lag, score: s };
}
// Refine to sub-frame precision by the best-matching whole number of beats over the clip.
const beats = Math.round(duration / (best.lag / FPS));
const beat = duration / beats;

/**
 * Smooths over five frames. On a flat camera image an arm pointing at the lens looks folded, so the
 * elbow never reads tighter than 45°: neither the camera nor a player can hit angles that come and go.
 */
const SMOOTH = 2;
/** Arm directions average over a wider window, weighted by reach, so a folded arm's shaky direction barely counts. */
const DIR_SMOOTH = 6;
const avg = (pick, angle, span = SMOOTH, weight = () => 1) => raw.map((_, i) => {
  const base = pick(raw[i]);
  let sum = 0, n = 0;
  for (let k = -span; k <= span; k++) {
    const r = raw[(i + k + raw.length) % raw.length];
    const v = pick(r);
    const w = weight(r) * (1 - Math.abs(k) / (span + 1));
    sum += w * (angle ? ((((v - base) % 360) + 540) % 360) - 180 : v - base);
    n += w;
  }
  const out = base + sum / (n || 1);
  return angle ? ((((out + 180) % 360) + 360) % 360) - 180 : out;
});
/**
 * An arm pointing at the camera puts the hand on top of the shoulder in the image: its direction means
 * nothing there. Below this reach the direction holds where it last was while the arm showed, as a
 * player watching the coach would read it. Two passes round the loop, so the start inherits from the end.
 */
const SHOWN_REACH = 0.35;
function hold(dirs, reachOf) {
  const out = [...dirs];
  let last = dirs[dirs.length - 1];
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < out.length; i++) {
      const w = Math.min(1, reachOf(raw[i]) / SHOWN_REACH) ** 2;
      const d = ((((dirs[i] - last) % 360) + 540) % 360) - 180;
      out[i] = ((((last + w * d + 180) % 360) + 360) % 360) - 180;
      last = out[i];
    }
  }
  return out;
}
const dirL = hold(avg((r) => r.L.dir, true, DIR_SMOOTH, (r) => r.L.reach ** 2 + 0.02), (r) => r.L.reach);
const dirR = hold(avg((r) => r.R.dir, true, DIR_SMOOTH, (r) => r.R.reach ** 2 + 0.02), (r) => r.R.reach);
const elbowL = avg((r) => r.L.elbow, false), elbowR = avg((r) => r.R.elbow, false);
const tilts = avg((r) => r.tilt, false);
const frames = raw.map((r, i) => [
  Math.round(dirL[i]), Math.round(Math.max(45, elbowL[i])), Math.round(dirR[i]), Math.round(Math.max(45, elbowR[i])),
  Math.round(tilts[i]), Math.round(Math.max(0, Math.min(1, ((stance - r.midY) / r.sw - DIP_FREE) / FULL_SQUAT)) * 100),
]);

mkdirSync('src/dance/mocap', { recursive: true });
const out = `src/dance/mocap/${id}.ts`;
writeFileSync(out, `// Generated by scripts/extract-dance.mjs from the "${clipName}" motion capture. Do not edit by hand.
import type { Mocap } from '../mocap.ts';

export const ${id.toUpperCase()}: Mocap = {
  id: '${id}',
  fps: ${FPS},
  /** Seconds per beat of the dance as it was captured. */
  beat: ${beat.toFixed(5)},
  /** Per frame: left arm direction, left elbow, right arm direction, right elbow, tilt, squat %. */
  frames: ${JSON.stringify(frames)},
};
`);
console.log(`${out}: ${frames.length} frames over ${duration.toFixed(2)} s, ${beats} beats of ${beat.toFixed(3)} s (${(60 / beat).toFixed(1)} bpm)`);
