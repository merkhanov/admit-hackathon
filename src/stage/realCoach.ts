import { Bone, Box3, CanvasTexture, Group, Mesh, MeshStandardMaterial, Quaternion, Vector3, type Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import type { MoveTarget } from '../dance/moves.ts';
import type { Side } from '../pose/features.ts';
import { CoachMotion, type CoachView } from './coach.ts';
import { buildHat } from './hats.ts';
import { recolor, type Look } from './outfits.ts';
import type { Hat } from './themes.ts';

const RAD = Math.PI / 180;
const HEIGHT = 2.25;
/** Tilts limb directions slightly towards the camera, so elbows bend forward rather than flipping. */
const TOWARD_CAMERA = 0.12;
/** Head radius as a share of the head bone's length, and how far up the skull a hat sits. */
const HEAD_RADIUS = 0.8;
const HAT_SEAT = 1.08;

interface Chain { arm: Bone; fore: Bone; hand: Bone }

/**
 * Finds a Mixamo-standard bone such as "RightForeArm". Mixamo files name it "mixamorig:RightForeArm"
 * (GLTFLoader drops the ':'), Ready Player Me files use the bare name; both are accepted.
 */
function tryBone(root: Object3D, name: string): Bone | null {
  let found: Bone | null = null;
  root.traverse((o) => {
    // Some exports prefix the rig name too, as in "vis_char_052:mixamorig:LeftArm".
    if (!found && o instanceof Bone && (o.name === name || o.name.replace(/:/g, '').endsWith(`mixamorig${name}`))) found = o;
  });
  return found;
}

function findBone(root: Object3D, name: string): Bone {
  const found = tryBone(root, name);
  if (!found) throw new Error(`Bone ${name} not found`);
  return found;
}

/** Gives a copy of the model its own recoloured texture; geometry stays shared. */
function dress(model: Object3D, look: Look): void {
  model.traverse((o) => {
    if (!(o instanceof Mesh) || !(o.material instanceof MeshStandardMaterial)) return;
    const source = o.material.map;
    const image = source?.image as CanvasImageSource & { width: number; height: number } | undefined;
    if (!source || !image) return;
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    recolor(pixels.data, look);
    ctx.putImageData(pixels, 0, 0);
    const map = new CanvasTexture(canvas);
    map.flipY = source.flipY;
    map.colorSpace = source.colorSpace;
    map.wrapS = source.wrapS;
    map.wrapT = source.wrapT;
    const material = o.material.clone();
    material.map = map;
    o.material = material;
  });
}

export interface RealCoachOptions {
  /** Standing height in scene units. The coach is 2.25; avatars are smaller. */
  height?: number;
  /** An avatar's outfit, skin, hair and hat. Without it the model keeps its own look. */
  look?: Look;
  /** Shadows cost a pass per mesh; avatars skip them. */
  castShadow?: boolean;
}

const gltfCache = new Map<string, Promise<Object3D>>();

/**
 * A rigged human dancer with a Mixamo-standard skeleton (the coach is Michelle; player avatars are
 * Xbot, Soldier and a Ready Player Me avatar), driven by the same eased angles as the cartoon coach.
 * It faces the camera, so its anatomical right arm is on screen-left: that is target arm "L",
 * which the player copies with their own left arm.
 */
export class RealCoach implements CoachView {
  readonly group = new Group();
  private readonly motion = new CoachMotion();
  private readonly arms: Record<Side, Chain>;
  private readonly spine: Bone;
  private readonly hips: Bone;
  private readonly neck: Bone;
  private readonly upLeg: Record<Side, Bone>;
  private readonly leg: Record<Side, Bone>;
  private readonly rest = new Map<Bone, Quaternion>();
  private readonly model: Object3D;
  private readonly baseY: number;
  private readonly head: Bone;
  /** Top of the skull in the head bone's space. */
  private readonly headTop: Vector3;
  private hat: Group | null = null;

  /** Downloads a model once per URL. Every dancer gets its own copy of the skeleton. */
  static async load(url: string, options: RealCoachOptions = {}): Promise<RealCoach> {
    let scene = gltfCache.get(url);
    if (!scene) {
      scene = new GLTFLoader().loadAsync(url).then((g) => g.scene);
      gltfCache.set(url, scene);
    }
    const model = cloneSkinned(await scene);
    if (options.look) dress(model, options.look);
    const coach = new RealCoach(model, options);
    if (options.look) coach.setHat(options.look.hat);
    return coach;
  }

  private constructor(model: Object3D, { height = HEIGHT, castShadow = true }: RealCoachOptions) {
    this.model = model;
    model.traverse((o) => {
      if (o instanceof Mesh) {
        o.castShadow = castShadow;
        o.frustumCulled = false; // skinned bounds don't follow the pose
      }
    });
    // Face the camera: a dancer facing us has their own left shoulder on screen-right (+x).
    model.updateMatrixWorld(true);
    const l = findBone(model, 'LeftArm').getWorldPosition(new Vector3());
    const r = findBone(model, 'RightArm').getWorldPosition(new Vector3());
    if (l.x < r.x) {
      model.rotation.y += Math.PI;
      model.updateMatrixWorld(true);
    }
    const box = new Box3().setFromObject(model);
    const scale = height / (box.max.y - box.min.y);
    model.scale.multiplyScalar(scale);
    this.baseY = -box.min.y * scale;
    model.position.y = this.baseY;
    this.group.add(model);

    // Screen-left arm (target L) is her anatomical right.
    const chain = (side: 'Left' | 'Right'): Chain => ({
      arm: findBone(model, `${side}Arm`),
      fore: findBone(model, `${side}ForeArm`),
      hand: findBone(model, `${side}Hand`),
    });
    this.arms = { L: chain('Right'), R: chain('Left') };
    this.spine = findBone(model, 'Spine');
    this.hips = findBone(model, 'Hips');
    this.neck = findBone(model, 'Neck');
    this.head = findBone(model, 'Head');
    // Some rigs end the skull without a HeadTop_End bone: then a hat sits one head-bone length up.
    this.headTop = tryBone(model, 'HeadTop_End')?.position.clone() ?? new Vector3(0, 0.1, 0);
    this.upLeg = { L: findBone(model, 'RightUpLeg'), R: findBone(model, 'LeftUpLeg') };
    this.leg = { L: findBone(model, 'RightLeg'), R: findBone(model, 'LeftLeg') };
    for (const b of [this.arms.L.arm, this.arms.L.fore, this.arms.R.arm, this.arms.R.fore, this.spine, this.hips, this.neck, this.upLeg.L, this.upLeg.R, this.leg.L, this.leg.R]) {
      this.rest.set(b, b.quaternion.clone());
    }
  }

  setHat(hat: Hat): void {
    if (this.hat) this.head.remove(this.hat);
    this.hat = buildHat(hat);
    if (!this.hat) return;
    // The head bone runs from the base of the skull to its top: the head's radius is about half of that.
    const radius = this.headTop.length() * HEAD_RADIUS;
    this.hat.scale.multiplyScalar(radius);
    this.hat.position.multiplyScalar(radius);
    this.hat.position.add(this.headTop.clone().multiplyScalar(HAT_SEAT));
    this.head.add(this.hat);
  }

  update(target: MoveTarget | null, beatPhase: number, beatIndex: number, dt: number): void {
    const p = this.motion.step(target, beatIndex, dt);
    for (const [b, q] of this.rest) b.quaternion.copy(q);

    const bounce = Math.abs(Math.sin(Math.PI * beatPhase));
    // Sway the model inside the group: the group position belongs to the stage (avatar slots).
    this.model.position.x = Math.sin((beatIndex + beatPhase) * Math.PI) * 0.05;
    this.model.position.y = this.baseY - p.squat * 0.45 - (1 - bounce) * 0.04;
    this.model.updateMatrixWorld(true);

    // Knees: thighs forward, shins back, so a squat folds the legs instead of sinking the feet.
    const knee = p.squat * 1.1 + (1 - bounce) * 0.08;
    for (const s of ['L', 'R'] as const) {
      rotateWorld(this.upLeg[s], new Vector3(1, 0, 0), -knee);
      rotateWorld(this.leg[s], new Vector3(1, 0, 0), knee * 1.9);
    }
    // Weight shift: the hips swing to one side per beat and the spine counters it, like a real groove.
    const sway = Math.sin((beatIndex + beatPhase) * Math.PI);
    rotateWorld(this.hips, new Vector3(0, 0, 1), sway * 0.07);
    rotateWorld(this.hips, new Vector3(0, 1, 0), sway * 0.1);
    // Lean: positive tilt tips the torso towards screen-left.
    rotateWorld(this.spine, new Vector3(0, 0, 1), p.tilt * RAD - sway * 0.06);
    // A small nod on every beat.
    rotateWorld(this.neck, new Vector3(1, 0, 0), (1 - bounce) * 0.12);

    for (const s of ['L', 'R'] as const) {
      const sign = s === 'L' ? -1 : 1;
      const dirAt = (deg: number) => new Vector3(sign * Math.sin(deg * RAD), -Math.cos(deg * RAD), TOWARD_CAMERA).normalize();
      const { arm, fore, hand } = this.arms[s];
      pointBone(arm, fore, dirAt(p.dir[s] - p.bend[s] / 2));
      pointBone(fore, hand, dirAt(p.dir[s] + p.bend[s] / 2));
    }
  }
}

const tmpA = new Vector3(), tmpB = new Vector3(), qWorld = new Quaternion(), qParent = new Quaternion(), qDelta = new Quaternion();

/** Rotates a bone in world space by `angle` around `axis`, keeping its parent. */
function rotateWorld(bone: Bone, axis: Vector3, angle: number): void {
  const parent = bone.parent;
  if (!parent) return;
  parent.updateWorldMatrix(true, false);
  bone.getWorldQuaternion(qWorld);
  qDelta.setFromAxisAngle(axis, angle);
  parent.getWorldQuaternion(qParent);
  bone.quaternion.copy(qParent.invert().multiply(qDelta.multiply(qWorld)));
  bone.updateWorldMatrix(false, true);
}

/** Turns `bone` so the segment towards `child` points along `dir` in world space. */
function pointBone(bone: Bone, child: Object3D, dir: Vector3): void {
  const parent = bone.parent;
  if (!parent) return;
  parent.updateWorldMatrix(true, false);
  bone.updateWorldMatrix(false, true);
  bone.getWorldPosition(tmpA);
  child.getWorldPosition(tmpB);
  const current = tmpB.sub(tmpA).normalize();
  qDelta.setFromUnitVectors(current, dir);
  bone.getWorldQuaternion(qWorld);
  parent.getWorldQuaternion(qParent);
  bone.quaternion.copy(qParent.invert().multiply(qDelta.multiply(qWorld)));
  bone.updateWorldMatrix(false, true);
}
