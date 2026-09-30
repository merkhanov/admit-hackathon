import { ConeGeometry, CylinderGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial, SphereGeometry, type BufferGeometry } from 'three';
import type { Hat } from './themes.ts';

const mat = (color: number, roughness = 0.6) => new MeshStandardMaterial({ color, roughness, side: DoubleSide });

function piece(geo: BufferGeometry, m: MeshStandardMaterial, x: number, y: number, z: number): Mesh {
  const mesh = new Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

/**
 * Headwear built from simple shapes, in units of the head's radius, with the origin at the
 * top of the head and +z towards the camera. Each coach scales and places it on its own head.
 */
export function buildHat(hat: Hat): Group | null {
  const g = new Group();
  switch (hat) {
    case 'none':
      return null;
    case 'cap': {
      // A baseball cap worn backwards, DJ style.
      const blue = mat(0x4cbcff);
      g.add(piece(new SphereGeometry(1.06, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), blue, 0, -0.42, 0));
      const brim = piece(new CylinderGeometry(0.75, 0.75, 0.07, 24, 1, false, Math.PI / 2, Math.PI), blue, 0, -0.42, -0.75);
      g.add(brim);
      g.add(piece(new SphereGeometry(0.13, 10, 8), mat(0xffd23f), 0, 0.64, 0));
      return g;
    }
    case 'papakha': {
      // A tall fur hat with a cloth top.
      g.add(piece(new CylinderGeometry(1.1, 1.0, 0.9, 24), mat(0x4a3428, 0.95), 0, 0.2, 0));
      g.add(piece(new CylinderGeometry(1.0, 1.0, 0.06, 24), mat(0xff9a4a), 0, 0.66, 0));
      return g;
    }
    case 'bow': {
      // A big cabaret bow, a little off-centre.
      const pink = mat(0xff6fb1, 0.4);
      const left = piece(new ConeGeometry(0.6, 1.1, 16), pink, -0.55, 0, 0);
      left.rotation.z = -Math.PI / 2;
      const right = piece(new ConeGeometry(0.6, 1.1, 16), pink, 0.55, 0, 0);
      right.rotation.z = Math.PI / 2;
      g.add(left, right, piece(new SphereGeometry(0.28, 12, 10), mat(0xffd23f, 0.3), 0, 0, 0));
      g.position.set(0.3, 0.25, 0.45);
      g.rotation.z = -0.3;
      return g;
    }
    case 'crown': {
      const gold = mat(0xffd23f, 0.25);
      gold.metalness = 0.6;
      g.add(piece(new CylinderGeometry(0.85, 0.8, 0.45, 24, 1, true), gold, 0, 0.05, 0));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.add(piece(new ConeGeometry(0.16, 0.42, 8), gold, Math.sin(a) * 0.82, 0.48, Math.cos(a) * 0.82));
        g.add(piece(new SphereGeometry(0.09, 8, 6), mat([0x4cbcff, 0xff6fb1, 0x46dd9b][i % 3], 0.2), Math.sin(a) * 0.86, 0.1, Math.cos(a) * 0.86));
      }
      return g;
    }
    case 'kalpak': {
      // The Kazakh white felt hat with an upturned black brim and a tassel on top.
      g.add(piece(new CylinderGeometry(0.32, 1.02, 1.35, 28), mat(0xf6f1e4, 0.9), 0, 0.28, 0));
      g.add(piece(new CylinderGeometry(1.12, 1.06, 0.38, 28, 1, true), mat(0x1f1a24, 0.8), 0, -0.3, 0));
      g.add(piece(new SphereGeometry(0.16, 10, 8), mat(0x1f1a24, 0.8), 0, 1.0, 0));
      return g;
    }
    default: {
      const _exhaustive: never = hat;
      return _exhaustive;
    }
  }
}
