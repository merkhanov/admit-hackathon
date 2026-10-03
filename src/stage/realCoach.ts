import { AnimationMixer, Bone, Box3, CanvasTexture, Group, Mesh, MeshStandardMaterial, Quaternion, Vector3, type AnimationClip, type Object3D, type Texture } from 'three';
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
/**
 * A limb pointing across the body comes this much further forward, so the hand passes in front of the
 * chest and face as a person's does, instead of through them.
 */
const ACROSS_FORWARD = 0.9;
/** Head radius as a share of the head bone's length, and how far up the skull a hat sits. */
const HEAD_RADIUS = 0.8;
const HAT_SEAT = 1.08;

interface Chain { arm: Bone; fore: Bone; hand: Bone }

/** A hand's bones: the knuckles that show which way the palm faces, and each finger's joints, base to tip. */
interface HandRig {
  index: Bone | null;
  middle: Bone | null;
  pinky: Bone | null;
  /** Joints of each finger, the thumb first, ending with the tip bone. */
  fingers: Bone[][];
  /** +1 or -1 so that cross(hand→middle, index→pinky) points out of the palm on this rig. */
  palmSign: number;
}

/** How far each finger joint curls towards the palm in a relaxed hand, base to tip (radians). */
const FINGER_CURL = [0.3, 0.45, 0.3];
const THUMB_CURL = [0.15, 0.2, 0.15];
/** The wrist bends a little towards the palm, as a hand does when it isn't holding anything. */
const WRIST_BEND = 0.18;
/**
 * Where a relaxed palm faces, before the forearm's own direction is taken out: towards the body's middle
 * (palms to the thighs when the arms hang, to the head when they're up), else down (arms out to the
 * sides), and a little forward.
 */
const PALM_INWARD = 1, PALM_DOWN = 0.6, PALM_FORWARD = 0.35;
/** A forearm reaching across the body (arms crossed, hand to the other shoulder) lays its palm on the chest. */
const PALM_TO_CHEST = 2.5;

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

/** Each textured mesh's own texture before any recolouring, so clothes can change again later. */
type Originals = Map<Mesh, Texture>;

function originalsOf(model: Object3D): Originals {
  const out: Originals = new Map();
  model.traverse((o) => {
    if (o instanceof Mesh && o.material instanceof MeshStandardMaterial && o.material.map) out.set(o, o.material.map);
  });
  return out;
}

/** Gives a copy of the model its own recoloured texture, made from the original; geometry stays shared. */
function dress(originals: Originals, look: Partial<Look>): void {
  for (const [o, source] of originals) {
    if (!(o.material instanceof MeshStandardMaterial)) continue;
    const image = source.image as CanvasImageSource & { width: number; height: number } | undefined;
    if (!image) continue;
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
    const old = o.material;
    const material = old.clone();
    material.map = map;
    o.material = material;
    // A texture this function made earlier (not the model's own) is no longer used.
    if (old.map && old.map !== source) old.map.dispose();
  }
}

/** Puts the model's own textures back. */
function undress(originals: Originals): void {
  for (const [o, source] of originals) {
    if (!(o.material instanceof MeshStandardMaterial) || o.material.map === source) continue;
    const old = o.material;
    const material = old.clone();
    material.map = source;
    o.material = material;
    if (old.map && old.map !== source) old.map.dispose();
  }
}

export interface RealCoachOptions {
  /** Standing height in scene units. The coach is 2.25; avatars are smaller. */
  height?: number;
  /** An avatar's outfit, skin, hair and hat. Without it the model keeps its own look. */
  look?: Look;
  /** Shadows cost a pass per mesh; avatars skip them. */
  castShadow?: boolean;
}

const gltfCache = new Map<string, Promise<{ scene: Object3D; animations: AnimationClip[] }>>();

