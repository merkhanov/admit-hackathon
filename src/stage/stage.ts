import {
  ACESFilmicToneMapping, AdditiveBlending, BoxGeometry, Color, ConeGeometry, DirectionalLight, DoubleSide, HemisphereLight,
  InstancedMesh, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PCFShadowMap, PerspectiveCamera, PlaneGeometry,
  PMREMGenerator, PointLight, Scene, Vector3, WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { Rating } from '../dance/dance.ts';
import type { MoveTarget } from '../dance/moves.ts';
import { Coach, type CoachView } from './coach.ts';
import { RealCoach } from './realCoach.ts';
import { backdrop, beam, floorTile, toonRamp } from './textures.ts';
import { paletteFor } from './vfx.ts';

const FLOOR_COLS = 11, FLOOR_ROWS = 6, TILE = 1.1;
const FLOOR_PALETTE = [0xff2fb3, 0x22d3ee, 0xffd21f, 0x8a5cff, 0x3ccf4e];
const MAX_CONFETTI = 260;

interface Confetti { pos: Vector3; vel: Vector3; spin: Vector3; life: number; color: Color }

export interface StageFrame {
  /** Move the coach shows, or null for the idle groove. */
  target: MoveTarget | null;
  /** Beat position in the song; fractional part is the phase within the beat. */
  beat: number;
  /** Lights and floor react to the music only while it plays. */
  playing: boolean;
}

/** What main.ts needs from a stage, so the 3D stage and the 2D fallback are interchangeable. */
export interface StageView {
  resize(): void;
  react(rating: Rating, paletteKey?: string): void;
  draw(frame: StageFrame, dt: number): void;
}

/** A neon dance stage with the coach. Visual only: no game rules here. */
export class Stage implements StageView {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(38, 1, 0.1, 100);
  private coach: CoachView;
  private readonly floor: InstancedMesh;
  private readonly beams: Mesh[] = [];
  private readonly confetti: Confetti[] = [];
  private readonly confettiMesh: InstancedMesh;
  private readonly dummy = new Object3D();
  private readonly color = new Color();
  private lastBeat = -1;
  private shake = 0;

  constructor(canvas: HTMLCanvasElement) {
    // Throws without WebGL; main.ts shows the flat fallback coach instead.
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    // Film-like tone mapping and soft shadows for the dancer; the neon parts opt out of tone mapping.
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.scene.background = new Color(0x1a0f5c);
    const pmrem = new PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;

    const ramp = toonRamp();
    this.scene.add(new HemisphereLight(0xffe6ff, 0x3a2a80, 0.9));
    const key = new DirectionalLight(0xffffff, 2.2);
    key.position.set(2.5, 6, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -3; key.shadow.camera.right = 3;
    key.shadow.camera.top = 4; key.shadow.camera.bottom = -1;
    key.shadow.camera.near = 1; key.shadow.camera.far = 16;
    key.shadow.bias = -0.0005;
    key.shadow.radius = 4;
    this.scene.add(key);
    // Coloured rim lights from behind, like stage lamps.
    for (const [x, color] of [[-2.5, 0xff2fb3], [2.5, 0x22d3ee]] as const) {
      const rim = new PointLight(color, 18, 9, 1.6);
      rim.position.set(x, 3.2, -1.6);
      this.scene.add(rim);
    }

    const wall = new Mesh(new PlaneGeometry(26, 14), new MeshBasicMaterial({ map: backdrop(), toneMapped: false }));
    wall.position.set(0, 5, -5);
    this.scene.add(wall);

    const tile = floorTile();
    this.floor = new InstancedMesh(
      new BoxGeometry(TILE * 0.96, 0.1, TILE * 0.96),
      new MeshStandardMaterial({ map: tile, roughness: 0.3, metalness: 0.15, toneMapped: false }),
      FLOOR_COLS * FLOOR_ROWS,
    );
    this.floor.receiveShadow = true;
    let i = 0;
    for (let r = 0; r < FLOOR_ROWS; r++) {
      for (let c = 0; c < FLOOR_COLS; c++) {
        this.dummy.position.set((c - (FLOOR_COLS - 1) / 2) * TILE, -0.05, 1.5 - r * TILE);
        this.dummy.updateMatrix();
        this.floor.setMatrixAt(i, this.dummy.matrix);
        this.floor.setColorAt(i, this.color.set(FLOOR_PALETTE[(r + c) % FLOOR_PALETTE.length]));
        i++;
      }
    }
    this.scene.add(this.floor);

    const beamTex = beam();
    const beamGeo = new ConeGeometry(1.1, 9, 24, 1, true);
    beamGeo.translate(0, -4.5, 0);
    for (let b = 0; b < 4; b++) {
      const m = new Mesh(beamGeo, new MeshBasicMaterial({
        map: beamTex, color: FLOOR_PALETTE[b], transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false, toneMapped: false,
      }));
      m.position.set((b - 1.5) * 3.2, 8, -3);
      this.beams.push(m);
      this.scene.add(m);
    }

    // The cartoon coach dances until the rigged human arrives, and stays if the model can't load.
    this.coach = new Coach(ramp);
    this.coach.group.traverse((o) => { if (o instanceof Mesh) o.castShadow = true; });
    this.scene.add(this.coach.group);
    RealCoach.load(`${import.meta.env.BASE_URL}models/michelle.glb`).then(
      (real) => {
        this.scene.remove(this.coach.group);
        this.coach = real;
        this.scene.add(real.group);
      },
      (err: unknown) => console.warn('Dancer model unavailable, keeping the cartoon coach', err),
    );

    this.confettiMesh = new InstancedMesh(new PlaneGeometry(0.09, 0.14), new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide, toneMapped: false }), MAX_CONFETTI);
    this.confettiMesh.count = 0;
    this.confettiMesh.frustumCulled = false;
    this.scene.add(this.confettiMesh);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.8 ? 58 : 38;
    this.camera.updateProjectionMatrix();
  }

  /** Celebrates good moves with confetti and shakes a little on a miss. */
  react(rating: Rating, paletteKey?: string): void {
    const palette = paletteFor(paletteKey ?? 'steps');
    if (rating === 'perfect') this.burst(46, [palette.primary, palette.secondary, palette.accent]);
    else if (rating === 'good') this.burst(18, [palette.primary, palette.secondary]);
    else if (rating === 'miss') this.shake = 0.08;
  }

  draw(frame: StageFrame, dt: number): void {
    const beatIndex = Math.floor(frame.beat);
    const phase = frame.beat - beatIndex;
    this.coach.update(frame.target, frame.playing ? phase : (performance.now() / 600) % 1, frame.playing ? beatIndex : Math.floor(performance.now() / 600), dt);

    if (frame.playing && beatIndex !== this.lastBeat) {
      this.lastBeat = beatIndex;
      // Shift the floor colours one step on every beat.
      for (let i = 0; i < FLOOR_COLS * FLOOR_ROWS; i++) {
        const r = Math.floor(i / FLOOR_COLS), c = i % FLOOR_COLS;
        this.floor.setColorAt(i, this.color.set(FLOOR_PALETTE[(r + c + beatIndex) % FLOOR_PALETTE.length]));
      }
      if (this.floor.instanceColor) this.floor.instanceColor.needsUpdate = true;
    }
    const pulse = frame.playing ? 1 - phase : 0.4;
    const t = performance.now() / 1000;
    this.beams.forEach((b, i) => {
      b.rotation.z = Math.sin(t * 0.8 + i * 1.3) * 0.45;
      const m = b.material;
      if (m instanceof MeshBasicMaterial) m.opacity = 0.18 + pulse * 0.25;
    });

    this.shake = Math.max(0, this.shake - dt * 0.4);
    const j = () => (Math.random() - 0.5) * this.shake;
    this.camera.position.set(j(), 1.5 + j(), 6.1);
    this.camera.lookAt(0, 1.2, 0);

    this.stepConfetti(dt);
    this.renderer.render(this.scene, this.camera);
  }

  private burst(count: number, colors: string[]): void {
    for (let i = 0; i < count && this.confetti.length < MAX_CONFETTI; i++) {
      this.confetti.push({
        pos: new Vector3((Math.random() - 0.5) * 1.2, 2.4 + Math.random() * 0.6, 0.4),
        vel: new Vector3((Math.random() - 0.5) * 6, 2 + Math.random() * 4, (Math.random() - 0.2) * 3),
        spin: new Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8),
        life: 0,
        color: new Color(colors[Math.floor(Math.random() * colors.length)]),
      });
    }
  }

  private stepConfetti(dt: number): void {
    let n = 0;
    for (let i = this.confetti.length - 1; i >= 0; i--) {
      const c = this.confetti[i];
      c.life += dt;
      if (c.life > 2.2) { this.confetti.splice(i, 1); continue; }
      c.vel.y -= 5 * dt;
      c.vel.multiplyScalar(1 - dt * 1.2);
      c.pos.addScaledVector(c.vel, dt);
      this.dummy.position.copy(c.pos);
      this.dummy.rotation.set(c.spin.x * c.life, c.spin.y * c.life, c.spin.z * c.life);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.confettiMesh.setMatrixAt(n, this.dummy.matrix);
      this.confettiMesh.setColorAt(n, c.color);
      n++;
    }
    this.confettiMesh.count = n;
    this.confettiMesh.instanceMatrix.needsUpdate = true;
    if (this.confettiMesh.instanceColor) this.confettiMesh.instanceColor.needsUpdate = true;
  }
}
