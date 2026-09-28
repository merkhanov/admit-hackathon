import { BoxGeometry, CircleGeometry, Group, Mesh, MeshBasicMaterial, MeshToonMaterial, SphereGeometry, type Texture } from 'three';

export interface RunnerPose {
  /** 0..1 progress through a jump, or null when on the ground. */
  jump: number | null;
  ducking: boolean;
  /** 0..1 remaining punch, 0 when not punching. */
  punch: number;
  /** Running cadence multiplier. */
  pace: number;
  running: boolean;
  blink: boolean;
}

const JUMP_HEIGHT = 1.9;

/** A low-poly cartoon runner seen from behind: backwards cap, hoodie, backpack. */
export class Runner {
  readonly group = new Group();
  readonly shadow: Mesh;
  private readonly body = new Group();
  private readonly legL = new Group();
  private readonly legR = new Group();
  private readonly armL = new Group();
  private readonly armR = new Group();
  private phase = 0;
  private crouch = 0;

  constructor(ramp: Texture) {
    const mat = (color: number) => new MeshToonMaterial({ color, gradientMap: ramp });
    const skin = mat(0xf2c28b), hoodie = mat(0xff7a1a), jeans = mat(0x2f4f9e), shoe = mat(0xffffff), cap = mat(0xe63946), pack = mat(0x2bb673);
    const box = (w: number, h: number, d: number, m: MeshToonMaterial) => new Mesh(new BoxGeometry(w, h, d), m);

    // Legs pivot at the hip.
    for (const [leg, x] of [[this.legL, -0.17], [this.legR, 0.17]] as const) {
      const thigh = box(0.24, 0.82, 0.26, jeans);
      thigh.position.y = -0.41;
      const sneaker = box(0.28, 0.16, 0.42, shoe);
      sneaker.position.set(0, -0.84, -0.06);
      leg.add(thigh, sneaker);
      leg.position.set(x, 0.92, 0);
      this.body.add(leg);
    }
    const torso = box(0.66, 0.72, 0.38, hoodie);
    torso.position.y = 1.3;
    const backpack = box(0.5, 0.52, 0.22, pack);
    backpack.position.set(0, 1.34, 0.28);
    const head = new Mesh(new SphereGeometry(0.27, 16, 12), skin);
    head.position.y = 1.9;
    const capTop = new Mesh(new SphereGeometry(0.29, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), cap);
    capTop.position.y = 1.95;
    const brim = box(0.34, 0.05, 0.3, cap);
    brim.position.set(0, 1.97, 0.3); // worn backwards, towards the camera
    this.body.add(torso, backpack, head, capTop, brim);

    // Arms pivot at the shoulder.
    for (const [arm, x] of [[this.armL, -0.43], [this.armR, 0.43]] as const) {
      const sleeve = box(0.18, 0.62, 0.2, hoodie);
      sleeve.position.y = -0.31;
      const hand = new Mesh(new SphereGeometry(0.11, 10, 8), skin);
      hand.position.y = -0.66;
      arm.add(sleeve, hand);
      arm.position.set(x, 1.6, 0);
      this.body.add(arm);
    }
    this.group.add(this.body);

    this.shadow = new Mesh(new CircleGeometry(0.55, 24), new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.03;
  }

  update(p: RunnerPose, dt: number): void {
    this.phase += dt * (p.running ? 9 + p.pace * 6 : 2);
    this.crouch += ((p.ducking ? 1 : 0) - this.crouch) * Math.min(1, dt * 18);
    const swing = p.running ? Math.sin(this.phase) : 0;

    const lift = p.jump === null ? 0 : Math.sin(Math.PI * p.jump) * JUMP_HEIGHT;
    this.body.position.y = lift - this.crouch * 0.55 + (p.running && p.jump === null ? Math.abs(Math.cos(this.phase)) * 0.08 : 0);
    this.body.rotation.x = -this.crouch * 0.5;

    if (p.jump !== null) {
      // Positive x rotation swings a limb forward, away from the camera.
      this.legL.rotation.x = 0.9;
      this.legR.rotation.x = 0.3;
      this.armL.rotation.set(0, 0, -2.6);
      this.armR.rotation.set(0, 0, 2.6);
    } else {
      const bend = this.crouch * 1.3;
      this.legL.rotation.x = swing * 0.9 + bend;
      this.legR.rotation.x = -swing * 0.9 + bend;
      this.armL.rotation.set(-swing * 0.8, 0, -0.12);
      this.armR.rotation.set(swing * 0.8, 0, 0.12);
    }
    if (p.punch > 0) {
      // Straight arm forward, into the crate.
      this.armR.rotation.set(Math.PI / 2, 0, 0.1);
      this.body.rotation.y = -0.25 * p.punch;
    } else {
      this.body.rotation.y = 0;
    }

    this.group.visible = !p.blink;
    const s = 1 - Math.min(0.6, lift / (JUMP_HEIGHT * 1.6));
    this.shadow.scale.setScalar(s);
    this.shadow.position.x = this.group.position.x;
  }
}
