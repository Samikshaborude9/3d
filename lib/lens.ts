import * as THREE from "three";
import type { Mats } from "./materials";
import { circle, loopsToShape, smooth, subtract, traceLoops } from "./sdf";

export interface Part {
  id: string;
  name: string;
  spec: string;
  group: THREE.Group;
  lift: THREE.Vector3; // exploded offset (mm, lens axis = local Y)
  order: number; // top parts leave first, come back last
  anchor: THREE.Vector3; // label anchor, in part space
  meshes: THREE.Mesh[];
}

export interface Lens {
  root: THREE.Group;
  parts: Part[];
  ring: THREE.Object3D; // focus ring (spins)
  blades: { g: THREE.Object3D; phi: number }[];
}

type P = [number, number];
const lathe = (pts: P[], seg = 128) =>
  new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

/** Hollow tube, profile drawn counter-clockwise so faces point outward. */
function tubePts(rIn: number, rOut: number, y0: number, y1: number, c = 0.5): P[] {
  return [
    [rIn + c, y0], [rOut - c, y0], [rOut, y0 + c], [rOut, y1 - c], [rOut - c, y1],
    [rIn + c, y1], [rIn, y1 - c], [rIn, y0 + c], [rIn + c, y0],
  ];
}

/** Plano-convex element. sag<0 bulges toward -Y. */
function glassPts(R: number, yf: number, t: number, sag: number, n = 16): P[] {
  const a = Math.abs(sag);
  const Rs = (R * R + a * a) / (2 * a);
  const pts: P[] = [[0, yf], [R, yf], [R, yf + t]];
  for (let i = 1; i <= n; i++) {
    const r = R * (1 - i / n);
    pts.push([r, yf + t + Math.sqrt(Rs * Rs - r * r) - Math.sqrt(Rs * Rs - R * R)]);
  }
  if (sag > 0) return pts;
  const yc = yf + t / 2;
  return pts.map(([r, y]) => [r, 2 * yc - y] as P).reverse();
}

