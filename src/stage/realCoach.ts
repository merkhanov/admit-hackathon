import { AnimationMixer, Bone, Box3, CanvasTexture, Group, Mesh, MeshStandardMaterial, Quaternion, SkinnedMesh, Vector3, type AnimationClip, type Object3D, type Texture } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import type { MoveTarget } from '../dance/moves.ts';
import type { Side } from '../pose/features.ts';
import { CoachMotion, type CoachView } from './coach.ts';
import { buildHat } from './hats.ts';
import { recolor, type Look } from './outfits.ts';
import { adoptVrmSkeleton } from './vrm.ts';
import { hiddenByTorso, measureTorso, type BodyPoint, type TorsoProfile } from './torso.ts';
import type { Hat } from './themes.ts';
import { TWIST_MAX, TWIST_SHARE, clampTurn, continuousTurn, hingeWeight } from './twist.ts';

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

interface Chain { arm: Bone; fore: Bone; hand: Bone; collar: Bone | null }

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

/**
 * How far each finger joint curls towards the palm in a relaxed hand, base to tip (radians). Kept small:
 * the dance turns the palm to face the camera, and fingers curled towards the viewer read as a clawed,
 * broken hand. About 20° per finger in all, so the hand looks open and soft, not flat.
 */
const FINGER_CURL = [0.08, 0.14, 0.1];
const THUMB_CURL = [0.04, 0.06, 0.04];
/** The wrist bends a touch towards the palm, as a hand does when it isn't holding anything. */
const WRIST_BEND = 0.06;
/**
 * A hand reaching across the body (to the other shoulder, onto the head) bends at the wrist to rest on it,
 * fingers down, instead of sticking out past the shoulder: this times how far across the forearm points.
 */
const WRIST_REST = 1.6;
/**
 * Where a relaxed palm faces, before the forearm's own direction is taken out: towards the body's middle
 * (palms to the thighs when the arms hang, to the head when they're up), else down (arms out to the
 * sides), and a little forward.
 */
const PALM_INWARD = 1, PALM_DOWN = 0.6, PALM_FORWARD = 0.35;
/**
 * Fastest an arm turns about its length (radians a second), at the shoulder for the elbow's hinge and
 * along the forearm for the palm: quick, but never a jump between two frames.
 */
const TURN_RATE = 720 * RAD;
/** How an arm is turned about its length: the upper arm for the elbow's hinge, and the palm (radians). */
interface Turns { hinge: number | null; palm: number | null }
const NO_TURNS: Turns = { hinge: null, palm: null };
/** `goal`, or as far towards it from `prev` as `step` allows. */
const follow = (prev: number | null, goal: number, step: number): number => (prev === null ? goal : prev + clampTurn(goal - prev, step));
/** A forearm reaching across the body (arms crossed, hand to the other shoulder) lays its palm on the chest. */
const PALM_TO_CHEST = 2.5;
/** The body's cross-section at one height: a rounded rectangle around (cx, cz), half-width hw, half-depth hd. */
interface Slice { cx: number; cz: number; hw: number; hd: number }
/** The body measured from the mesh at rest, relative to the hips: slices from y0 up, and the head. */
interface BodyProfile { y0: number; step: number; slices: (Slice | null)[]; headCentre: Vector3; headR: number }
/** Height of one slice of the body profile, in scene units (the coach is 2.25 tall). */
const SLICE = 0.04;

