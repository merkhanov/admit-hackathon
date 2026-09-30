import { BackSide, BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshToonMaterial, SphereGeometry, Vector3, type BufferGeometry, type Texture } from 'three';
import { drawBend, type MoveTarget } from '../dance/moves.ts';
import type { Side } from '../pose/features.ts';
import { buildHat } from './hats.ts';
import type { Hat } from './themes.ts';

const OUTLINE = new MeshBasicMaterial({ color: 0xffffff, side: BackSide });
const RAD = Math.PI / 180;

interface Limb { shoulder: Group; elbow: Group }

/** Current coach pose in the same terms as a move target, eased towards the next move. */
export interface CoachPose {
  dir: Record<Side, number>;
  bend: Record<Side, number>;
  tilt: number;
  squat: number;
}

/** Anything that can show the coach: the cartoon one or the rigged human. */
export interface CoachView {
  readonly group: Group;
  update(target: MoveTarget | null, beatPhase: number, beatIndex: number, dt: number): void;
  setHat(hat: Hat): void;
}

/**
 * Eases the coach towards the move on screen, so it arrives on the beat instead of snapping.
 * Shared by both coaches, so each shows exactly the angles the judge scores.
 */
export class CoachMotion {
  readonly pose: CoachPose = { dir: { L: 15, R: 15 }, bend: { L: 20, R: 20 }, tilt: 0, squat: 0 };

  step(target: MoveTarget | null, beatIndex: number, dt: number): CoachPose {
    const k = Math.min(1, dt * 12);
    const p = this.pose;
    for (const s of ['L', 'R'] as const) {
      // Idle groove when no move is on screen.
      const dir = target ? target.arms[s].dir : 20 + Math.sin(beatIndex * 1.7 + (s === 'L' ? 0 : 2)) * 12;
      const bend = target ? drawBend(target.arms[s]) : 35;
      // Ease the angle the short way round, so an arm never swings through the body.
      let delta = dir - p.dir[s];
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      p.dir[s] += delta * k;
      p.bend[s] += (bend - p.bend[s]) * k;
    }
    p.tilt += ((target?.tilt ?? 0) - p.tilt) * k;
    p.squat += ((target?.squat ? 1 : 0) - p.squat) * k;
    return p;
  }
}

/**
 * The dancer the player copies. It faces the camera and is built by screen side:
 * the arm on screen-left is target arm "L", which the player mirrors with their own left arm.
 */
export class Coach implements CoachView {
  readonly group = new Group();
  private readonly hips = new Group();
  private readonly torso = new Group();
  private readonly arms: Record<Side, Limb>;
  private readonly legs: Record<Side, { hip: Group; knee: Group }>;
  private readonly motion = new CoachMotion();
  private readonly bun: Mesh;
  private hat: Group | null = null;

