/* Region normalizer (morphicons/region): any icon → its visible surface as
   ONE canonical region — non-overlapping closed contours, outers wound
   positive and holes negative (nonzero rule). It is what makes a cross of
   two overlapping rectangles, a cross drawn as one outline and a stroked
   "+" the same kind of geometry, so any two icons can morph.

   Method: a signed distance field on a grid, then marching squares.
   - A round-capped, round-joined stroke IS the set {dist(p, centerline) ≤
     w/2}: its field is dist − w/2 (caps, joins and dots come for free).
   - A fill is ±dist(p, boundary), signed by the element's own fill rule
     (winding per scanline), so evenodd/nonzero are honored per element.
   - The union of every element is the pointwise MIN of their fields:
     overlaps, self-intersections and strokes-inside-fills resolve with no
     intersection geometry at all (no degenerate cases to handle).
   The zero level set is traced with marching squares, interpolating the
   exact distances (straight edges land exactly on their line), then
   simplified and corner-recovered (sharp corners chopped by the grid are
   rebuilt as the intersection of their two straight neighbours).

   Pure and DOM-free. The DOM driver loads this module lazily — only when a
   morph involves a fill icon — so stroke-only apps never download it.
   Import it directly to normalize ahead of time (module scope or build). */

import { iconToCubics } from "../core/normalize";
import { type MorphPlan, reversePts } from "../core/plan";
import {
  distSeg,
  inside,
  isRegion,
  paintOf,
  REGION_ATTR,
  signedArea,
  translucent,
} from "../core/region";
import type { IconInput, IconNode, IconNodeAttrs, Sampled } from "../core/types";
import { buildRegionPlan, resampleRegion } from "./plan";

export interface RegionOptions {
  /** Width for stroked elements that don't declare `stroke-width` (Lucide
   *  data carries none: the binding draws it). Default 2. */
  strokeWidth?: number;
  /** Grid step of the distance field, in icon units (24-unit grid).
   *  Default ⅛: corners are rebuilt exactly, curves deviate < 0.01. */
  cell?: number;
}

const BIG = 1e9;

const painted = (v: unknown): boolean =>
  v !== undefined && String(v).trim().toLowerCase() !== "none";

const num = (v: unknown, fallback: number): number => {
  const x = typeof v === "number" ? v : Number.parseFloat(String(v ?? ""));
  return Number.isFinite(x) ? x : fallback;
};

interface Part {
  lines: Float64Array[]; // flattened polylines [x0, y0, x1, y1, …]
  closed: boolean[];
  half: number; // stroke half-width, 0 = not stroked
  fill: 0 | 1 | 2; // 0 none, 1 nonzero, 2 evenodd
}

// Cubic subpaths → polylines within `tol` of the curve. Uniform steps per
// cubic from the flatness bound: |B″| ≤ 6·max|Δ²P| and the chord error of
// n steps is ≤ |B″|/(8n²), so n = ⌈√(6·max|Δ²P| / 8·tol)⌉.
function flatten(
  input: IconInput,
  tol: number,
): { lines: Float64Array[]; closed: boolean[] } {
  const lines: Float64Array[] = [];
  const closed: boolean[] = [];
  for (const { pts, closed: c } of iconToCubics(input)) {
    const out: number[] = [pts[0], pts[1]];
    for (let i = 0; i + 7 < pts.length; i += 6) {
      const x0 = pts[i];
      const y0 = pts[i + 1];
      const x1 = pts[i + 2];
      const y1 = pts[i + 3];
      const x2 = pts[i + 4];
      const y2 = pts[i + 5];
      const x3 = pts[i + 6];
      const y3 = pts[i + 7];
      const dd = Math.max(
        Math.hypot(x0 - 2 * x1 + x2, y0 - 2 * y1 + y2),
        Math.hypot(x1 - 2 * x2 + x3, y1 - 2 * y2 + y3),
      );
      const k = Math.min(128, Math.max(1, Math.ceil(Math.sqrt((6 * dd) / (8 * tol)))));
      for (let s = 1; s <= k; s++) {
        const t = s / k;
        const u = 1 - t;
        out.push(
          u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
          u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
        );
      }
    }
    lines.push(Float64Array.from(out));
    closed.push(c);
  }
  return { lines, closed };
}