/** Each try aims a segment that would go into the body this much further towards the camera. */
const CLEAR_STEPS = [0, 0.25, 0.5, 0.8, 1.2, 1.7, 2.4];
/** Degrees the whole arm swings, up or down, to take a hand off the face. */
const LIFT_STEPS = [0, 12, 24, 36, 48];
/** Raising an arm above the shoulder lifts the collarbone up to this much (radians), as a real shoulder does. */
const SHRUG = 0.32;

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
  /**
   * The way each elbow bends, in its upper arm's frame: forward at rest, as an arm held out to the side
   * with the palm down folds its hand towards the front.
   */
  private readonly flex: Record<Side, Vector3>;
  /** How each arm was turned last frame, so it carries on from there instead of jumping or flipping. */
  private readonly turned: Record<Side, Turns> = { L: NO_TURNS, R: NO_TURNS };
  /** The body the arms must stay out of, measured from the mesh; null if the model has no skinned mesh. */
  private readonly body: BodyProfile | null;
  /**
   * The torso as the camera sees it, in the chest bone's frame: for each height, its width and how far
   * forward its front reaches. Catches an arm that slips behind a wide body (a skirt, a jacket), which
   * the solid body above doesn't, since the arm isn't inside it.
   */
  private readonly front: TorsoProfile | null;
  private readonly chest: Bone;
  private readonly chestAxes: { side: Vector3; up: Vector3; fwd: Vector3 };
  private readonly frontMargin: number;
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
      gltf = new GLTFLoader().loadAsync(url).then(async (g) => {
        await adoptVrmSkeleton(g);
        return { scene: g.scene, animations: g.animations };
      });
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
      collar: tryBone(model, `${side}Shoulder`),
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
      const collar = this.arms[s].collar;
      if (collar) this.rest.set(collar, collar.quaternion.clone());
      for (const f of this.hands[s].fingers) for (const b of f) this.rest.set(b, b.quaternion.clone());
    }
    // In the model's rest pose (arms out, a T-pose) palms face down: that fixes which way "palm" is.
    model.updateMatrixWorld(true);
    for (const s of ['L', 'R'] as const) {
      const n = this.palmNormal(s, 1);
      if (n && n.y > 0) this.hands[s].palmSign = -1;
    }
    const flex = (s: Side): Vector3 => {
      const { arm, fore } = this.arms[s];
      const along = fore.getWorldPosition(new Vector3()).sub(arm.getWorldPosition(new Vector3())).normalize();
      const forward = new Vector3(0, 0, 1).addScaledVector(along, -along.z).normalize();
      return forward.applyQuaternion(arm.getWorldQuaternion(new Quaternion()).invert());
    };
    this.flex = { L: flex('L'), R: flex('R') };
    this.leftHip = findBone(model, 'LeftUpLeg');
    this.rightHip = findBone(model, 'RightUpLeg');
    model.traverse((o) => { if (o instanceof Bone) this.bind.set(o, { q: o.quaternion.clone(), p: o.position.clone() }); });
    model.updateMatrixWorld(true);
    this.hipsHome = this.group.worldToLocal(this.hips.getWorldPosition(new Vector3()));
    this.feet = ['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'].map((n) => tryBone(model, n)).filter((b): b is Bone => b !== null);
    this.footFloor = Math.min(...this.feet.map((f) => this.group.worldToLocal(f.getWorldPosition(new Vector3())).y));
    this.body = measureBody(model, this.hips, this.head);
    this.chest = tryBone(model, 'Spine2') ?? tryBone(model, 'Spine1') ?? this.spine;
    model.updateMatrixWorld(true);
    const origin = this.chest.worldToLocal(new Vector3());
    const axis = (v: Vector3) => this.chest.worldToLocal(v).sub(origin).normalize();
    this.chestAxes = { side: axis(new Vector3(1, 0, 0)), up: axis(new Vector3(0, 1, 0)), fwd: axis(new Vector3(0, 0, 1)) };
    this.front = measureFront(model, (w) => this.bodyPoint(w));
    this.frontMargin = this.arms.L.arm.getWorldPosition(new Vector3()).distanceTo(this.arms.R.arm.getWorldPosition(new Vector3())) * 0.08;
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
      const dirAt = (deg: number, forward = 0) => new Vector3(sign * Math.sin(deg * RAD), -Math.cos(deg * RAD), TOWARD_CAMERA + forward + ACROSS_FORWARD * Math.max(0, -Math.sin(deg * RAD))).normalize();
      const { arm, fore, collar } = this.arms[s];
      // An arm raised above the shoulder lifts the collarbone with it (the outer end goes up).
      const raise = Math.max(0, Math.min(1, (Math.abs(p.dir[s]) - 90) / 90));
      if (collar && raise > 0) rotateWorld(collar, new Vector3(0, 0, 1), sign * SHRUG * raise);
      // Aim the upper arm, then the forearm and hand; whatever would go into the body is aimed further
      // towards the camera until the elbow, forearm, palm and fingertips are all clear of it. A hand that
      // would still cover the face (a big-headed character's arms are short for the pose) swings the
      // whole arm up over the head or down to the chest, whichever is nearer, until the face shows.
      let swing = 0;
      let turns = this.turned[s];
      for (const lift of LIFT_STEPS) {
        const at = (deg: number, f: number) => dirAt(deg + swing * lift * Math.sign(deg || 1), f);
        // Aim from rest, not from the last try's turned arm: the turns below are measured from there.
        arm.quaternion.copy(this.rest.get(arm) ?? arm.quaternion);
        for (const f of CLEAR_STEPS) {
          pointBone(arm, fore, at(p.dir[s] - p.bend[s] / 2, f));
          const shoulder = arm.getWorldPosition(new Vector3()), elbow = fore.getWorldPosition(new Vector3());
          const upper = [0.4, 0.55, 0.7, 0.85, 1].map((t) => shoulder.clone().lerp(elbow, t));
          if (!this.anyInside(upper) && !this.behindFront(upper)) break;
        }
        // Turning the upper arm about its length leaves the elbow where it is, so it's done per try below.
        const upperAim = arm.quaternion.clone();
        for (const f of CLEAR_STEPS) {
          this.restHand(s);
          turns = this.aimForearm(s, upperAim, at(p.dir[s] + p.bend[s] / 2, f), -sign, this.turned[s], dt);
          this.relaxHand(s, -sign);
          const probes = this.handProbes(s);
          if (!this.anyInside(probes) && !this.behindFront(probes.slice(0, 3))) break;
        }
        if (!this.overFace(this.handProbes(s).slice(2))) break;
        // Hands meant above the head go up over it; a low elbow (arms crossed) goes down to the chest.
        // Anything else covers the face on purpose (the dab hides it in the elbow).
        if (swing === 0) {
          swing = Math.abs(p.dir[s]) >= 120 ? 1 : fore.getWorldPosition(new Vector3()).y < arm.getWorldPosition(new Vector3()).y ? -1 : 0;
          if (swing === 0) break;
        }
      }
      this.turned[s] = turns;
    }
    this.plantFeet();
  }

  /** Puts the hand and fingers back to rest, to pose them again. */
  private restHand(s: Side): void {
    const { hand } = this.arms[s];
    const q = this.rest.get(hand);
    if (q) hand.quaternion.copy(q);
    for (const f of this.hands[s].fingers) for (const b of f) { const r = this.rest.get(b); if (r) b.quaternion.copy(r); }
    hand.updateWorldMatrix(false, true);
  }

  /** Points along the forearm, the wrist, the knuckles and every fingertip: what must stay out of the body. */
  private handProbes(s: Side): Vector3[] {
    const { fore, hand } = this.arms[s];
    const e = fore.getWorldPosition(new Vector3()), w = hand.getWorldPosition(new Vector3());
    const out = [e.clone().lerp(w, 0.4), e.clone().lerp(w, 0.75), w];
    for (const f of this.hands[s].fingers) out.push(f[f.length - 1].getWorldPosition(new Vector3()), f[Math.min(1, f.length - 1)].getWorldPosition(new Vector3()));
    return out;
  }

  /** A world point in the chest's frame: side, up, forward. */
  private bodyPoint(world: Vector3): BodyPoint {
    const local = this.chest.worldToLocal(world.clone());
    const a = this.chestAxes;
    return { side: local.dot(a.side), up: local.dot(a.up), fwd: local.dot(a.fwd) };
  }

  /** Would the camera see any of these points behind the torso? */
  private behindFront(points: Vector3[]): boolean {
    const front = this.front;
    if (!front) return false;
    return points.some((p) => hiddenByTorso(this.bodyPoint(p), front, this.frontMargin));
  }

  /**
   * Does any of these hand points cover the face, as the camera sees it?
   */
  private overFace(points: Vector3[]): boolean {
    const body = this.body;
    if (!body) return false;
    const head = this.head.localToWorld(body.headCentre.clone());
    const r = body.headR;
    for (const p of points) {
      const up = p.y - head.y;
      if (Math.abs(p.x - head.x) < r * 0.8 && up > -r * 1.1 && up < r * 0.5 && p.z > head.z) return true;
    }
    return false;
  }

  /** Is any point inside the body (torso, hips, thighs or head), as measured from the mesh at load? */
  private anyInside(points: Vector3[]): boolean {
    const body = this.body;
    if (!body) return false;
    const hips = this.hips.getWorldPosition(new Vector3());
    const head = this.head.localToWorld(body.headCentre.clone());
    for (const p of points) {
      if (p.distanceTo(head) < body.headR) return true;
      const i = Math.floor((p.y - hips.y - body.y0) / body.step);
      const sl = body.slices[i];
      if (!sl) continue;
      const x = p.x - hips.x, z = p.z - hips.z;
      // A rounded rectangle: the hips and two trouser legs side by side are boxier than an ellipse.
      if (((x - sl.cx) / sl.hw) ** 4 + ((z - sl.cz) / sl.hd) ** 4 < 1) return true;
    }
    return false;
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
   * Points the forearm along `dir` and turns the palm the way a relaxed dancer's faces, as a real arm
   * would: the elbow only bends one way, and the palm's turn is shared between the shoulder, the forearm
   * and the wrist. Turning the forearm alone (as much as 180° for arms up) pinched the elbow to nothing.
   * `upperAim` is the upper arm as aimed, before any turn; `inward` is +1 when the body's middle is
   * towards +x from this arm; `last` is how the arm was turned last frame, `dt` the time since.
   * Returns how it's turned now.
   */
  private aimForearm(s: Side, upperAim: Quaternion, dir: Vector3, inward: number, last: Turns, dt: number): Turns {
    const { arm, fore, hand } = this.arms[s];
    arm.quaternion.copy(upperAim);
    fore.quaternion.copy(this.rest.get(fore) ?? fore.quaternion);
    arm.updateWorldMatrix(false, true);
    const shoulder = arm.getWorldPosition(new Vector3());
    const upper = fore.getWorldPosition(new Vector3()).sub(shoulder).normalize();
    // The elbow is a hinge: it never bends backwards, and the upper arm turns in its socket until the
    // elbow's crease faces the way the forearm bends. Then aiming the forearm only bends the elbow.
    // A forearm left leaning back from the upper arm (the upper arm went forward to clear the body)
    // comes forward to straight, instead of the elbow snapping back or the shoulder turning half round.
    const crease = this.flex[s].clone().applyQuaternion(arm.getWorldQuaternion(new Quaternion()));
    crease.addScaledVector(upper, -crease.dot(upper)).normalize();
    dir = dir.clone().addScaledVector(crease, -Math.min(0, dir.dot(crease))).normalize();
    const bend = dir.clone().addScaledVector(upper, -dir.dot(upper));
    const hinge = hingeWeight(bend.length());
    // An elbow that goes from bending up to bending down turns the upper arm half round: at a pace.
    const byHinge = follow(last.hinge, hinge * (angleAbout(upper, crease, bend) ?? 0), TURN_RATE * dt);
    rotateWorld(arm, upper, byHinge);
    pointBone(fore, hand, dir);

    const want = this.palmTurnAngle(s, inward);
    if (want === null) return { hinge: byHinge, palm: null };
    // The palm turns towards where it should face at a wrist's pace, never in a jump between two frames.
    const goal = continuousTurn(want, last.palm);
    const total = follow(last.palm, goal, TURN_RATE * dt);
    // A straight arm turns its palm mostly from the shoulder, as a person's does; a bent one can't
    // without moving the hand, so its forearm and wrist do it all.
    const byUpper = clampTurn(byHinge + total * TWIST_SHARE.upper * (1 - hinge), TWIST_MAX.upper) - byHinge;
    if (byUpper !== 0) {
      rotateWorld(arm, upper, byUpper);
      pointBone(fore, hand, dir);
    }
    // What's left once the upper arm has turned, short of the turn the palm hasn't caught up on yet.
    const left = continuousTurn(this.palmTurnAngle(s, inward) ?? 0, goal - byUpper) - (goal - total);
    const byFore = clampTurn(left * TWIST_SHARE.fore, TWIST_MAX.fore);
    const byHand = clampTurn(left - byFore, TWIST_MAX.hand);
    const axis = dir.clone().normalize();
    rotateWorld(fore, axis, byFore);
    rotateWorld(hand, axis, byHand);
    return { hinge: byHinge, palm: total };
  }

  /** How far (radians, about the forearm) the palm is from facing the way a relaxed dancer's does. */
  private palmTurnAngle(s: Side, inward: number): number | null {
    const { fore, hand } = this.arms[s];
    const n = this.palmNormal(s);
    if (!n) return null;
    const axis = hand.getWorldPosition(new Vector3()).sub(fore.getWorldPosition(new Vector3())).normalize();
    // The more the forearm points across the body, the more the palm turns to face the chest instead.
    const across = Math.max(0, axis.x * inward);
    const want = new Vector3(inward * PALM_INWARD, -PALM_DOWN, PALM_FORWARD - PALM_TO_CHEST * across);
    return angleAbout(axis, n, want);
  }

  /** A relaxed hand: the wrist bends a little and the fingers curl towards the palm. */
  private relaxHand(s: Side, inward: number): void {
    const { fore, hand } = this.arms[s];
    const axis = hand.getWorldPosition(new Vector3()).sub(fore.getWorldPosition(new Vector3())).normalize();
    const across = Math.max(0, axis.x * inward);
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
    // A hand on the other shoulder (the forearm goes up and across, the hand stays below the head)
    // rests on it: the fingers turn to point down instead of sticking out past the shoulder.
    const belowHead = hand.getWorldPosition(new Vector3()).y < this.neck.getWorldPosition(new Vector3()).y;
    const onShoulder = belowHead && axis.y > 0.2 ? across : 0;
    if (onShoulder > 0.05) {
      const fingers = rig.middle.getWorldPosition(new Vector3()).sub(hand.getWorldPosition(new Vector3())).normalize();
      const down = new Vector3(0, -1, 0);
      const axis = fingers.clone().cross(down);
      const angle = Math.acos(Math.max(-1, Math.min(1, fingers.dot(down))));
      if (axis.lengthSq() > 1e-8) rotateWorld(hand, axis.normalize(), angle * Math.min(1, onShoulder * WRIST_REST));
    }
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

/**
 * Measures the body at rest from the skinned mesh itself: for every slice of height from the thighs to
 * the neck, the ellipse that holds the torso, hips and thighs (baggy trousers included), and the head as
 * a ball. Vertices belong to the part whose bone moves them most.
 */
/** The torso's front profile (hips and spine skin) as seen from the camera, for behindFront. */
function measureFront(model: Object3D, toBody: (world: Vector3) => BodyPoint): TorsoProfile | null {
  const points: BodyPoint[] = [];
  const v = new Vector3();
  model.traverse((o) => {
    if (!(o instanceof SkinnedMesh)) return;
    const names = o.skeleton.bones.map((b) => b.name.replace(/^.*mixamorig/, ''));
    const si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight;
    if (!si || !sw) return;
    for (let i = 0; i < si.count; i += 2) {
      let best = 0, w = 0;
      for (let k = 0; k < 4; k++) if (sw.getComponent(i, k) > w) { w = sw.getComponent(i, k); best = si.getComponent(i, k); }
      if (w < 0.5 || !/^(Hips|Spine\d?)$/.test(names[best] ?? '')) continue;
      o.getVertexPosition(i, v);
      points.push(toBody(o.localToWorld(v)));
    }
  });
  return points.length > 50 ? measureTorso(points) : null;
}

function measureBody(model: Object3D, hipsBone: Bone, headBone: Bone): BodyProfile | null {
  model.updateMatrixWorld(true);
  const hips = hipsBone.getWorldPosition(new Vector3());
  const trunk: Vector3[] = [], head: Vector3[] = [];
  const v = new Vector3();
  model.traverse((o) => {
    if (!(o instanceof SkinnedMesh)) return;
    const names = o.skeleton.bones.map((b) => b.name.replace(/^.*mixamorig/, ''));
    const si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight, pos = o.geometry.attributes.position;
    if (!si || !sw || !pos) return;
    for (let i = 0; i < pos.count; i++) {
      let best = 0, w = -1;
      for (let k = 0; k < 4; k++) if (sw.getComponent(i, k) > w) { w = sw.getComponent(i, k); best = si.getComponent(i, k); }
      const n = names[best] ?? '';
      const isTrunk = /^(Hips|Spine\d?|Neck|LeftUpLeg|RightUpLeg)$/.test(n);
      const isHead = /^Head$/.test(n);
      if (!isTrunk && !isHead) continue;
      o.getVertexPosition(i, v);
      o.localToWorld(v);
      (isTrunk ? trunk : head).push(v.clone().sub(hips));
    }
  });
  if (trunk.length === 0) return null;
  const y0 = Math.min(...trunk.map((p) => p.y));
  const y1 = Math.max(...trunk.map((p) => p.y));
  const slices: (Slice | null)[] = [];
  for (let y = y0; y < y1; y += SLICE) {
    // Each slice looks a little above and below too: long smooth parts (trouser legs) have few vertices.
    const inSlice = trunk.filter((p) => p.y >= y - SLICE / 2 && p.y < y + SLICE * 1.5);
    if (inSlice.length < 6) { slices.push(null); continue; }
    const xs = inSlice.map((p) => p.x), zs = inSlice.map((p) => p.z);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    slices.push({ cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, hw: ((maxX - minX) / 2) * 1.04, hd: ((maxZ - minZ) / 2) * 1.04 });
  }
  // A slice still empty takes the larger of its neighbours, so there are no gaps to slip through.
  for (let i = 0; i < slices.length; i++) {
    if (slices[i]) continue;
    const near = [slices[i - 1], slices[i + 1]].filter((s): s is Slice => !!s);
    if (near.length) slices[i] = near.reduce((a, b) => (a.hw * a.hd > b.hw * b.hd ? a : b));
  }
  // The head: the face and skull, not the big hair buns (the median distance, not the farthest).
  const c = head.reduce((a, p) => a.add(p), new Vector3()).multiplyScalar(1 / Math.max(1, head.length));
  const d = head.map((p) => p.distanceTo(c)).sort((a, b) => a - b);
  const headR = d.length ? d[Math.floor(d.length * 0.6)] : 0;
  const headCentre = headBone.worldToLocal(c.add(hips));
  return { y0, step: SLICE, slices, headCentre, headR };
}

const tmpA = new Vector3(), tmpB = new Vector3(), qWorld = new Quaternion(), qParent = new Quaternion(), qDelta = new Quaternion();

/** The signed angle about unit `axis` that turns `from` onto `to`, both seen end-on; null if either lies along it. */
function angleAbout(axis: Vector3, from: Vector3, to: Vector3): number | null {
  const a = from.clone().addScaledVector(axis, -from.dot(axis));
  const b = to.clone().addScaledVector(axis, -to.dot(axis));
  if (a.lengthSq() < 1e-6 || b.lengthSq() < 1e-6) return null;
  return Math.atan2(axis.dot(a.clone().cross(b)), a.dot(b));
}

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
