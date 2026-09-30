import {
  ACESFilmicToneMapping, AdditiveBlending, BoxGeometry, Color, ConeGeometry, DirectionalLight, DoubleSide, HemisphereLight,
  InstancedMesh, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PCFShadowMap, PerspectiveCamera, PlaneGeometry,
  PMREMGenerator, PointLight, Scene, Vector3, WebGLRenderer, type Texture,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { Rating } from '../dance/dance.ts';
import type { MoveTarget } from '../dance/moves.ts';
import { Coach, type CoachView, type Outfit } from './coach.ts';
import { RealCoach } from './realCoach.ts';
import { backdrop, beam, floorTile, toonRamp } from './textures.ts';
import { CREW_LOOKS } from './outfits.ts';
import { THEMES, type StageTheme } from './themes.ts';

const FLOOR_COLS = 11, FLOOR_ROWS = 9, TILE = 1.1;
const MAX_CONFETTI = 260;

interface Confetti { pos: Vector3; vel: Vector3; spin: Vector3; life: number; color: Color }

export interface StageFrame {
  /** Move the coach shows, or null for the idle groove. */
  target: MoveTarget | null;
  /** Beat position in the song; fractional part is the phase within the beat. */
  beat: number;
  /** Lights and floor react to the music only while it plays. */
  playing: boolean;
  /** Seconds into the coach's recorded dance, for a song danced to a recording; null otherwise. */
  clip?: number | null;
}

/** Another player in the room, shown as a small avatar next to the coach. */
export interface CrewMember {
  id: string;
  name: string;
  score: number;
  /** Their latest pose, or null when none arrived recently (the avatar grooves in place). */
  pose: MoveTarget | null;
}

/** Where avatars stand: beside the coach, a little behind, smaller. Up to three other players. */
const CREW_SLOTS: readonly { x: number; z: number }[] = [{ x: -2.3, z: -1 }, { x: 2.3, z: -1 }, { x: -3.5, z: -1.8 }];
const CREW_SCALE = 0.62;
/** Name tags float just above a raised hand of a crew avatar. */
const TAG_HEIGHT = 2.95 * CREW_SCALE;
const DANCER_MODEL = 'models/michelle.glb';
/**
 * Other players' characters, one per slot: Mixamo characters in the coach's style, added by
 * scripts/import-mixamo.mjs. A missing file falls back to the coach's model in that slot's look.
 */
const CREW_MODELS: readonly string[] = ['models/crew-1.glb', 'models/crew-2.glb', 'models/crew-3.glb'];
const CREW_OUTFITS: readonly Outfit[] = [
  { top: 0x56f3c1, pants: 0x8140d0, hair: 0x271f46 },
  { top: 0xffda4b, pants: 0x8cd1fa, hair: 0xfe8b85 },
  { top: 0x8cd1fa, pants: 0xfe8dc5, hair: 0x6529a9 },
];

/** What main.ts needs from a stage, so the 3D stage and the 2D fallback are interchangeable. */
export interface StageView {
  /** Other players to draw as avatars; an empty list hides them. */
  setCrew(members: readonly CrewMember[]): void;
  /** Starts loading the avatar models ahead of the song. */
  preloadCrew(): void;
  resize(): void;
  react(rating: Rating): void;
  draw(frame: StageFrame, dt: number): void;
  /** Colours and the coach's costume for a song. */
  setTheme(theme: StageTheme): void;
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
  private readonly tagPos = new Vector3();
  private readonly color = new Color();
  private lastBeat = -1;
  private shake = 0;
  private readonly ramp: Texture;
  private readonly crew = new Map<string, { coach: CoachView; tag: HTMLDivElement; slot: number; pose: MoveTarget | null }>();
  /** Realistic avatar per slot once loaded; until then the slot shows a cartoon figure. */
  private readonly crewModels: (RealCoach | null)[] = CREW_LOOKS.map(() => null);
  private crewLoading = false;
  private readonly tagLayer: HTMLDivElement;
  private theme: StageTheme = THEMES.neon;
  private readonly wall: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly rims: PointLight[] = [];

  constructor(canvas: HTMLCanvasElement) {
    // Throws without WebGL; main.ts shows the flat fallback coach instead.
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    // Film-like tone mapping and soft shadows for the dancer; the neon parts opt out of tone mapping.
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.scene.background = new Color(this.theme.background);
    const pmrem = new PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;

    const ramp = toonRamp();
    this.ramp = ramp;
    this.tagLayer = document.createElement('div');
    this.tagLayer.className = 'crew-tags';
    document.body.append(this.tagLayer);
    this.scene.add(new HemisphereLight(0xfff4ff, 0x9d80d0, 1.2));
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
    for (const x of [-2.5, 2.5]) {
      const rim = new PointLight(0xffffff, 18, 9, 1.6);
      rim.position.set(x, 3.2, -1.6);
      this.rims.push(rim);
      this.scene.add(rim);
    }

    this.wall = new Mesh(new PlaneGeometry(26, 14), new MeshBasicMaterial({ map: backdrop(this.theme.backdrop), toneMapped: false }));
    this.wall.position.set(0, 5, -5);
    this.scene.add(this.wall);

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
        this.dummy.position.set((c - (FLOOR_COLS - 1) / 2) * TILE, -0.05, 4.8 - r * TILE);
        this.dummy.updateMatrix();
        this.floor.setMatrixAt(i, this.dummy.matrix);
        i++;
      }
    }
    this.scene.add(this.floor);

    const beamTex = beam();
    const beamGeo = new ConeGeometry(1.1, 9, 24, 1, true);
    beamGeo.translate(0, -4.5, 0);
    for (let b = 0; b < 4; b++) {
      const m = new Mesh(beamGeo, new MeshBasicMaterial({
        map: beamTex, color: 0xffffff, transparent: true, opacity: 0.2, blending: AdditiveBlending, depthWrite: false, toneMapped: false,
      }));
      m.position.set((b - 1.5) * 3.2, 8, -3);
      this.beams.push(m);
      this.scene.add(m);
    }

    // The cartoon coach dances until the rigged human arrives, and stays if the model can't load.
    this.coach = new Coach(ramp);
    this.coach.setHat(this.theme.hat);
    this.coach.group.traverse((o) => { if (o instanceof Mesh) o.castShadow = true; });
    this.scene.add(this.coach.group);
    RealCoach.load(`${import.meta.env.BASE_URL}${DANCER_MODEL}`).then(
      (real) => {
        this.scene.remove(this.coach.group);
        real.setHat(this.theme.hat);
        this.coach = real;
        this.scene.add(real.group);
      },
      (err: unknown) => console.warn('Dancer model unavailable, keeping the cartoon coach', err),
    );

    this.confettiMesh = new InstancedMesh(new PlaneGeometry(0.09, 0.14), new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide, toneMapped: false }), MAX_CONFETTI);
    this.confettiMesh.count = 0;
    this.confettiMesh.frustumCulled = false;
    this.scene.add(this.confettiMesh);

    this.setTheme(this.theme);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setTheme(theme: StageTheme): void {
    const old = this.wall.material.map;
    this.theme = theme;
    this.scene.background = new Color(theme.background);
    this.wall.material.map = backdrop(theme.backdrop);
    this.wall.material.needsUpdate = true;
    if (old) old.dispose();
    this.rims.forEach((rim, i) => rim.color.set(theme.rims[i]));
    this.beams.forEach((b, i) => {
      if (b.material instanceof MeshBasicMaterial) b.material.color.set(theme.floor[i % theme.floor.length]);
    });
    this.paintFloor(0);
    this.coach.setHat(theme.hat);
  }

  private paintFloor(shift: number): void {
    const palette = this.theme.floor;
    for (let i = 0; i < FLOOR_COLS * FLOOR_ROWS; i++) {
      const r = Math.floor(i / FLOOR_COLS), c = i % FLOOR_COLS;
      this.floor.setColorAt(i, this.color.set(palette[(r + c + shift) % palette.length]));
    }
    if (this.floor.instanceColor) this.floor.instanceColor.needsUpdate = true;
  }

  resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.8 ? 58 : 38;
    this.camera.updateProjectionMatrix();
  }

  /** Loads the avatars ahead of the song, so they're ready when it starts. Safe to call often. */
  preloadCrew(): void {
    if (this.crewLoading) return;
    this.crewLoading = true;
    const base = import.meta.env.BASE_URL;
    const size = { height: 2.25 * CREW_SCALE, castShadow: false };
    CREW_LOOKS.forEach((look, slot) => {
      RealCoach.load(`${base}${CREW_MODELS[slot]}`, size)
        .catch(() => RealCoach.load(`${base}${DANCER_MODEL}`, { ...size, look }))
        .then((real) => {
          this.crewModels[slot] = real;
          // Swap the cartoon placeholder for the real model if that slot is already on stage.
          for (const a of this.crew.values()) if (a.slot === slot) this.placeAvatar(a, real);
        }, (err: unknown) => console.warn('Avatar model unavailable, keeping the cartoon figure', err));
    });
  }

  private placeAvatar(a: { coach: CoachView; slot: number }, view: CoachView): void {
    this.scene.remove(a.coach.group);
    a.coach = view;
    view.group.position.set(CREW_SLOTS[a.slot].x, 0, CREW_SLOTS[a.slot].z);
    this.scene.add(view.group);
  }

  setCrew(members: readonly CrewMember[]): void {
    if (members.length > 0) this.preloadCrew();
    const keep = new Set(members.slice(0, CREW_SLOTS.length).map((m) => m.id));
    for (const [id, a] of this.crew) {
      if (keep.has(id)) continue;
      this.scene.remove(a.coach.group);
      a.tag.remove();
      this.crew.delete(id);
    }
    for (const m of members.slice(0, CREW_SLOTS.length)) {
      let a = this.crew.get(m.id);
      if (!a) {
        const used = new Set([...this.crew.values()].map((c) => c.slot));
        const slot = CREW_SLOTS.findIndex((_, i) => !used.has(i));
        const real = this.crewModels[slot];
        let coach: CoachView;
        if (real) {
          coach = real;
        } else {
          coach = new Coach(this.ramp, CREW_OUTFITS[slot % CREW_OUTFITS.length]);
          coach.group.scale.setScalar(CREW_SCALE);
        }
        coach.group.position.set(CREW_SLOTS[slot].x, 0, CREW_SLOTS[slot].z);
        this.scene.add(coach.group);
        const tag = document.createElement('div');
        tag.className = 'crew-tag';
        this.tagLayer.append(tag);
        a = { coach, tag, slot, pose: null };
        this.crew.set(m.id, a);
      }
      a.pose = m.pose;
      const text = `${m.name} · ${m.score}`;
      if (a.tag.textContent !== text) a.tag.textContent = text;
    }
  }

  /** Celebrates good moves with confetti and shakes a little on a miss. */
  react(rating: Rating): void {
    // Confetti in the song's floor colours.
    if (rating === 'perfect') this.burst(46, this.theme.floor);
    else if (rating === 'good') this.burst(18, this.theme.floor.slice(0, 2));
    else if (rating === 'miss') this.shake = 0.08;
  }

  draw(frame: StageFrame, dt: number): void {
    const beatIndex = Math.floor(frame.beat);
    const phase = frame.beat - beatIndex;
    this.coach.update(frame.target, frame.playing ? phase : (performance.now() / 600) % 1, frame.playing ? beatIndex : Math.floor(performance.now() / 600), dt, frame.clip ?? null);
    for (const a of this.crew.values()) a.coach.update(a.pose, phase, beatIndex, dt);

    if (frame.playing && beatIndex !== this.lastBeat) {
      this.lastBeat = beatIndex;
      // Shift the floor colours one step on every beat.
      this.paintFloor(beatIndex);
    }
    const pulse = frame.playing ? 1 - phase : 0.4;
    const t = performance.now() / 1000;
    this.beams.forEach((b, i) => {
      b.rotation.z = Math.sin(t * 0.8 + i * 1.3) * 0.45;
      const m = b.material;
      if (m instanceof MeshBasicMaterial) m.opacity = 0.1 + pulse * 0.14;
    });

    this.shake = Math.max(0, this.shake - dt * 0.4);
    const j = () => (Math.random() - 0.5) * this.shake;
    this.camera.position.set(j(), 1.5 + j(), 6.1);
    this.camera.lookAt(0, 1.2, 0);

    this.stepConfetti(dt);
    this.renderer.render(this.scene, this.camera);
    this.placeTags();
  }

  /** Pins each avatar's name tag above its head in screen space. */
  private placeTags(): void {
    const w = window.innerWidth, h = window.innerHeight;
    for (const a of this.crew.values()) {
      // Anchor in world units: the cartoon group is scaled, the real models are sized at load.
      const head = this.tagPos.setFromMatrixPosition(a.coach.group.matrixWorld);
      head.y += TAG_HEIGHT;
      head.project(this.camera);
      a.tag.style.transform = `translate(${((head.x + 1) / 2) * w}px, ${((1 - head.y) / 2) * h}px) translate(-50%, -100%)`;
    }
  }

  private burst(count: number, colors: readonly number[]): void {
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