// Element paint → parts. A stroke icon (the historical contract) strokes
// every element; a fill icon reads each element's own fill/stroke attrs
// (svgToIcon stamps the inherited ones), defaulting to a fill — the SVG
// default paint — when an element declares neither.
function partsOf(input: IconInput, width: number, tol: number): Part[] {
  if (typeof input === "string") {
    return [{ ...flatten(input, tol), half: width / 2, fill: 0 }];
  }
  const fillIcon = paintOf(input) === "fill";
  const parts: Part[] = [];
  for (const el of input) {
    const a: IconNodeAttrs = el[1];
    if (translucent(a)) continue; // a duotone layer (core/region.ts)
    const strokeOn = fillIcon
      ? painted(a.stroke)
      : a.stroke === undefined || painted(a.stroke);
    const fillOn = fillIcon && (painted(a.fill) || (a.fill === undefined && !strokeOn));
    if (!strokeOn && !fillOn) continue;
    parts.push({
      ...flatten([el], tol),
      half: strokeOn ? num(a["stroke-width"], width) / 2 : 0,
      fill: fillOn ? (String(a["fill-rule"] ?? "").trim() === "evenodd" ? 2 : 1) : 0,
    });
  }
  return parts;
}

interface Grid {
  x0: number;
  y0: number;
  h: number;
  nx: number;
  ny: number;
}

// Calls fn(i, j, x, y) for every node within r of segment ab's bbox.
function eachNear(
  g: Grid,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  r: number,
  fn: (k: number, x: number, y: number) => void,
): void {
  const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - r - g.x0) / g.h));
  const i1 = Math.min(g.nx - 1, Math.ceil((Math.max(ax, bx) + r - g.x0) / g.h));
  const j0 = Math.max(0, Math.floor((Math.min(ay, by) - r - g.y0) / g.h));
  const j1 = Math.min(g.ny - 1, Math.ceil((Math.max(ay, by) + r - g.y0) / g.h));
  for (let j = j0; j <= j1; j++) {
    const y = g.y0 + j * g.h;
    for (let i = i0; i <= i1; i++) fn(j * g.nx + i, g.x0 + i * g.h, y);
  }
}

// Segments of a polyline, closing it when asked: fn(ax, ay, bx, by).
function eachSeg(
  p: Float64Array,
  close: boolean,
  fn: (ax: number, ay: number, bx: number, by: number) => void,
): void {
  const n = p.length / 2;
  if (n === 1) fn(p[0], p[1], p[0], p[1]); // a dot still paints its cap
  for (let i = 0; i + 1 < n; i++) fn(p[2 * i], p[2 * i + 1], p[2 * i + 2], p[2 * i + 3]);
  if (close && n > 2) fn(p[2 * n - 2], p[2 * n - 1], p[0], p[1]);
}

