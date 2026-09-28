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

function findBone(root: Object3D, name: string): Bone {
  let found: Bone | null = null;
  // GLTFLoader strips the ':' from Mixamo names, so match both spellings.
  root.traverse((o) => {
    if (!found && o instanceof Bone && (o.name === name || o.name === name.replace(':', ''))) found = o;
  });
  if (!found) throw new Error(`Bone ${name} not found`);
  return found;
}

/**
 * A rigged human dancer (Mixamo's "Michelle" from the three.js examples) driven by the same eased
 * angles as the cartoon coach. She faces the camera, so her anatomical right arm is on screen-left:
 * that is target arm "L", which the player copies with their own left arm.
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

  static async load(url: string): Promise<RealCoach> {
    const gltf = await new GLTFLoader().loadAsync(url);
    return new RealCoach(gltf.scene);
  }

  private constructor(model: Object3D) {
    this.model = model;
    model.traverse((o) => {
      if (o instanceof Mesh) {
        o.castShadow = true;
        o.frustumCulled = false; // skinned bounds don't follow the pose
      }
    });
    const box = new Box3().setFromObject(model);
    const scale = HEIGHT / (box.max.y - box.min.y);
    model.scale.multiplyScalar(scale);
    this.baseY = -box.min.y * scale;
    model.position.y = this.baseY;
    this.group.add(model);

    // Screen-left arm (target L) is her anatomical right.
    const chain = (side: 'Left' | 'Right'): Chain => ({
      arm: findBone(model, `mixamorig:${side}Arm`),
      fore: findBone(model, `mixamorig:${side}ForeArm`),
      hand: findBone(model, `mixamorig:${side}Hand`),
    });
    this.arms = { L: chain('Right'), R: chain('Left') };
    this.spine = findBone(model, 'mixamorig:Spine');
    this.hips = findBone(model, 'mixamorig:Hips');
    this.neck = findBone(model, 'mixamorig:Neck');
    this.upLeg = { L: findBone(model, 'mixamorig:RightUpLeg'), R: findBone(model, 'mixamorig:LeftUpLeg') };
    this.leg = { L: findBone(model, 'mixamorig:RightLeg'), R: findBone(model, 'mixamorig:LeftLeg') };
    for (const b of [this.arms.L.arm, this.arms.L.fore, this.arms.R.arm, this.arms.R.fore, this.spine, this.hips, this.neck, this.upLeg.L, this.upLeg.R, this.leg.L, this.leg.R]) {
      this.rest.set(b, b.quaternion.clone());
    }
  }

  update(target: MoveTarget | null, beatPhase: number, beatIndex: number, dt: number): void {
    const p = this.motion.step(target, beatIndex, dt);
    for (const [b, q] of this.rest) b.quaternion.copy(q);

    const bounce = Math.abs(Math.sin(Math.PI * beatPhase));
    this.group.position.x = Math.sin((beatIndex + beatPhase) * Math.PI) * 0.05;
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