  constructor(ramp: Texture) {
    const mat = (color: number) => new MeshToonMaterial({ color, gradientMap: ramp });
    const top = mat(0xff3d9a), pants = mat(0x22d3ee), shoes = mat(0xffd21f), skin = mat(0xf2c28b), hair = mat(0x6b2bd9), glove = mat(0xffffff);
    const part = (geo: BufferGeometry, m: MeshToonMaterial, outline = 1.07) => {
      const mesh = new Mesh(geo, m);
      const rim = new Mesh(geo, OUTLINE);
      rim.scale.setScalar(outline);
      mesh.add(rim);
      return mesh;
    };

    // Legs: hip pivot, knee pivot.
    const leg = (x: number) => {
      const hip = new Group(), knee = new Group();
      const thigh = part(new BoxGeometry(0.24, 0.5, 0.26), pants);
      thigh.position.y = -0.25;
      const shin = part(new BoxGeometry(0.22, 0.48, 0.24), pants);
      shin.position.y = -0.24;
      const shoe = part(new BoxGeometry(0.28, 0.14, 0.4), shoes);
      shoe.position.set(0, -0.52, 0.06);
      knee.position.y = -0.5;
      knee.add(shin, shoe);
      hip.add(thigh, knee);
      hip.position.set(x, 0, 0);
      this.hips.add(hip);
      return { hip, knee };
    };
    this.legs = { L: leg(-0.17), R: leg(0.17) };

    const pelvis = part(new BoxGeometry(0.56, 0.22, 0.3), pants);
    this.hips.add(pelvis);
    const chest = part(new BoxGeometry(0.72, 0.78, 0.36), top);
    chest.position.y = 0.48;
    const neck = part(new SphereGeometry(0.1, 10, 8), skin);
    neck.position.y = 0.92;
    const head = part(new SphereGeometry(0.27, 18, 14), skin);
    head.position.y = 1.16;
    const hairCap = part(new SphereGeometry(0.29, 18, 10, 0, Math.PI * 2, 0, Math.PI / 1.9), hair);
    hairCap.position.set(0, 1.2, -0.02);
    const bun = part(new SphereGeometry(0.13, 12, 10), hair);
    bun.position.set(0, 1.48, -0.05);
    this.torso.add(chest, neck, head, hairCap, bun);
    this.bun = bun;

    const arm = (x: number): Limb => {
      const shoulder = new Group(), elbow = new Group();
      const upper = part(new BoxGeometry(0.17, 0.44, 0.18), top);
      upper.position.y = -0.22;
      const fore = part(new BoxGeometry(0.15, 0.4, 0.16), skin);
      fore.position.y = -0.2;
      const hand = part(new SphereGeometry(0.1, 10, 8), glove, 1.12);
      hand.position.y = -0.44;
      elbow.position.y = -0.44;
      elbow.add(fore, hand);
      shoulder.add(upper, elbow);
      shoulder.position.set(x, 0.8, 0);
      this.torso.add(shoulder);
      return { shoulder, elbow };
    };
    this.arms = { L: arm(-0.46), R: arm(0.46) };

    this.hips.add(this.torso);
    this.hips.position.y = 1.02;
    this.group.add(this.hips);
  }

  setHat(hat: Hat): void {
    if (this.hat) this.torso.remove(this.hat);
    this.hat = buildHat(hat);
    this.bun.visible = this.hat === null;
    if (!this.hat) return;
    this.hat.scale.multiplyScalar(0.29);
    this.hat.position.multiplyScalar(0.29).add(new Vector3(0, 1.4, 0));
    this.torso.add(this.hat);
  }

  /**
   * `target` is the move to show (null = idle groove), `beatPhase` 0..1 within the current beat.
   * The pose eases towards the target, so the coach arrives on the beat instead of snapping.
   */
  update(target: MoveTarget | null, beatPhase: number, beatIndex: number, dt: number): void {
    const p = this.motion.step(target, beatIndex, dt);
    for (const s of ['L', 'R'] as const) {
      const sign = s === 'L' ? -1 : 1; // screen-left arm swings out towards -x
      const upper = p.dir[s] - p.bend[s] / 2;
      this.arms[s].shoulder.rotation.z = sign * upper * RAD;
      this.arms[s].elbow.rotation.z = sign * p.bend[s] * RAD;
    }

    const bounce = Math.abs(Math.sin(Math.PI * beatPhase));
    this.torso.rotation.z = p.tilt * RAD + Math.sin(beatIndex * Math.PI) * 0.03;
    this.hips.position.y = 1.02 - p.squat * 0.38 - (1 - bounce) * 0.05;
    this.hips.position.x = Math.sin((beatIndex + beatPhase) * Math.PI) * 0.06;
    for (const s of ['L', 'R'] as const) {
      const sign = s === 'L' ? -1 : 1;
      this.legs[s].hip.rotation.x = -p.squat * 1.0;
      this.legs[s].hip.rotation.z = sign * (0.08 + p.squat * 0.35);
      this.legs[s].knee.rotation.x = p.squat * 1.7 + (1 - bounce) * 0.15;
    }
  }
}