// The union field: min over every part of its signed distance.
function field(parts: Part[], g: Grid): Float32Array {
  const F = new Float32Array(g.nx * g.ny).fill(BIG);
  const band = 2 * g.h;
  let D: Float32Array | null = null;
  for (const part of parts) {
    if (part.half > 0) {
      const r = part.half + band;
      part.lines.forEach((p, li) => {
        eachSeg(p, part.closed[li], (ax, ay, bx, by) =>
          eachNear(g, ax, ay, bx, by, r, (k, x, y) => {
            const d = distSeg(x, y, ax, ay, bx, by) - part.half;
            if (d < F[k]) F[k] = d;
          }),
        );
      });
    }
    if (part.fill) {
      // |distance| in a narrow band around the boundary…
      D ??= new Float32Array(g.nx * g.ny);
      const Dm = D;
      Dm.fill(BIG);
      for (const p of part.lines)
        eachSeg(p, true, (ax, ay, bx, by) =>
          eachNear(g, ax, ay, bx, by, band, (k, x, y) => {
            const d = distSeg(x, y, ax, ay, bx, by);
            if (d < Dm[k]) Dm[k] = d;
          }),
        );
      // …signed by the element's fill rule, one scanline per grid row.
      const xs: number[] = [];
      const ws: number[] = [];
      for (let j = 0; j < g.ny; j++) {
        const y = g.y0 + j * g.h;
        const cross: Array<[number, number]> = [];
        for (const p of part.lines)
          eachSeg(p, true, (ax, ay, bx, by) => {
            if (ay <= y !== by <= y)
              cross.push([ax + ((y - ay) * (bx - ax)) / (by - ay), by > ay ? 1 : -1]);
          });
        cross.sort((u, v) => u[0] - v[0]);
        xs.length = 0;
        ws.length = 0;
        for (const [x, w] of cross) {
          xs.push(x);
          ws.push(w);
        }
        let c = 0;
        let wind = 0;
        for (let i = 0; i < g.nx; i++) {
          const x = g.x0 + i * g.h;
          while (c < xs.length && xs[c] < x) wind += ws[c++];
          const isIn = part.fill === 1 ? wind !== 0 : (wind & 1) === 1;
          const k = j * g.nx + i;
          const v = isIn ? -Dm[k] : Dm[k];
          if (v < F[k]) F[k] = v;
        }
      }
    }
  }
  return F;
}

// Marching squares on F < 0, chained into closed loops. Each crossing lives
// on a grid edge (key: 2·node + 0 horizontal / 1 vertical) and is shared by
// exactly the two segments of the cells on either side.
function trace(F: Float32Array, g: Grid): Float64Array[] {
  const { nx, ny, h, x0, y0 } = g;
  const pt = new Map<number, [number, number]>();
  const crossing = (key: number): number => {
    if (pt.has(key)) return key;
    const node = key >> 1;
    const i = node % nx;
    const j = (node - i) / nx;
    const other = key & 1 ? node + nx : node + 1;
    const fa = F[node];
    // Kept off the nodes: a shape edge through a node (integer coordinates
    // land on the grid) would put crossings of two contours on one point.
    const t = Math.min(Math.max(fa / (fa - F[other]), 1e-5), 1 - 1e-5);
    pt.set(
      key,
      key & 1 ? [x0 + i * h, y0 + (j + t) * h] : [x0 + (i + t) * h, y0 + j * h],
    );
    return key;
  };
  const adj = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    const ka = crossing(a);
    const kb = crossing(b);
    const la = adj.get(ka);
    if (la) la.push(kb);
    else adj.set(ka, [kb]);
    const lb = adj.get(kb);
    if (lb) lb.push(ka);
    else adj.set(kb, [ka]);
  };
  for (let j = 0; j + 1 < ny; j++) {
    for (let i = 0; i + 1 < nx; i++) {
      const a = j * nx + i; // top-left, then clockwise: b, c, d
      const b = a + 1;
      const c = a + nx + 1;
      const d = a + nx;
      const ia = F[a] < 0;
      const ib = F[b] < 0;
      const ic = F[c] < 0;
      const id = F[d] < 0;
      const top = 2 * a;
      const right = 2 * b + 1;
      const bottom = 2 * d;
      const left = 2 * a + 1;
      const edges: number[] = [];
      if (ia !== ib) edges.push(top);
      if (ib !== ic) edges.push(right);
      if (id !== ic) edges.push(bottom);
      if (ia !== id) edges.push(left);
      if (edges.length === 2) link(edges[0], edges[1]);
      else if (edges.length === 4) {
        // Saddle: the cell centre decides which diagonal is connected.
        const centre = (F[a] + F[b] + F[c] + F[d]) / 4 < 0;
        if (centre === ia) {
          link(top, right); // b and d are cut off
          link(bottom, left);
        } else {
          link(left, top); // a and c are cut off
          link(right, bottom);
        }
      }
    }
  }
  const loops: Float64Array[] = [];
  const seen = new Set<number>();
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const ring: number[] = [];
    let prev = -1;
    let cur = start;
    while (!seen.has(cur)) {
      seen.add(cur);
      const p = pt.get(cur) as [number, number];
      ring.push(p[0], p[1]);
      const nb = adj.get(cur) as number[];
      const next = nb[0] !== prev ? nb[0] : nb[1];
      prev = cur;
      cur = next;
    }
    if (ring.length >= 6) loops.push(Float64Array.from(ring));
  }
  return loops;
}

