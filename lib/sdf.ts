import * as THREE from "three";

/** 2D signed-distance shapes (millimetres). Negative = inside. */
export type SDF = (x: number, y: number) => number;

export const circle = (cx: number, cy: number, r: number): SDF => (x, y) =>
  Math.hypot(x - cx, y - cy) - r;

export const capsule = (ax: number, ay: number, bx: number, by: number, r: number): SDF => (x, y) => {
  const px = x - ax, py = y - ay, dx = bx - ax, dy = by - ay;
  const h = Math.min(1, Math.max(0, (px * dx + py * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - dx * h, py - dy * h) - r;
};

export const subtract = (a: SDF, b: SDF): SDF => (x, y) => Math.max(a(x, y), -b(x, y));

/** Smooth union ("melt") with fillet radius k. */
export const smooth = (k: number, ...fs: SDF[]): SDF => (x, y) => {
  let d = fs[0](x, y);
  for (let i = 1; i < fs.length; i++) {
    const e = fs[i](x, y);
    const h = Math.max(k - Math.abs(d - e), 0) / k;
    d = Math.min(d, e) - h * h * k * 0.25;
  }
  return d;
};

export interface Bounds { x0: number; y0: number; x1: number; y1: number }

/** Marching squares: trace the zero contour of an SDF into closed loops. */
export function traceLoops(f: SDF, b: Bounds, step = 0.25): THREE.Vector2[][] {
  const nx = Math.ceil((b.x1 - b.x0) / step), ny = Math.ceil((b.y1 - b.y0) / step);
  const v = new Float32Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++)
    for (let i = 0; i <= nx; i++) v[j * (nx + 1) + i] = f(b.x0 + i * step, b.y0 + j * step);
  const V = (i: number, j: number) => v[j * (nx + 1) + i];

  const pts = new Map<string, THREE.Vector2>();
  const lerp = (a: number, c: number) => a / (a - c);
  // edge ids: h:i,j = between (i,j)-(i+1,j); v:i,j = between (i,j)-(i,j+1)
  const hEdge = (i: number, j: number) => {
    const k = `h${i},${j}`;
    if (!pts.has(k)) pts.set(k, new THREE.Vector2(b.x0 + (i + lerp(V(i, j), V(i + 1, j))) * step, b.y0 + j * step));
    return k;
  };
  const vEdge = (i: number, j: number) => {
    const k = `v${i},${j}`;
    if (!pts.has(k)) pts.set(k, new THREE.Vector2(b.x0 + i * step, b.y0 + (j + lerp(V(i, j), V(i, j + 1))) * step));
    return k;
  };

  const segs: [string, string][] = [];
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const a = V(i, j), bb = V(i + 1, j), c = V(i + 1, j + 1), d = V(i, j + 1);
      const idx = (a < 0 ? 1 : 0) | (bb < 0 ? 2 : 0) | (c < 0 ? 4 : 0) | (d < 0 ? 8 : 0);
      if (idx === 0 || idx === 15) continue;
      const B = () => hEdge(i, j), T = () => hEdge(i, j + 1), L = () => vEdge(i, j), R = () => vEdge(i + 1, j);
      switch (idx) {
        case 1: case 14: segs.push([L(), B()]); break;
        case 2: case 13: segs.push([B(), R()]); break;
        case 3: case 12: segs.push([L(), R()]); break;
        case 4: case 11: segs.push([R(), T()]); break;
        case 6: case 9: segs.push([B(), T()]); break;
        case 7: case 8: segs.push([L(), T()]); break;
        case 5: {
          const inside = (a + bb + c + d) / 4 < 0;
          inside ? segs.push([B(), R()], [L(), T()]) : segs.push([L(), B()], [R(), T()]);
          break;
        }
        case 10: {
          const inside = (a + bb + c + d) / 4 < 0;
          inside ? segs.push([L(), B()], [R(), T()]) : segs.push([B(), R()], [L(), T()]);
          break;
        }
      }
    }

  const adj = new Map<string, number[]>();
  segs.forEach(([p, q], s) => {
    (adj.get(p) ?? adj.set(p, []).get(p)!).push(s);
    (adj.get(q) ?? adj.set(q, []).get(q)!).push(s);
  });
  const used = new Uint8Array(segs.length);
  const loops: THREE.Vector2[][] = [];
  for (let s = 0; s < segs.length; s++) {
    if (used[s]) continue;
    used[s] = 1;
    const start = segs[s][0];
    let cur = segs[s][1];
    const loop = [pts.get(start)!.clone()];
    while (cur !== start) {
      loop.push(pts.get(cur)!.clone());
      const next = (adj.get(cur) ?? []).find((n) => !used[n]);
      if (next === undefined) break;
      used[next] = 1;
      cur = segs[next][0] === cur ? segs[next][1] : segs[next][0];
    }
    if (loop.length > 8) loops.push(loop);
  }
  return loops;
}

const area = (l: THREE.Vector2[]) => {
  let a = 0;
  for (let i = 0; i < l.length; i++) { const p = l[i], q = l[(i + 1) % l.length]; a += p.x * q.y - q.x * p.y; }
  return a / 2;
};

/** Largest loop = outline, the rest = holes. */
export function loopsToShape(loops: THREE.Vector2[][], tx = 0, ty = 0): THREE.Shape {
  const sorted = [...loops].sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)));
  const mv = (l: THREE.Vector2[]) => l.map((p) => new THREE.Vector2(p.x - tx, p.y - ty));
  const shape = new THREE.Shape(mv(sorted[0]));
  for (const h of sorted.slice(1)) shape.holes.push(new THREE.Path(mv(h)));
  return shape;
}
