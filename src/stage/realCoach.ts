import { Bone, Box3, Group, Mesh, Quaternion, Vector3, type Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { MoveTarget } from '../dance/moves.ts';
import type { Side } from '../pose/features.ts';
import { CoachMotion, type CoachView } from './coach.ts';

const RAD = Math.PI / 180;
const HEIGHT = 2.25;
/** Tilts limb directions slightly towards the camera, so elbows bend forward rather than flipping. */
const TOWARD_CAMERA = 0.12;

interface Chain { arm: Bone; fore: Bone; hand: Bone }

/**
 * Finds a Mixamo-standard bone such as "RightForeArm". Mixamo files name it "mixamorig:RightForeArm"
 * (GLTFLoader drops the ':'), Ready Player Me files use the bare name; all three are accepted.
 */
function findBone(root: Object3D, name: string): Bone {
  let found: Bone | null = null;
  root.traverse((o) => {
    if (!found && o instanceof Bone && (o.name === name || o.name === `mixamorig${name}` || o.name === `mixamorig:${name}`)) found = o;
  });
  if (!found) throw new Error(`Bone ${name} not found`);
  return found;
}

export interface RealCoachOptions {
  /** Standing height in scene units. The coach is 2.25; avatars are smaller. */
  height?: number;
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

  /** Loads a model once per URL; each URL is used by one dancer, so no skeleton cloning is needed. */
  static async load(url: string, options: RealCoachOptions = {}): Promise<RealCoach> {
    let scene = gltfCache.get(url);
    if (!scene) {
      scene = new GLTFLoader().loadAsync(url).then((g) => g.scene);
      gltfCache.set(url, scene);
    }
    return new RealCoach(await scene, options);
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
    this.upLeg = { L: findBone(model, 'RightUpLeg'), R: findBone(model, 'LeftUpLeg') };
    this.leg = { L: findBone(model, 'RightLeg'), R: findBone(model, 'LeftLeg') };
    for (const b of [this.arms.L.arm, this.arms.L.fore, this.arms.R.arm, this.arms.R.fore, this.spine, this.hips, this.neck, this.upLeg.L, this.upLeg.R, this.leg.L, this.leg.R]) {
      this.rest.set(b, b.quaternion.clone());
    }
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