// Ramer–Douglas–Peucker over an open run [i0..i1] of a ring.
function rdp(
  p: Float64Array,
  i0: number,
  i1: number,
  tol: number,
  keep: Uint8Array,
): void {
  const n = p.length / 2;
  const ax = p[2 * (i0 % n)];
  const ay = p[2 * (i0 % n) + 1];
  const bx = p[2 * (i1 % n)];
  const by = p[2 * (i1 % n) + 1];
  let worst = -1;
  let wd = tol;
  for (let i = i0 + 1; i < i1; i++) {
    const d = distSeg(p[2 * (i % n)], p[2 * (i % n) + 1], ax, ay, bx, by);
    if (d > wd) {
      wd = d;
      worst = i;
    }
  }
  if (worst < 0) return;
  keep[worst % n] = 1;
  rdp(p, i0, worst, tol, keep);
  rdp(p, worst, i1, tol, keep);
}

function simplify(p: Float64Array, tol: number): Float64Array {
  const n = p.length / 2;
  if (n < 4) return p;
  // Split the ring at vertex 0 and its farthest vertex, RDP both halves.
  let far = 0;
  let fd = -1;
  for (let i = 1; i < n; i++) {
    const d = Math.hypot(p[2 * i] - p[0], p[2 * i + 1] - p[1]);
    if (d > fd) {
      fd = d;
      far = i;
    }
  }
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[far] = 1;
  rdp(p, 0, far, tol, keep);
  rdp(p, far, n, tol, keep);
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(p[2 * i], p[2 * i + 1]);
  return Float64Array.from(out);
}

// Sharp corners: marching squares chops a corner into one to three short
// segments between two long straight ones. Rebuild it as the intersection
// of the two straight lines when it lies right there.
function recoverCorners(p: Float64Array, h: number): Float64Array {
  const n = p.length / 2;
  if (n < 4) return p;
  const len = (k: number) => {
    const a = k % n;
    const b = (k + 1) % n;
    return Math.hypot(p[2 * b] - p[2 * a], p[2 * b + 1] - p[2 * a + 1]);
  };
  const long: number[] = [];
  for (let k = 0; k < n; k++) if (len(k) >= 2.5 * h) long.push(k);
  if (long.length < 2) return p;
  const drop = new Uint8Array(n);
  const moved = new Map<number, [number, number]>();
  for (let q = 0; q < long.length; q++) {
    const k1 = long[q];
    const k2 = long[(q + 1) % long.length];
    const gap = (k2 - k1 - 1 + n) % n; // short segments in between
    if (gap < 1 || gap > 3) continue;
    let gl = 0;
    for (let s = 1; s <= gap; s++) gl += len(k1 + s);
    if (gl > 3 * h) continue;
    const a0 = k1 % n;
    const a1 = (k1 + 1) % n;
    const b0 = k2 % n;
    const b1 = (k2 + 1) % n;
    const d1x = p[2 * a1] - p[2 * a0];
    const d1y = p[2 * a1 + 1] - p[2 * a0 + 1];
    const d2x = p[2 * b1] - p[2 * b0];
    const d2y = p[2 * b1 + 1] - p[2 * b0 + 1];
    const cr = d1x * d2y - d1y * d2x;
    const ang = Math.abs(Math.atan2(cr, d1x * d2x + d1y * d2y));
    if (ang < Math.PI / 12) continue;
    const t =
      ((p[2 * b0] - p[2 * a0]) * d2y - (p[2 * b0 + 1] - p[2 * a0 + 1]) * d2x) / cr;
    const X: [number, number] = [p[2 * a0] + t * d1x, p[2 * a0 + 1] + t * d1y];
    const mx = (p[2 * a1] + p[2 * b0]) / 2;
    const my = (p[2 * a1 + 1] + p[2 * b0 + 1]) / 2;
    if (Math.hypot(X[0] - mx, X[1] - my) > 2 * h) continue;
    // Gap vertices are k1+1 … k2: the first becomes the corner, the rest go.
    moved.set(a1, X);
    for (let s = 2; s <= gap + 1; s++) drop[(k1 + s) % n] = 1;
  }
  if (moved.size === 0) return p;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (drop[i]) continue;
    const m = moved.get(i);
    if (m) out.push(m[0], m[1]);
    else out.push(p[2 * i], p[2 * i + 1]);
  }
  return Float64Array.from(out);
}

