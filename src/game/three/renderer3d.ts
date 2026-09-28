import {
  BoxGeometry, Color, DirectionalLight, Fog, HemisphereLight, InstancedMesh, MeshBasicMaterial, Object3D,
  PerspectiveCamera, Scene, Vector3, WebGLRenderer,
} from 'three';
import { JUMP_S, PUNCH_S, type Entity, type GameNote, type GameState, type Lane } from '../game.ts';
import type { SceneRenderer } from '../sceneRenderer.ts';
import { Props, type PropKind } from './props.ts';
import { Runner } from './runner.ts';
import { sky, SKY_HORIZON, toonRamp } from './textures.ts';
import { LANE_X, SPAWN_DISTANCE, World } from './world.ts';

const MAX_PARTICLES = 240;
/** A prop that left the game state keeps moving until it is this far behind the camera. */
const GHOST_BEHIND = 12;

interface Visual {
  obj: Object3D;
  kind: PropKind;
  lane: Lane;
  z: number;
  ghost: boolean;
}

interface Particle { pos: Vector3; vel: Vector3; life: number; max: number; color: Color; size: number }

const laneX = (lane: number) => (lane - 1) * LANE_X;
const worldZ = (z: number) => -z * SPAWN_DISTANCE;

/** 3D runner scene in a bright cartoon subway style. Visual state only; the rules live in game.ts. */
export class ThreeRenderer implements SceneRenderer {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(58, 1, 0.1, 220);
  private readonly world: World;
  private readonly props: Props;
  private readonly runner: Runner;
  private readonly visuals = new Map<number, Visual>();
  private readonly particles: Particle[] = [];
  private readonly particleMesh: InstancedMesh;
  private readonly dummy = new Object3D();
  private readonly fxLayer: HTMLDivElement;
  private readonly flashEl: HTMLDivElement;
  private displayLane = 1;
  private camX = 0;
  private shake = 0;
  private coinLanes = new Set<Lane>();
  private smashLanes = new Set<Lane>();

