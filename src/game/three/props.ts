import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshToonMaterial, type Material, type Object3D, type Texture } from 'three';
import type { HazardType } from '../game.ts';
import { stripes, trainFront, trainSide, wood } from './textures.ts';

export type PropKind = HazardType | 'coin';

export const TRAIN_LENGTH = 9;
const TRAIN_COLORS = ['#e8452c', '#2d8ce0', '#f2b705', '#2fb36b', '#8e5be8'];

/** Builds and recycles the meshes for obstacles and coins. Each prop's origin is its front, at ground level. */
export class Props {
  private readonly pools = new Map<string, Object3D[]>();
  private readonly shared: {
    post: BoxGeometry;
    postMat: MeshToonMaterial;
    lowBoard: Mesh;
    highBoard: Mesh;
    crate: Mesh;
    coin: Mesh;
    trains: { side: Material; front: Material; roof: Material }[];
  };

  constructor(ramp: Texture) {
    const toon = (opts: ConstructorParameters<typeof MeshToonMaterial>[0]) => new MeshToonMaterial({ gradientMap: ramp, ...opts });
    this.shared = {
      post: new BoxGeometry(0.14, 1, 0.14),
      postMat: toon({ color: 0xdadada }),
      lowBoard: new Mesh(new BoxGeometry(2.1, 0.46, 0.16), toon({ map: stripes('#ffffff', '#e32b2b') })),
      highBoard: new Mesh(new BoxGeometry(2.2, 0.55, 0.16), toon({ map: stripes('#ffd21f', '#1b1b2f') })),
      crate: new Mesh(new BoxGeometry(1.3, 1.3, 1.3), toon({ map: wood() })),
      coin: new Mesh(new CylinderGeometry(0.36, 0.36, 0.09, 24), new MeshToonMaterial({ color: 0xffc81a, emissive: 0x7a4a00, gradientMap: ramp })),
      trains: TRAIN_COLORS.map((c) => ({
        side: toon({ map: trainSide(c) }),
        front: toon({ map: trainFront(c) }),
        roof: toon({ color: 0xcfd6e0 }),
      })),
    };
    this.shared.coin.rotation.x = Math.PI / 2;
  }

  /** A prop for `kind`; `variant` picks the train colour. */
  take(kind: PropKind, variant: number): Object3D {
    const key = kind === 'wall' ? `wall-${variant % TRAIN_COLORS.length}` : kind;
    const pooled = this.pools.get(key)?.pop();
    if (pooled) {
      pooled.visible = true;
      return pooled;
    }
    const obj = this.build(kind, variant % TRAIN_COLORS.length);
    obj.userData.poolKey = key;
    return obj;
  }

  give(obj: Object3D): void {
    obj.visible = false;
    const key: unknown = obj.userData.poolKey;
    if (typeof key !== 'string') return;
    const list = this.pools.get(key) ?? [];
    list.push(obj);
    this.pools.set(key, list);
  }

  private build(kind: PropKind, variant: number): Object3D {
    const g = new Group();
    const s = this.shared;
    const post = (x: number, h: number) => {
      const m = new Mesh(s.post, s.postMat);
      m.scale.y = h;
      m.position.set(x, h / 2, 0);
      return m;
    };
    switch (kind) {
      case 'barrier': {
        const board = s.lowBoard.clone();
        board.position.y = 0.72;
        g.add(post(-0.85, 0.72), post(0.85, 0.72), board);
        break;
      }
      case 'bar': {
        const board = s.highBoard.clone();
        board.position.y = 2.05;
        g.add(post(-1.0, 2.4), post(1.0, 2.4), board);
        break;
      }
      case 'wall': {
        const t = s.trains[variant];
        const L = TRAIN_LENGTH;
        const bodyMats = [t.side, t.side, t.roof, t.roof, t.front, t.front];
        const body = new Mesh(new BoxGeometry(2.2, 2.9, L), bodyMats);
        body.position.set(0, 1.75, -L / 2);
        const roof = new Mesh(new BoxGeometry(1.9, 0.25, L - 0.4), t.roof);
        roof.position.set(0, 3.3, -L / 2);
        const skirt = new Mesh(new BoxGeometry(2.0, 0.35, L - 0.6), new MeshBasicMaterial({ color: 0x2a2a33 }));
        skirt.position.set(0, 0.2, -L / 2);
        g.add(body, roof, skirt);
        break;
      }
      case 'crate': {
        const c = s.crate.clone();
        c.position.y = 0.65;
        c.rotation.y = 0.12;
        g.add(c);
        break;
      }
      case 'coin': {
        const c = s.coin.clone();
        c.position.y = 1.05;
        g.add(c);
        break;
      }
      default: {
        const _exhaustive: never = kind;
        void _exhaustive;
      }
    }
    return g;
  }
}