const fmt = (v: number): string => String(Math.round(v * 1000) / 1000);

/** Contours of the visible surface: closed, non-overlapping, outers
 *  positive / holes negative (nesting depth decides which is which). */
export function regionContours(
  input: IconInput,
  options?: RegionOptions,
): Float64Array[] {
  const h = options?.cell ?? 0.125;
  const parts = partsOf(input, options?.strokeWidth ?? 2, 0.004);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let pad = 0;
  for (const part of parts) {
    pad = Math.max(pad, part.half);
    for (const p of part.lines)
      for (let i = 0; i < p.length; i += 2) {
        minX = Math.min(minX, p[i]);
        maxX = Math.max(maxX, p[i]);
        minY = Math.min(minY, p[i + 1]);
        maxY = Math.max(maxY, p[i + 1]);
      }
  }
  if (!(maxX >= minX)) return [];
  pad += 3 * h;
  const g: Grid = {
    x0: minX - pad,
    y0: minY - pad,
    h,
    nx: Math.ceil((maxX - minX + 2 * pad) / h) + 1,
    ny: Math.ceil((maxY - minY + 2 * pad) / h) + 1,
  };
  const loops = trace(field(parts, g), g).filter((l) => Math.abs(signedArea(l)) > 0.01);
  return loops.map((l) => {
    // Contours neither cross nor touch (see trace): any vertex nests.
    let depth = 0;
    for (const o of loops) if (o !== l && inside(l[0], l[1], o)) depth++;
    const hole = depth % 2 === 1;
    const oriented = signedArea(l) > 0 === !hole ? l : reversePts(l);
    return recoverCorners(simplify(oriented, h * 0.08), h);
  });
}

/** Any icon → its canonical region: one `<path>` (nonzero) whose contours
 *  are the visible surface. Idempotent on regions. Stroke icons outline at
 *  `strokeWidth` (round caps and joins — Lucide, Tabler, Feather,
 *  Heroicons outline); fill icons honor each element's fill rule. */
export function toRegion(input: IconInput, options?: RegionOptions): IconNode {
  if (isRegion(input)) return input as IconNode;
  let d = "";
  for (const p of regionContours(input, options)) {
    d += `M${fmt(p[0])} ${fmt(p[1])}`;
    for (let i = 2; i < p.length; i += 2) d += `L${fmt(p[i])} ${fmt(p[i + 1])}`;
    d += "Z";
  }
  if (!d) throw new Error("morphicons: icon has no visible surface");
  return [
    [
      "path",
      {
        d,
        fill: "currentColor",
        stroke: "none",
        "fill-rule": "nonzero",
        [REGION_ATTR]: "1",
      },
    ],
  ];
}

