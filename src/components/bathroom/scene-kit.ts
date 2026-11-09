// three.js helpers for the bathroom scene: math, rect cutting, canvas textures, surfaces.
// Imported only by scene.ts (browser-only, loaded via dynamic import).
import * as THREE from "three";

export type V3 = [number, number, number];
export interface Rect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const ramp = (s: number, a: number, b: number) => clamp01((s - a) / (b - a));
export const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
export const easeInOut = (x: number) => {
  x = clamp01(x);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
export const bell = (s: number, a: number, b: number, edge = 0.06) =>
  ramp(s, a, a + edge) * (1 - ramp(s, b - edge, b));

export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function subtractRect(r: Rect, h: Rect): Rect[] {
  if (h.u0 >= r.u1 || h.u1 <= r.u0 || h.v0 >= r.v1 || h.v1 <= r.v0) return [r];
  const out: Rect[] = [];
  if (h.v0 > r.v0) out.push({ u0: r.u0, v0: r.v0, u1: r.u1, v1: h.v0 });
  if (h.v1 < r.v1) out.push({ u0: r.u0, v0: h.v1, u1: r.u1, v1: r.v1 });
  const v0 = Math.max(r.v0, h.v0);
  const v1 = Math.min(r.v1, h.v1);
  if (h.u0 > r.u0) out.push({ u0: r.u0, v0, u1: h.u0, v1 });
  if (h.u1 < r.u1) out.push({ u0: h.u1, v0, u1: r.u1, v1 });
  return out;
}
export function cutHoles(rects: Rect[], holes: Rect[] = []) {
  let out = rects;
  for (const h of holes) out = out.flatMap((r) => subtractRect(r, h));
  return out.filter((r) => r.u1 - r.u0 > 0.012 && r.v1 - r.v0 > 0.012);
}

/* ------------------------------------------------------------------ textures */
function makeCanvas(size: number) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return [c, c.getContext("2d")!] as const;
}
function toTexture(c: HTMLCanvasElement, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

export function marbleTexture() {
  const S = 1024;
  const [c, g] = makeCanvas(S);
  const R = rng(11);
  g.fillStyle = "#efece6";
  g.fillRect(0, 0, S, S);
  const wrap = (fn: (ox: number, oy: number) => void) => {
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) fn(ox, oy);
  };
  for (let i = 0; i < 90; i++) {
    const x = R() * S;
    const y = R() * S;
    const r = 90 + R() * 300;
    const warm = R() < 0.55;
    const a = 0.05 + R() * 0.12;
    const rgb = warm ? "206,198,186" : "252,251,248";
    wrap((ox, oy) => {
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      gr.addColorStop(0, `rgba(${rgb},${warm ? a : a * 1.5})`);
      gr.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = gr;
      g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    });
  }
  const vein = (width: number, rgb: string, steps: number, len: number, jitter: number) => {
    let x = R() * S;
    let y = R() * S;
    let ang = -0.7 + (R() - 0.5) * 0.5;
    let turn = 0;
    const pts: [number, number][] = [[x, y]];
    for (let i = 0; i < steps; i++) {
      turn = turn * 0.6 + (R() - 0.5) * jitter;
      ang += turn * 0.22 + (-0.7 - ang) * 0.03;
      x += Math.cos(ang) * len;
      y += Math.sin(ang) * len;
      pts.push([x, y]);
    }
    const passes: [number, number][] = [
      [width * 12, 0.02],
      [width * 5, 0.045],
      [width * 2, 0.1],
      [width * 0.7, 0.3],
    ];
    for (const [lw, a] of passes)
      wrap((ox, oy) => {
        g.beginPath();
        g.moveTo(pts[0]![0] + ox, pts[0]![1] + oy);
        for (let k = 1; k < pts.length - 1; k++) {
          const p0 = pts[k]!;
          const p1 = pts[k + 1]!;
          g.quadraticCurveTo(p0[0] + ox, p0[1] + oy, (p0[0] + p1[0]) / 2 + ox, (p0[1] + p1[1]) / 2 + oy);
        }
        g.strokeStyle = `rgba(${rgb},${a})`;
        g.lineWidth = lw;
        g.lineJoin = "round";
        g.lineCap = "round";
        g.stroke();
      });
  };
  for (let i = 0; i < 3; i++) vein(2.4, "128,120,110", 95, 14, 0.5);
  for (let i = 0; i < 6; i++) vein(0.8, "158,150,138", 55, 12, 0.7);
  for (let i = 0; i < 3; i++) vein(0.9, "178,148,102", 60, 12, 0.6);
  return toTexture(c);
}

