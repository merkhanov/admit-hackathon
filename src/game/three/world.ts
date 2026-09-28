import { BoxGeometry, Group, InstancedMesh, Mesh, MeshToonMaterial, Object3D, PlaneGeometry, type Texture } from 'three';
import { graffitiWall, gravel, windows } from './textures.ts';

export const LANE_X = 2.4;
/** World units from the player to the spawn point (game z = 1). */
export const SPAWN_DISTANCE = 60;
const TRACK_LENGTH = 140;
const TIE_SPACING = 1.1;
const BUILDING_SPACING = 7;
const POLE_SPACING = 21;
/** Objects closer to the camera than this wrap around to the far end. */
const NEAR_EDGE = 20;
const BUILDING_COLORS = ['#f4a259', '#5b8def', '#f25f5c', '#70c1b3', '#ffe066', '#b388eb', '#ef8354'];

/** Rails, ties, graffiti walls and a city skyline, scrolled with the run distance. */
export class World {
  readonly group = new Group();
  private readonly ties: InstancedMesh;
  private readonly ground: Texture;
  private readonly wallTex: Texture;
  private readonly buildings: { obj: Mesh; baseZ: number }[] = [];
  private readonly poles: { obj: Group; baseZ: number }[] = [];
  private readonly dummy = new Object3D();

  constructor(ramp: Texture) {
    const toon = (opts: ConstructorParameters<typeof MeshToonMaterial>[0]) => new MeshToonMaterial({ gradientMap: ramp, ...opts });
    const bedWidth = LANE_X * 3 + 1.2;

    this.ground = gravel();
    this.ground.repeat.set(4, TRACK_LENGTH / 6);
    const bed = new Mesh(new PlaneGeometry(bedWidth, TRACK_LENGTH), toon({ map: this.ground }));
    bed.rotation.x = -Math.PI / 2;
    bed.position.z = -TRACK_LENGTH / 2 + 20;

    // Platforms on both sides, between the track and the walls.
    const platformMat = toon({ color: 0xc9c2b6 });
    for (const side of [-1, 1]) {
      const platform = new Mesh(new BoxGeometry(3, 0.6, TRACK_LENGTH), platformMat);
      platform.position.set(side * (bedWidth / 2 + 1.5), 0.3, -TRACK_LENGTH / 2 + 20);
      this.group.add(platform);
    }

    const railMat = toon({ color: 0x8c96a6 });
    const railGeo = new BoxGeometry(0.1, 0.12, TRACK_LENGTH);
    for (let lane = 0; lane < 3; lane++) {
      for (const dx of [-0.62, 0.62]) {
        const rail = new Mesh(railGeo, railMat);
        rail.position.set((lane - 1) * LANE_X + dx, 0.14, -TRACK_LENGTH / 2 + 20);
        this.group.add(rail);
      }
    }

    const tieCount = Math.ceil(TRACK_LENGTH / TIE_SPACING) * 3;
    this.ties = new InstancedMesh(new BoxGeometry(1.7, 0.1, 0.28), toon({ color: 0x6d4a2d }), tieCount);

    this.wallTex = graffitiWall();
    this.wallTex.repeat.set(TRACK_LENGTH / 24, 1);
    const wallMat = toon({ map: this.wallTex });
    for (const side of [-1, 1]) {
      const wall = new Mesh(new PlaneGeometry(TRACK_LENGTH, 3.2), wallMat);
      wall.rotation.y = side * -Math.PI / 2;
      wall.position.set(side * (bedWidth / 2 + 3), 1.6 + 0.6, -TRACK_LENGTH / 2 + 20);
      this.group.add(wall);
    }

    const buildingGeo = new BoxGeometry(1, 1, 1);
    const count = Math.ceil(TRACK_LENGTH / BUILDING_SPACING);
    for (let i = 0; i < count * 2; i++) {
      const color = BUILDING_COLORS[i % BUILDING_COLORS.length];
      const mat = toon({ map: windows(color) });
      const b = new Mesh(buildingGeo, mat);
      const h = 6 + ((i * 7) % 9) * 1.4;
      b.scale.set(5.5, h, 5.5);
      const side = i % 2 ? 1 : -1;
      b.position.set(side * (bedWidth / 2 + 7.5), h / 2, 0);
      this.buildings.push({ obj: b, baseZ: -Math.floor(i / 2) * BUILDING_SPACING });
      this.group.add(b);
    }

    // Catenary poles over the track.
    const poleMat = toon({ color: 0x4b5563 });
    for (let i = 0; i < Math.ceil(TRACK_LENGTH / POLE_SPACING); i++) {
      const pole = new Group();
      for (const side of [-1, 1]) {
        const p = new Mesh(new BoxGeometry(0.22, 5.4, 0.22), poleMat);
        p.position.set(side * (bedWidth / 2 + 0.4), 2.7, 0);
        pole.add(p);
      }
      const beam = new Mesh(new BoxGeometry(bedWidth + 1, 0.22, 0.22), poleMat);
      beam.position.y = 5.3;
      pole.add(beam);
      this.poles.push({ obj: pole, baseZ: -i * POLE_SPACING });
      this.group.add(pole);
    }

    this.group.add(bed, this.ties);
  }

  /** `travelled` is the run distance in world units. */
  update(travelled: number): void {
    let i = 0;
    const tieOffset = travelled % TIE_SPACING;
    for (let k = 0; k < this.ties.count / 3; k++) {
      const z = NEAR_EDGE - k * TIE_SPACING + tieOffset;
      for (let lane = 0; lane < 3; lane++) {
        this.dummy.position.set((lane - 1) * LANE_X, 0.06, z);
        this.dummy.updateMatrix();
        this.ties.setMatrixAt(i++, this.dummy.matrix);
      }
    }
    this.ties.instanceMatrix.needsUpdate = true;

    this.ground.offset.y = travelled / 6;
    this.wallTex.offset.x = -travelled / 24;

    const buildingSpan = Math.ceil(TRACK_LENGTH / BUILDING_SPACING) * BUILDING_SPACING;
    for (const b of this.buildings) b.obj.position.z = scrollWrap(b.baseZ, travelled, buildingSpan);
    const poleSpan = Math.ceil(TRACK_LENGTH / POLE_SPACING) * POLE_SPACING;
    for (const p of this.poles) p.obj.position.z = scrollWrap(p.baseZ, travelled, poleSpan);
  }
}

/** Position of a repeating object: its base z moved by the distance, wrapped into [NEAR_EDGE - span, NEAR_EDGE]. */
function scrollWrap(baseZ: number, travelled: number, span: number): number {
  const z = baseZ + NEAR_EDGE + (travelled % span);
  return (z > NEAR_EDGE ? z - span : z);
}