export function buildLens(m: Mats): Lens {
  const root = new THREE.Group();
  root.rotation.x = Math.PI / 2; // lens axis (local Y) points at the viewer (+Z)
  root.position.z = -9; // centre the stack
  const parts: Part[] = [];

  const part = (id: string, name: string, spec: string, lift: number, order: number, ay: number, ar: number): Part => {
    const p: Part = {
      id, name, spec, group: new THREE.Group(), lift: new THREE.Vector3(0, lift, 0), order,
      anchor: new THREE.Vector3(0, ay, -ar), meshes: [],
    };
    root.add(p.group);
    parts.push(p);
    return p;
  };
  const add = (p: Part, geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], parent: THREE.Object3D = p.group) => {
    const mesh = new THREE.Mesh(geo, mat);
    parent.add(mesh);
    p.meshes.push(mesh);
    return mesh;
  };
  /** Polished rolled edge: the second material that makes a part read as expensive. */
  const rim = (p: Part, r: number, y: number, tube = 0.24) => {
    const t = add(p, new THREE.TorusGeometry(r - tube * 0.6, tube, 14, 160), m.chrome);
    t.rotation.x = Math.PI / 2;
    t.position.y = y;
  };
  const band = (p: Part, r: number, y: number, mat: THREE.Material, tube = 0.32) => {
    const t = add(p, new THREE.TorusGeometry(r, tube, 12, 160), mat);
    t.rotation.x = Math.PI / 2;
    t.position.y = y;
  };

  // 1 · Bayonet mount — SDF shape, traced, extruded with 0.05 mm bevels
  const mount = part("mount", "BAYONET MOUNT", "Ø 67 mm · stainless", -88, 0.1, -41, 33.5);
  {
    const lug = (deg: number) => {
      const a = (deg * Math.PI) / 180;
      return circle(25.6 * Math.cos(a), 25.6 * Math.sin(a), 3.4);
    };
    const flange = smooth(1.2, subtract(circle(0, 0, 33.5), circle(0, 0, 24.5)), lug(90), lug(210), lug(330));
    const shape = loopsToShape(traceLoops(flange, { x0: -35, y0: -35, x1: 35, y1: 35 }, 0.2));
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 3, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2, curveSegments: 4,
    });
    const flangeMesh = add(mount, geo, [m.silver, m.chrome]);
    flangeMesh.rotation.x = -Math.PI / 2; // shape plane ⟂ lens axis
    flangeMesh.position.y = -45;
    add(mount, lathe(tubePts(24.4, 29, -42, -38)), m.silver);
  }

  // 2 · Rear element
  const rearGlass = part("rear", "REAR ELEMENT", "Ø 46 mm · ED glass", -64, 0.22, -24, 24);
  add(rearGlass, lathe(glassPts(23, -26, 1.5, -5.5)), m.glass);
  add(rearGlass, lathe(glassPts(22.5, -19, 1.2, 3.5)), m.glass);

  // 3 · Rear barrel
  const rearBarrel = part("rbarrel", "REAR BARREL", "Ø 68 × 28 mm · anodised", -40, 0.15, -24, 34);
  add(rearBarrel, lathe(tubePts(31.5, 34, -38, -10)), m.black);
  rim(rearBarrel, 34, -38);
  rim(rearBarrel, 34, -10);

  // 4 · Aperture — 9 SDF blades that rotate about their pivots
  const aperture = part("iris", "APERTURE · 9 BLADES", "f/1.8 – f/16", -8, 0.35, -8, 31);
  const blades: Lens["blades"] = [];
  {
    const pivot = { x: 21, y: -17 };
    const sdf = smooth(1.2, subtract(circle(0, 0, 28.2), circle(-4, 9, 24.5)), circle(pivot.x, pivot.y, 2.6));
    const shape = loopsToShape(traceLoops(sdf, { x0: -31, y0: -31, x1: 31, y1: 31 }, 0.2), pivot.x, pivot.y);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.3, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2, curveSegments: 4,
    });
    const ringG = new THREE.Group();
    ringG.rotation.x = -Math.PI / 2;
    ringG.position.y = -8;
    aperture.group.add(ringG);
    for (let k = 0; k < 9; k++) {
      const phi = (k / 9) * Math.PI * 2;
      const g = new THREE.Group();
      g.position.set(pivot.x * Math.cos(phi) - pivot.y * Math.sin(phi), pivot.x * Math.sin(phi) + pivot.y * Math.cos(phi), k * 0.09);
      g.rotation.z = phi;
      ringG.add(g);
      add(aperture, geo, [m.silver, m.chrome], g);
      blades.push({ g, phi });
    }
    add(aperture, lathe(tubePts(28.6, 31, -11, -5, 0.3)), m.black);
  }

  // 5 · Focus ring — knurled, with a red index band
  const ring = part("focus", "FOCUS RING", "Ø 71 × 24 mm · knurled", 16, 0.5, 8, 35.5);
  {
    const geo = lathe(tubePts(31.5, 35.2, -4, 20, 0.6), 280);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i);
      const r = Math.hypot(x, z);
      if (r > 34.9 && y > -3.3 && y < 19.3) {
        const a = Math.atan2(z, x);
        const k = 1 + (0.55 * Math.pow(0.5 + 0.5 * Math.cos(a * 60), 1.6)) / r;
        pos.setXYZ(i, x * k, y, z * k);
      }
    }
    geo.computeVertexNormals();
    add(ring, geo, m.black);
    rim(ring, 35.2, -4);
    rim(ring, 35.2, 20);
    band(ring, 35.4, 21, m.red, 0.4);
  }

  // 6 · Front barrel
  const front = part("fbarrel", "FRONT BARREL", "Ø 69 × 18 mm · anodised", 40, 0.7, 31, 34.5);
  add(front, lathe(tubePts(31.5, 34.5, 22, 40)), m.black);
  add(front, lathe(tubePts(28, 31.5, 30, 34, 0.3)), m.silver);
  rim(front, 34.5, 22);
  rim(front, 34.5, 40);
  band(front, 34.6, 28, m.red);

  // 7 · Front group
  const frontGlass = part("front", "FRONT GROUP", "Ø 60 mm · multi-coated", 60, 0.85, 31, 30);
  add(frontGlass, lathe(glassPts(30, 31, 1.6, 8)), m.glass);
  add(frontGlass, lathe(glassPts(29, 24, 1.2, -4)), m.glass);

  // 8 · Hood — slightly flared
  const hood = part("hood", "LENS HOOD", "Ø 74 × 22 mm · flared", 92, 1.0, 51, 38.5);
  add(hood, lathe([[35, 40], [36.5, 40], [39, 62], [37.5, 62], [35, 40]].map(([r, y]) => [r, y] as P)), m.black);
  rim(hood, 39, 62);
  band(hood, 37.4, 41, m.red, 0.3);

  return { root, parts, ring: ring.group, blades };
}