  constructor(canvas: HTMLCanvasElement) {
    // Throws when WebGL is unavailable; main.ts then falls back to the 2D renderer.
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

    this.scene.background = sky();
    this.scene.fog = new Fog(SKY_HORIZON, 26, SPAWN_DISTANCE * 1.02);
    this.scene.add(new HemisphereLight(0xe6f6ff, 0x9c8a6a, 1.6));
    const sun = new DirectionalLight(0xffffff, 1.8);
    sun.position.set(6, 12, 5);
    this.scene.add(sun);

    const ramp = toonRamp();
    this.world = new World(ramp);
    this.props = new Props(ramp);
    this.runner = new Runner(ramp);
    this.scene.add(this.world.group, this.runner.group, this.runner.shadow);

    this.particleMesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ color: 0xffffff }), MAX_PARTICLES);
    this.particleMesh.count = 0;
    this.particleMesh.frustumCulled = false;
    this.scene.add(this.particleMesh);

    this.fxLayer = document.createElement('div');
    this.fxLayer.className = 'fx-layer';
    this.flashEl = document.createElement('div');
    this.flashEl.className = 'fx-flash';
    this.fxLayer.append(this.flashEl);
    document.body.append(this.fxLayer);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Narrow portrait screens need a wider view to fit all three lanes.
    this.camera.fov = w / h < 0.8 ? 72 : 58;
    this.camera.updateProjectionMatrix();
  }

  handle(notes: readonly GameNote[]): void {
    for (const n of notes) {
      switch (n.kind) {
        case 'coin': this.coinLanes.add(n.lane); break;
        case 'smash': this.smashLanes.add(n.lane); this.shake = Math.max(this.shake, 0.25); break;
        case 'hit':
          this.shake = 0.6;
          this.flash('rgba(255, 60, 70, 0.45)');
          this.burst(new Vector3(laneX(this.displayLane), 1.2, -0.6), 0xff4d5e, 24);
          break;
        case 'clear':
          this.float(n.text, new Vector3(laneX(this.displayLane), 2.8, 0), '#4ade80');
          break;
        case 'over': this.shake = 0.9; break;
        case 'jump': case 'punch': case 'lane': break;
        default: {
          const _exhaustive: never = n;
          void _exhaustive;
        }
      }
    }
  }

  draw(game: GameState, dt: number): void {
    const moving = game.status === 'running';
    const speed = moving ? game.speed : 0;
    this.displayLane += (game.lane - this.displayLane) * Math.min(1, dt * 12);
    const x = laneX(this.displayLane);

    this.world.update(game.distance * SPAWN_DISTANCE);
    this.syncProps(game.entities, game.lane, speed, dt);

    this.runner.group.position.x = x;
    this.runner.update({
      jump: game.jumpT > 0 ? 1 - game.jumpT / JUMP_S : null,
      ducking: game.ducking,
      punch: game.punchT / PUNCH_S,
      pace: game.speed,
      running: moving,
      blink: moving && game.invulnT > 0 && Math.floor(game.invulnT * 12) % 2 === 0,
    }, dt);

    this.camX += (x * 0.7 - this.camX) * Math.min(1, dt * 6);
    this.shake = Math.max(0, this.shake - dt * 1.8);
    const jitter = () => (Math.random() - 0.5) * this.shake;
    // Chase camera: high and behind, pitched down so the runner sits above the hint banner.
    this.camera.position.set(this.camX + jitter(), 4.6 + jitter(), 7.8);
    this.camera.lookAt(this.camX * 0.85, 0.4, -9);

    this.stepParticles(dt);
    this.renderer.render(this.scene, this.camera);
    this.coinLanes.clear();
    this.smashLanes.clear();
  }

  /** Keeps a mesh per entity. An entity that left the state keeps moving as a ghost, unless it was collected or smashed. */
  private syncProps(entities: readonly Entity[], playerLane: Lane, speed: number, dt: number): void {
    const present = new Set<number>();
    for (const e of entities) {
      present.add(e.id);
      let v = this.visuals.get(e.id);
      if (!v) {
        const kind: PropKind = e.kind === 'coin' ? 'coin' : e.type;
        v = { obj: this.props.take(kind, e.id), kind, lane: e.lane, z: e.z, ghost: false };
        this.scene.add(v.obj);
        this.visuals.set(e.id, v);
      }
      v.z = e.z;
    }

    for (const [id, v] of this.visuals) {
      if (!present.has(id) && !v.ghost) {
        const pos = new Vector3(laneX(v.lane), 1.1, worldZ(v.z));
        if (v.kind === 'coin' && v.lane === playerLane && this.coinLanes.has(v.lane)) {
          this.burst(pos, 0xffd21f, 14);
          this.float('+25', pos.clone().setY(2.2), '#ffd21f');
          this.remove(id, v);
          continue;
        }
        if (v.kind === 'crate' && this.smashLanes.has(v.lane)) {
          this.burst(pos.setY(0.7), 0xc98a3e, 34, 0.22);
          this.float('+30', pos.clone().setY(2.4), '#ffd21f');
          this.remove(id, v);
          continue;
        }
        v.ghost = true;
      }
      if (v.ghost) {
        v.z -= speed * dt;
        if (worldZ(v.z) > GHOST_BEHIND) { this.remove(id, v); continue; }
      }
      v.obj.position.set(laneX(v.lane), 0, worldZ(v.z));
      if (v.kind === 'coin') {
        const coin = v.obj.children[0];
        coin.rotation.z += dt * 4;
        coin.position.y = 1.05 + Math.sin(performance.now() / 250 + id) * 0.08;
      }
    }
  }

  private remove(id: number, v: Visual): void {
    this.scene.remove(v.obj);
    this.props.give(v.obj);
    this.visuals.delete(id);
  }

  private burst(at: Vector3, color: number, count: number, size = 0.14): void {
    for (let i = 0; i < count && this.particles.length < MAX_PARTICLES; i++) {
      const a = Math.random() * Math.PI * 2, up = 2 + Math.random() * 5, out = 1.5 + Math.random() * 4;
      this.particles.push({
        pos: at.clone(),
        vel: new Vector3(Math.cos(a) * out, up, Math.sin(a) * out),
        life: 0,
        max: 0.5 + Math.random() * 0.5,
        color: new Color(color).offsetHSL(0, 0, (Math.random() - 0.5) * 0.2),
        size: size * (0.6 + Math.random()),
      });
    }
  }

  private stepParticles(dt: number): void {
    let n = 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.max) { this.particles.splice(i, 1); continue; }
      p.vel.y -= 14 * dt;
      p.pos.addScaledVector(p.vel, dt);
      this.dummy.position.copy(p.pos);
      this.dummy.rotation.set(p.life * 8, p.life * 6, 0);
      this.dummy.scale.setScalar(p.size * (1 - p.life / p.max));
      this.dummy.updateMatrix();
      this.particleMesh.setMatrixAt(n, this.dummy.matrix);
      this.particleMesh.setColorAt(n, p.color);
      n++;
    }
    this.particleMesh.count = n;
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
  }

  private float(text: string, at: Vector3, color: string): void {
    const v = at.clone().project(this.camera);
    const el = document.createElement('div');
    el.className = 'fx-float';
    el.textContent = text;
    el.style.color = color;
    el.style.left = `${((v.x + 1) / 2) * window.innerWidth}px`;
    el.style.top = `${((1 - v.y) / 2) * window.innerHeight}px`;
    this.fxLayer.append(el);
    setTimeout(() => el.remove(), 1100);
  }

  private flash(color: string): void {
    this.flashEl.style.background = color;
    this.flashEl.classList.remove('on');
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add('on');
  }
}