// ---------------------------------------------------------------------------
// Driver hooks: what createMorph calls once this chunk is loaded. Region
// forms, their samples and rest→target plans are cached by reference here,
// not in the driver, so stroke-only apps don't carry any of it. A module
// passed to setRegionLoader must provide these three.

const forms = new WeakMap<IconNode, Map<number, IconNode>>();
// By content too, bounded (least recently used out): strings, and icons
// rebuilt on every render (`icon={[["path", {…}]]}`), which a WeakMap
// never hits. Same content → same region object → its samples and plans
// are reused as well.
const byContent = new Map<string, IconNode>();
const samples = new WeakMap<IconNode, Sampled[]>();
const plans = new WeakMap<IconNode, WeakMap<IconNode, MorphPlan>>();

/** The region the driver draws for an icon (cached): a stroke icon
 *  outlined at the element's stroke width, a fill icon as is. */
export function regionOf(icon: IconInput, strokeWidth: number): IconNode {
  if (isRegion(icon)) return icon as IconNode;
  // a fill icon ignores the width (one form for every width), unless one of
  // its elements strokes at the width it inherits (Iconoir: dot + outline)
  const width =
    paintOf(icon) === "fill" &&
    !(icon as IconNode).some(
      ([, a]) => painted(a.stroke) && a["stroke-width"] === undefined,
    )
      ? 0
      : strokeWidth;
  let byWidth = typeof icon === "string" ? undefined : forms.get(icon);
  let r = byWidth?.get(width);
  if (r) return r;
  const key = `${width}|${typeof icon === "string" ? icon : JSON.stringify(icon)}`;
  r = byContent.get(key);
  if (r)
    byContent.delete(key); // re-inserted below: most recent
  else r = toRegion(icon, { strokeWidth });
  byContent.set(key, r);
  if (byContent.size > 64) byContent.delete(byContent.keys().next().value as string);
  if (typeof icon !== "string") {
    if (!byWidth) {
      byWidth = new Map();
      forms.set(icon, byWidth);
    }
    byWidth.set(width, r);
  }
  return r;
}

function sampledOf(region: IconNode): Sampled[] {
  let s = samples.get(region);
  if (!s) {
    s = resampleRegion(region);
    samples.set(region, s);
  }
  return s;
}

/** Region plan from `src` at rest to `dst` (cached by reference). */
export function regionPlan(
  src: IconInput,
  dst: IconInput,
  strokeWidth: number,
): MorphPlan {
  const a = regionOf(src, strokeWidth);
  const b = regionOf(dst, strokeWidth);
  let inner = plans.get(a);
  if (!inner) {
    inner = new WeakMap();
    plans.set(a, inner);
  }
  let p = inner.get(b);
  if (!p) {
    p = buildRegionPlan(sampledOf(a), sampledOf(b));
    inner.set(b, p);
  }
  return p;
}

/** Region plan from the shape in flight to `dst` (never cached): region
 *  samples as they are, or a centerline `d` (a stroke morph interrupted
 *  toward a fill icon), outlined as it is. */
export function regionPlanFrom(
  shape: Sampled[] | string,
  dst: IconInput,
  strokeWidth: number,
): MorphPlan {
  const a =
    typeof shape === "string" ? resampleRegion(regionOf(shape, strokeWidth)) : shape;
  return buildRegionPlan(a, sampledOf(regionOf(dst, strokeWidth)));
}

export { isRegion, type Paint, paintOf } from "../core/region";
export { buildRegionPlan, resampleRegion };

// The driver re-runs this chunk as a module script under a fresh URL when
// an import() of it failed (Chromium caches that failure for the
// document's life, src/dom/index.ts): this is how it gets the hooks back.
(globalThis as Record<symbol, unknown>)[Symbol.for("morphicons.region")] = {
  regionOf,
  regionPlan,
  regionPlanFrom,
};