export function concreteTexture(base: string, speck: number, seed: number) {
  const S = 512;
  const [c, g] = makeCanvas(S);
  const R = rng(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) {
    const x = R() * S;
    const y = R() * S;
    const r = 30 + R() * 120;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const l = R() < 0.5 ? "0,0,0" : "255,255,255";
    gr.addColorStop(0, `rgba(${l},${0.03 + R() * 0.04})`);
    gr.addColorStop(1, `rgba(${l},0)`);
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < speck; i++) {
    const v = R() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${v},${v},${v},${0.05 + R() * 0.12})`;
    const s = R() * 2.2 + 0.4;
    g.fillRect(R() * S, R() * S, s, s);
  }
  return toTexture(c);
}

export function ridgeTexture() {
  const [c, g] = makeCanvas(32);
  for (let y = 0; y < 32; y++) {
    const k = 0.5 + 0.5 * Math.cos((y / 32) * Math.PI * 2);
    const v = Math.round(150 + k * 90);
    g.fillStyle = `rgb(${v},${v - 2},${v - 6})`;
    g.fillRect(0, y, 32, 1);
  }
  return toTexture(c, false);
}

/** Brushed, fibrous look used for the fibre-reinforced cement membrane. */
export function fibreTexture() {
  const S = 256;
  const [c, g] = makeCanvas(S);
  const R = rng(21);
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i++) {
    const x = R() * S;
    const y = R() * S;
    const a = R() * Math.PI;
    const l = 4 + R() * 10;
    g.strokeStyle = `rgba(90,90,90,${0.08 + R() * 0.12})`;
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(0,0,0,${0.02 + R() * 0.03})`;
    g.fillRect(0, R() * S, S, 2 + R() * 5);
  }
  return toTexture(c);
}

/** Non-woven waterproof fabric: fleece speckle with a printed edge band. */
export function fabricTexture() {
  const S = 256;
  const [c, g] = makeCanvas(S);
  const R = rng(31);
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) {
    const v = 200 + Math.floor(R() * 55);
    g.fillStyle = `rgba(${v - 30},${v - 20},${v},${0.25 + R() * 0.3})`;
    g.fillRect(R() * S, R() * S, 1 + R() * 2, 1 + R() * 2);
  }
  g.fillStyle = "rgba(60,90,120,0.22)";
  g.fillRect(0, 0, 10, S);
  g.fillRect(S - 10, 0, 10, S);
  return toTexture(c);
}

/* ------------------------------------------------------------------ surfaces */
export interface SurfaceDef {
  id: string;
  o: V3;
  u: V3;
  v: V3;
  w: number;
  h: number;
  tw?: number;
  th?: number;
  off?: [number, number];
  /** Offset of this surface into the shared marble texture, so veins continue. */
  tex: [number, number];
  holes?: Rect[];
  /** Tile rects that must not be generated (built specially elsewhere). */
  skip?: Rect[];
}

export class Surface {
  group = new THREE.Group();
  def: SurfaceDef;
  constructor(def: SurfaceDef) {
    this.def = def;
    const U = new THREE.Vector3(...def.u);
    const V = new THREE.Vector3(...def.v);
    const Nn = new THREE.Vector3().crossVectors(U, V);
    this.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(U, V, Nn));
    this.group.position.set(...def.o);
  }
  world(u: number, v: number, d: number, out = new THREE.Vector3()) {
    return this.group.localToWorld(out.set(u, v, d));
  }
}

export function roundedRect(
  shape: THREE.Shape | THREE.Path,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  reverse = false,
) {
  if (!reverse) {
    shape.moveTo(x + r, y);
    shape.lineTo(x + w - r, y);
    shape.quadraticCurveTo(x + w, y, x + w, y + r);
    shape.lineTo(x + w, y + h - r);
    shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    shape.lineTo(x + r, y + h);
    shape.quadraticCurveTo(x, y + h, x, y + h - r);
    shape.lineTo(x, y + r);
    shape.quadraticCurveTo(x, y, x + r, y);
  } else {
    shape.moveTo(x + r, y);
    shape.quadraticCurveTo(x, y, x, y + r);
    shape.lineTo(x, y + h - r);
    shape.quadraticCurveTo(x, y + h, x + r, y + h);
    shape.lineTo(x + w - r, y + h);
    shape.quadraticCurveTo(x + w, y + h, x + w, y + h - r);
    shape.lineTo(x + w, y + r);
    shape.quadraticCurveTo(x + w, y, x + w - r, y);
    shape.lineTo(x + r, y);
  }
}