/** The recorded dance in the coach's model that the mocap songs are extracted from (scripts/extract-dance.mjs). */
const DANCE_CLIP = 'SambaDance';

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
  private readonly hands: Record<Side, HandRig>;
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
  /** Plays the recorded dance, when the model has one. */
  private readonly mixer: AnimationMixer | null = null;
  /** Every bone's rest pose, restored when a recorded dance hands back to the eased angles. */
  private readonly bind = new Map<Bone, { q: Quaternion; p: Vector3 }>();
  private recorded = false;
  /** The model's own textures, to dress it again from. */
  private readonly originals: Originals;
  private readonly leftHip: Bone;
  private readonly rightHip: Bone;
  /** Where the hips stand at rest, in the group's space: the recorded dance is kept on this spot. */
  private readonly hipsHome: Vector3;
  /** Foot and toe bones, and how high the lowest of them stands at rest: that height is the floor. */
  private readonly feet: Bone[];
  private readonly footFloor: number;

  /** Downloads a model once per URL. Every dancer gets its own copy of the skeleton. */
  static async load(url: string, options: RealCoachOptions = {}): Promise<RealCoach> {
    let gltf = gltfCache.get(url);
    if (!gltf) {
      gltf = new GLTFLoader().loadAsync(url).then((g) => ({ scene: g.scene, animations: g.animations }));
      gltfCache.set(url, gltf);
    }
    const { scene, animations } = await gltf;
    const model = cloneSkinned(scene);
    const originals = originalsOf(model);
    if (options.look) dress(originals, options.look);
    const coach = new RealCoach(model, options, animations.find((a) => a.name === DANCE_CLIP) ?? null, originals);
    if (options.look) coach.setHat(options.look.hat);
    return coach;
  }

  private constructor(model: Object3D, { height = HEIGHT, castShadow = true }: RealCoachOptions, clip: AnimationClip | null, originals: Originals) {
    this.originals = originals;
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
    const handRig = (side: 'Left' | 'Right'): HandRig => {
      const finger = (name: string) => [1, 2, 3, 4].map((i) => tryBone(model, `${side}Hand${name}${i}`)).filter((b): b is Bone => b !== null);
      const rig: HandRig = {
        index: tryBone(model, `${side}HandIndex1`),
        middle: tryBone(model, `${side}HandMiddle1`),
        pinky: tryBone(model, `${side}HandPinky1`),
        fingers: ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'].map(finger).filter((f) => f.length >= 2),
        palmSign: 1,
      };
      return rig;
    };
    this.hands = { L: handRig('Right'), R: handRig('Left') };
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
    // Hands and fingers are posed every frame too, so they start from rest each time.
    for (const s of ['L', 'R'] as const) {
      this.rest.set(this.arms[s].hand, this.arms[s].hand.quaternion.clone());
      for (const f of this.hands[s].fingers) for (const b of f) this.rest.set(b, b.quaternion.clone());
    }
    // In the model's rest pose (arms out, a T-pose) palms face down: that fixes which way "palm" is.
    model.updateMatrixWorld(true);
    for (const s of ['L', 'R'] as const) {
      const n = this.palmNormal(s, 1);
      if (n && n.y > 0) this.hands[s].palmSign = -1;
    }
    this.leftHip = findBone(model, 'LeftUpLeg');
    this.rightHip = findBone(model, 'RightUpLeg');
    model.traverse((o) => { if (o instanceof Bone) this.bind.set(o, { q: o.quaternion.clone(), p: o.position.clone() }); });
    model.updateMatrixWorld(true);
    this.hipsHome = this.group.worldToLocal(this.hips.getWorldPosition(new Vector3()));
    this.feet = ['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'].map((n) => tryBone(model, n)).filter((b): b is Bone => b !== null);
    this.footFloor = Math.min(...this.feet.map((f) => this.group.worldToLocal(f.getWorldPosition(new Vector3())).y));
    if (clip) {
      this.mixer = new AnimationMixer(model);
      this.mixer.clipAction(clip).play();
    }
  }

  /** Changes clothes: the parts `look` sets are recoloured, the rest is the model's own; null undresses. */
  wear(look: Partial<Look> | null): void {
    const colours = look && (look.top !== undefined || look.pants !== undefined || look.hair !== undefined || look.skin !== undefined);
    if (colours) dress(this.originals, look);
    else undress(this.originals);
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

  update(target: MoveTarget | null, beatPhase: number, beatIndex: number, dt: number, clip: number | null = null): void {
    // Keep easing towards the target even while the recording plays, so handing back is smooth.
    const p = this.motion.step(target, beatIndex, dt);
    if (clip !== null && this.mixer) {
      this.performRecording(clip);
      return;
    }
    if (this.recorded) {
      this.recorded = false;
      for (const [b, rest] of this.bind) { b.quaternion.copy(rest.q); b.position.copy(rest.p); }
    }
    for (const [b, q] of this.rest) b.quaternion.copy(q);

    const bounce = Math.abs(Math.sin(Math.PI * beatPhase));
    // Weight shift: one side-to-side swing every two beats. Waiting with nothing to show (calibration,
    // the lobby) she grooves bigger, stepping from foot to foot, so she never stands rooted.
    const idle = target === null;
    const sway = Math.sin((beatIndex + beatPhase) * Math.PI);
    // Sway the model inside the group: the group position belongs to the stage (avatar slots).
    this.model.position.set(sway * (idle ? 0.09 : 0.05), this.baseY, 0);
    this.model.updateMatrixWorld(true);

    // Knees: thighs forward, shins back, so a squat folds the legs. Both give a little on every beat,
    // and the leg that carries no weight bends more, as when a person shifts from foot to foot.
    const give = (1 - bounce) * (idle ? 0.16 : 0.08);
    for (const s of ['L', 'R'] as const) {
      // Target side L is on screen-left (-x): when the hips swing right, the left leg is the free one.
      const free = Math.max(0, s === 'L' ? sway : -sway) * (idle ? 0.35 : 0.15);
      const knee = p.squat * 1.1 + give + free;
      rotateWorld(this.upLeg[s], new Vector3(1, 0, 0), -knee);
      rotateWorld(this.leg[s], new Vector3(1, 0, 0), knee * 1.9);
    }
    rotateWorld(this.hips, new Vector3(0, 0, 1), sway * (idle ? 0.1 : 0.07));
    rotateWorld(this.hips, new Vector3(0, 1, 0), sway * (idle ? 0.16 : 0.1));
    // Lean: positive tilt tips the torso towards screen-left; the spine counters the hips.
    rotateWorld(this.spine, new Vector3(0, 0, 1), p.tilt * RAD - sway * (idle ? 0.1 : 0.06));
    // A nod on every beat, and the head tips with the sway while she waits.
    rotateWorld(this.neck, new Vector3(1, 0, 0), (1 - bounce) * (idle ? 0.16 : 0.12));
    if (idle) rotateWorld(this.neck, new Vector3(0, 0, 1), sway * 0.08);

    for (const s of ['L', 'R'] as const) {
      const sign = s === 'L' ? -1 : 1;
      const dirAt = (deg: number) => new Vector3(sign * Math.sin(deg * RAD), -Math.cos(deg * RAD), TOWARD_CAMERA + ACROSS_FORWARD * Math.max(0, -Math.sin(deg * RAD))).normalize();
      const { arm, fore, hand } = this.arms[s];
      pointBone(arm, fore, dirAt(p.dir[s] - p.bend[s] / 2));
      pointBone(fore, hand, dirAt(p.dir[s] + p.bend[s] / 2));
      this.turnPalm(s, -sign);
      this.relaxHand(s);
    }
    this.plantFeet();
  }

  /** Which way the palm faces (world, unit), from the knuckles; null on a rig without finger bones. */
  private palmNormal(s: Side, sign = this.hands[s].palmSign): Vector3 | null {
    const { index, middle, pinky } = this.hands[s];
    if (!index || !middle || !pinky) return null;
    const wrist = this.arms[s].hand.getWorldPosition(new Vector3());
    const along = middle.getWorldPosition(new Vector3()).sub(wrist);
    const across = index.getWorldPosition(new Vector3()).sub(pinky.getWorldPosition(new Vector3()));
    const n = along.cross(across);
    return n.lengthSq() > 1e-12 ? n.normalize().multiplyScalar(sign) : null;
  }

  /**
   * Turns the forearm about its own length so the palm faces the way a relaxed dancer's does.
   * Aiming the arm alone leaves this twist to chance, which is what made palms face backwards.
   * `inward` is +1 when the body's middle is towards +x from this arm.
   */
  private turnPalm(s: Side, inward: number): void {
    const { fore, hand } = this.arms[s];
    const n = this.palmNormal(s);
    if (!n) return;
    const axis = hand.getWorldPosition(new Vector3()).sub(fore.getWorldPosition(new Vector3())).normalize();
    // The more the forearm points across the body, the more the palm turns to face the chest instead.
    const across = Math.max(0, axis.x * inward);
    const want = new Vector3(inward * PALM_INWARD, -PALM_DOWN, PALM_FORWARD - PALM_TO_CHEST * across);
    // Only the turn about the forearm counts: take the forearm's own direction out of both.
    want.addScaledVector(axis, -want.dot(axis));
    n.addScaledVector(axis, -n.dot(axis));
    if (want.lengthSq() < 1e-6 || n.lengthSq() < 1e-6) return;
    const angle = Math.atan2(axis.dot(n.clone().cross(want)), n.dot(want));
    rotateWorld(fore, axis, angle);
  }

  /** A relaxed hand: the wrist bends a little and the fingers curl towards the palm. */
  private relaxHand(s: Side): void {
    const { hand } = this.arms[s];
    const rig = this.hands[s];
    const n = this.palmNormal(s);
    if (!n || !rig.middle) return;
    // Rotating about (bone direction × palm normal) moves the bone's end towards the palm.
    const towardsPalm = (joint: Bone, child: Object3D, angle: number) => {
      const r = child.getWorldPosition(new Vector3()).sub(joint.getWorldPosition(new Vector3()));
      const axis = r.cross(n);
      if (axis.lengthSq() < 1e-12) return;
      rotateWorld(joint, axis.normalize(), angle);
    };
    towardsPalm(hand, rig.middle, WRIST_BEND);
    rig.fingers.forEach((finger, f) => {
      const curl = f === 0 ? THUMB_CURL : FINGER_CURL;
      for (let j = 0; j + 1 < finger.length && j < curl.length; j++) towardsPalm(finger[j], finger[j + 1], curl[j]);
    });
  }

  /**
   * Moves her up or down so the lower foot stands exactly on the floor, whatever the knees and hips
   * did: bent legs lower her instead of lifting her feet, and she never floats or sinks.
   */
  private plantFeet(): void {
    this.model.updateMatrixWorld(true);
    let low = Infinity;
    for (const f of this.feet) low = Math.min(low, this.group.worldToLocal(f.getWorldPosition(tmpA)).y);
    if (!Number.isFinite(low)) return;
    this.model.position.y += this.footFloor - low;
    this.model.updateMatrixWorld(true);
  }

  /**
   * Performs the recorded dance at `seconds`: every bone as the dancer moved it. Her hips are turned to
   * face the camera, as scripts/extract-dance.mjs turns them when it measures the dance the player copies,
   * and she dances on her spot instead of wandering across the stage.
   */
  private performRecording(seconds: number): void {
    const mixer = this.mixer;
    if (!mixer) return;
    this.recorded = true;
    this.model.position.set(0, this.baseY, 0);
    mixer.setTime(seconds);
    this.model.updateMatrixWorld(true);
    const across = this.leftHip.getWorldPosition(tmpA).sub(this.rightHip.getWorldPosition(tmpB)).setY(0);
    // Screen-right (+x) is her own left side when she faces us.
    rotateWorld(this.hips, new Vector3(0, 1, 0), Math.atan2(across.z, across.x));
    const hips = this.group.worldToLocal(this.hips.getWorldPosition(tmpA));
    this.model.position.x -= hips.x - this.hipsHome.x;
    this.model.position.z -= hips.z - this.hipsHome.z;
    this.plantFeet();
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
