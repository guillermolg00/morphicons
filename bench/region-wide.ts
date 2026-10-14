/* Wide robustness check of the region pipeline (dev only). The planner's
   heuristics were tuned on the 318 vendored icons; this runs them over a
   deterministic seeded sample of the full Iconify sets installed as devDeps
   (~53k icons) and reports:

   1. normalize robustness: toRegion throws / NaN / empty, non-canonical
      winding, resample fidelity, time per icon;
   2. pre-chunk rest correctness (fill icons): what ships (restAttrs, the
      closest single look) vs the region; then the old model (canonicalD
      under restRule) with the cause of each mismatch found by counterfactual
      renders (each one fixes one cause; the largest IoU gain wins);
   3. region fidelity vs an independent ground truth (pure-fill icons: each
      element rasterized alone with its own rule, union), IoU at R=96 / 192
      and the boundary deviation seen at R=192;
   4. topology over seeded random pairs (≥ one fill side), the checks of
      bench/region-topology.ts: endpoints, mid-flight leaks, NaN, plan time.

     bun bench/region-wide.ts [perSet=300] [pairs=3000] [seed=1]
     bun bench/region-wide.ts --dump set:name [set:name …]
       → /tmp/region-wide/<set>-<name>.{svg,txt,png} (png panels: pre-chunk
         rest · region · per-element truth · rest vs region diff) */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { svgToIcon } from "../src/adapters/index";
import { allocOutputs, interpPolar } from "../src/core/interpolate";
import { iconToCubics } from "../src/core/normalize";
import { paintOf, signedArea } from "../src/core/region";
import type { IconInput, IconNode, IconNodeAttrs, Sampled } from "../src/core/types";
import { canonicalD, restAttrs } from "../src/dom/index";
import { buildRegionPlan, resampleRegion, toRegion } from "../src/region/index";

const ROOT = resolve(import.meta.dir, "..");
const SET_NAMES = [
  "bi",
  "heroicons",
  "iconoir",
  "lucide",
  "material-symbols",
  "mdi",
  "mingcute",
  "ph",
  "ri",
  "tabler",
];

const argv = process.argv.slice(2);
const dumpAt = argv.findIndex((a) => a === "--dump" || a === "--pair");
const pairMode = argv[dumpAt] === "--pair";
const dumpIds = dumpAt >= 0 ? argv.slice(dumpAt + 1) : [];
const nums = (dumpAt >= 0 ? argv.slice(0, dumpAt) : argv).map(Number);
const PER_SET = nums[0] || 300;
const N_PAIRS = nums[1] || 3000;
const SEED = nums[2] || 1;

const T0 = performance.now();
const progress = (msg: string) =>
  console.error(`[${((performance.now() - T0) / 1000).toFixed(1)}s] ${msg}`);

const q = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))];
};
const f3 = (v: number) => v.toFixed(3);
const f4 = (v: number) => v.toFixed(4);
const pct = (a: number, b: number) => `${((100 * a) / Math.max(1, b)).toFixed(1)}%`;

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32)

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Geometry → pixels. Scanline winding over [0,24]² at R×R, pixel centers at
// (c + PX, r + PY)·24/R: off-lattice and DIFFERENT per axis, so 45° edges
// don't run through pixel centers (bench/region-topology.ts).

// A single phase still resonates with SOME icons: at R=96 the topology
// bench's phase has PX−PY = 0.2469 px, which puts a row of pixel centers
// 0.0008 units off bi:x's 45° edges — any sub-pixel deviation of the
// region flips the whole diagonal row (IoU 0.956 for a region that is
// within 0.002 of the truth). Fidelity IoUs are therefore the MEDIAN over
// three phases with different resonances; the first is the bench's.
const PHASES: Array<[number, number]> = [
  [0.618, 0.3711],
  [0.1312, 0.7277],
  [0.4423, 0.0891],
];
let PX = PHASES[0][0];
let PY = PHASES[0][1];
// Runs fn once per phase (module-level PX/PY: a dev script).
function phased<T>(fn: () => T): T[] {
  const r = PHASES.map(([x, y]) => {
    PX = x;
    PY = y;
    return fn();
  });
  [PX, PY] = PHASES[0];
  return r;
}
const med = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];

type Polys = Float64Array[];

// Cubic subpaths → polylines within tol (same flatness bound as the
// normalizer). Every polyline is treated as closed by the fill rasterizer
// (SVG fill closes open subpaths implicitly).
function flatten(input: IconInput, tol = 0.005): { polys: Polys; closed: boolean[] } {
  const polys: Polys = [];
  const closed: boolean[] = [];
  for (const { pts, closed: c } of iconToCubics(input)) {
    const out: number[] = [pts[0], pts[1]];
    for (let i = 0; i + 7 < pts.length; i += 6) {
      const [x0, y0, x1, y1, x2, y2, x3, y3] = pts.subarray(i, i + 8);
      const dd = Math.max(
        Math.hypot(x0 - 2 * x1 + x2, y0 - 2 * y1 + y2),
        Math.hypot(x1 - 2 * x2 + x3, y1 - 2 * y2 + y3),
      );
      const k = Math.min(256, Math.max(1, Math.ceil(Math.sqrt((6 * dd) / (8 * tol)))));
      for (let s = 1; s <= k; s++) {
        const t = s / k;
        const u = 1 - t;
        out.push(
          u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
          u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
        );
      }
    }
    polys.push(Float64Array.from(out));
    closed.push(c);
  }
  return { polys, closed };
}

/** Per-pixel winding number (edges bucketed per row: O(crossings)). Same
 *  sign convention as bench/region-topology.ts: outers (signedArea > 0)
 *  wind +1, holes −1. */
function winding(polys: readonly Float64Array[], R: number): Int16Array {
  const S = R / 24;
  const xs: number[][] = [];
  const ds: number[][] = [];
  for (let r = 0; r < R; r++) {
    xs.push([]);
    ds.push([]);
  }
  for (const p of polys) {
    const n = p.length / 2;
    if (n < 2) continue;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xj = p[2 * j];
      const yj = p[2 * j + 1];
      const xi = p[2 * i];
      const yi = p[2 * i + 1];
      if (!(yi !== yj)) continue; // horizontal or NaN
      const lo = yi < yj ? yi : yj;
      const hi = yi < yj ? yj : yi;
      const r0 = Math.max(0, Math.ceil(lo * S - PY));
      const r1 = Math.min(R, Math.ceil(hi * S - PY));
      const d = yi > yj ? -1 : 1;
      const k = (xi - xj) / (yi - yj);
      for (let r = r0; r < r1; r++) {
        xs[r].push(xj + ((r + PY) / S - yj) * k);
        ds[r].push(d);
      }
    }
  }
  const wn = new Int16Array(R * R);
  for (let r = 0; r < R; r++) {
    const x = xs[r];
    if (x.length < 2) continue;
    const d = ds[r];
    const o = x.map((_, k) => k).sort((a, b) => x[a] - x[b]);
    let w = 0;
    for (let k = 0; k < o.length - 1; k++) {
      w += d[o[k]];
      if (w === 0) continue;
      const c0 = Math.max(0, Math.ceil(x[o[k]] * S - PX));
      const c1 = Math.min(R, Math.ceil(x[o[k + 1]] * S - PX));
      if (c1 > c0) wn.fill(w, r * R + c0, r * R + c1);
    }
  }
  return wn;
}

type Rule = "nonzero" | "evenodd";
function ruled(wn: Int16Array, rule: Rule): Uint8Array {
  const o = new Uint8Array(wn.length);
  if (rule === "evenodd") for (let k = 0; k < wn.length; k++) o[k] = wn[k] & 1;
  else for (let k = 0; k < wn.length; k++) o[k] = wn[k] !== 0 ? 1 : 0;
  return o;
}
const raster = (polys: readonly Float64Array[], R: number, rule: Rule = "nonzero") =>
  ruled(winding(polys, R), rule);

// Round-capped, round-joined stroke of polylines, OR-ed into `into`.
function strokeInto(
  polys: Polys,
  closed: boolean[],
  half: number,
  R: number,
  into: Uint8Array,
): void {
  const S = R / 24;
  const seg = (ax: number, ay: number, bx: number, by: number) => {
    const c0 = Math.max(0, Math.ceil((Math.min(ax, bx) - half) * S - PX));
    const c1 = Math.min(R - 1, Math.floor((Math.max(ax, bx) + half) * S - PX));
    const r0 = Math.max(0, Math.ceil((Math.min(ay, by) - half) * S - PY));
    const r1 = Math.min(R - 1, Math.floor((Math.max(ay, by) + half) * S - PY));
    const dx = bx - ax;
    const dy = by - ay;
    const l2 = dx * dx + dy * dy;
    for (let r = r0; r <= r1; r++) {
      const y = (r + PY) / S;
      for (let c = c0; c <= c1; c++) {
        const x = (c + PX) / S;
        let t = l2 > 0 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = x - ax - t * dx;
        const ey = y - ay - t * dy;
        if (ex * ex + ey * ey <= half * half) into[r * R + c] = 1;
      }
    }
  };
  polys.forEach((p, li) => {
    const n = p.length / 2;
    if (n === 1) seg(p[0], p[1], p[0], p[1]);
    for (let i = 0; i + 1 < n; i++)
      seg(p[2 * i], p[2 * i + 1], p[2 * i + 2], p[2 * i + 3]);
    if (closed[li] && n > 2) seg(p[2 * n - 2], p[2 * n - 1], p[0], p[1]);
  });
}

function or(a: Uint8Array, b: Uint8Array): Uint8Array {
  const o = new Uint8Array(a.length);
  for (let k = 0; k < a.length; k++) o[k] = a[k] | b[k];
  return o;
}
function iou(a: Uint8Array, b: Uint8Array): number {
  let i = 0;
  let u = 0;
  for (let k = 0; k < a.length; k++) {
    i += a[k] & b[k];
    u += a[k] | b[k];
  }
  return u ? i / u : 1;
}
const inkOf = (a: Uint8Array) => a.reduce((s, v) => s + v, 0);
const hasNaN = (ps: readonly Float64Array[]) => ps.some((p) => p.some(Number.isNaN));

// Segment buckets (1-unit cells over [-4, 28]²) for distance-to-boundary.
const BMIN = -4;
const BN = 32;
function segIndex(polys: Polys): { segs: number[]; cells: number[][] } {
  const segs: number[] = [];
  const cells: number[][] = Array.from({ length: BN * BN }, () => []);
  const cl = (v: number) => Math.min(BN - 1, Math.max(0, Math.floor(v - BMIN)));
  for (const p of polys) {
    const n = p.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const s = segs.length / 4;
      segs.push(p[2 * j], p[2 * j + 1], p[2 * i], p[2 * i + 1]);
      for (
        let cy = cl(Math.min(p[2 * j + 1], p[2 * i + 1]));
        cy <= cl(Math.max(p[2 * j + 1], p[2 * i + 1]));
        cy++
      )
        for (
          let cx = cl(Math.min(p[2 * j], p[2 * i]));
          cx <= cl(Math.max(p[2 * j], p[2 * i]));
          cx++
        )
          cells[cy * BN + cx].push(s);
    }
  }
  return { segs, cells };
}
// Distance from (x, y) to the nearest indexed segment, capped at `cap`.
function distTo(ix: ReturnType<typeof segIndex>, x: number, y: number, cap = 3): number {
  const cx = Math.floor(x - BMIN);
  const cy = Math.floor(y - BMIN);
  const rad = Math.ceil(cap);
  let best = cap;
  for (let j = Math.max(0, cy - rad); j <= Math.min(BN - 1, cy + rad); j++)
    for (let i = Math.max(0, cx - rad); i <= Math.min(BN - 1, cx + rad); i++)
      for (const s of ix.cells[j * BN + i]) {
        const ax = ix.segs[4 * s];
        const ay = ix.segs[4 * s + 1];
        const dx = ix.segs[4 * s + 2] - ax;
        const dy = ix.segs[4 * s + 3] - ay;
        const l2 = dx * dx + dy * dy;
        let t = l2 > 0 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const d = Math.hypot(x - ax - t * dx, y - ay - t * dy);
        if (d < best) best = d;
      }
  return best;
}

// ---------------------------------------------------------------------------
// Element paint, as src/region/index.ts partsOf reads it on a fill icon, and
// the fill rule the driver painted the rest with before it wound evenodd
// elements for nonzero (kept as the base of the counterfactual breakdown).

const painted = (v: unknown): boolean =>
  v !== undefined && String(v).trim().toLowerCase() !== "none";
const num = (v: unknown, fallback: number): number => {
  const x = typeof v === "number" ? v : Number.parseFloat(String(v ?? ""));
  return Number.isFinite(x) ? x : fallback;
};
const restRule = (icon: IconNode): Rule =>
  icon.every(([, a]) => String(a["fill-rule"] ?? "").trim() === "evenodd")
    ? "evenodd"
    : "nonzero";

interface El {
  polys: Polys;
  closed: boolean[];
  trans: boolean; // duotone layer (dropped by the region)
  fillOn: boolean;
  strokeOn: boolean;
  half: number;
  rule: Rule;
}
function elementsOf(icon: IconNode): El[] {
  return icon.map((el) => {
    const a: IconNodeAttrs = el[1];
    const strokeOn = painted(a.stroke);
    return {
      ...flatten([el]),
      trans: num(a.opacity, 1) < 0.5 || num(a["fill-opacity"], 1) < 0.5,
      strokeOn,
      fillOn: painted(a.fill) || (a.fill === undefined && !strokeOn),
      half: num(a["stroke-width"], 2) / 2,
      rule: String(a["fill-rule"] ?? "").trim() === "evenodd" ? "evenodd" : "nonzero",
    };
  });
}

// ---------------------------------------------------------------------------
// Sample

interface Entry {
  set: string;
  name: string;
  id: string;
  markup: string;
  vbScale: number;
  hasTransform: boolean;
}

function loadSet(set: string): { entries: Entry[]; all: string[] } {
  const j = JSON.parse(
    readFileSync(join(ROOT, "node_modules/@iconify-json", set, "icons.json"), "utf8"),
  );
  const all = Object.keys(j.icons)
    .filter((n) => !j.icons[n].hidden)
    .sort();
  const entry = (name: string): Entry => {
    const ic = j.icons[name];
    // playground/extract-region-icons.mjs; Iconify's left/top default to 0
    const w = ic.width ?? j.width ?? 16;
    const h = ic.height ?? j.height ?? 16;
    return {
      set,
      name,
      id: `${set}:${name}`,
      markup: `<svg viewBox="${ic.left ?? 0} ${ic.top ?? 0} ${w} ${h}">${ic.body}</svg>`,
      vbScale: Math.min(24 / w, 24 / h),
      hasTransform: /transform=/.test(ic.body),
    };
  };
  return { entries: all.map(entry), all };
}

interface Icon {
  e: Entry;
  icon: IconInput;
  fill: boolean;
  sw: number;
  region: IconNode;
  regionPolys: Polys;
  s: Sampled[];
  r96: Uint8Array; // raster of the samples (topology reference)
}

// ---------------------------------------------------------------------------
// PNG dump (sanity checks by eye)

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(b: Uint8Array): number {
  let c = -1;
  for (const v of b) c = CRC[(c ^ v) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function png(w: number, h: number, rgb: Uint8Array): Buffer {
  const raw = Buffer.alloc((3 * w + 1) * h);
  for (let y = 0; y < h; y++)
    raw.set(rgb.subarray(3 * w * y, 3 * w * (y + 1)), y * (3 * w + 1) + 1);
  const chunk = (type: string, data: Uint8Array) => {
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", new Uint8Array(0)),
  ]);
}
// Panels side by side; a panel is a mask (black ink) or a 2-mask diff
// (red: only in the first, blue: only in the second, black: both).
function panels(R: number, list: Array<Uint8Array | [Uint8Array, Uint8Array]>): Buffer {
  const W = list.length * (R + 4);
  const rgb = new Uint8Array(W * R * 3).fill(255);
  list.forEach((p, i) => {
    for (let r = 0; r < R; r++)
      for (let c = 0; c < R; c++) {
        const k = r * R + c;
        const o = 3 * (r * W + i * (R + 4) + c);
        let col = [255, 255, 255];
        if (p instanceof Uint8Array) {
          if (p[k]) col = [0, 0, 0];
        } else if (p[0][k] && p[1][k]) col = [0, 0, 0];
        else if (p[0][k]) col = [230, 30, 30];
        else if (p[1][k]) col = [30, 60, 230];
        rgb.set(col, o);
      }
    for (let r = 0; r < R; r++)
      rgb.set([200, 200, 200], 3 * (r * W + i * (R + 4) + R + 1));
  });
  return png(W, R, rgb);
}

// ---------------------------------------------------------------------------
// Pre-chunk rest analysis of one fill icon at resolution R.

interface RestResult {
  iou: number;
  shipped: number; // IoU vs region of what ships: restAttrs's closest look
  steps: number[]; // IoU vs region after each counterfactual fix: M0..M4
  gains: Record<"d" | "c" | "b" | "a", number>;
  cause: string;
  M0: Uint8Array;
  M4: Uint8Array;
  T: Uint8Array;
}

const CAUSE_NAMES: Record<string, string> = {
  a: "(a) overlapping elements cancel (opposite winding / evenodd XOR)",
  b: "(b) mixed fill rules (evenodd elements painted nonzero)",
  c: "(c) stroked elements painted as fill",
  d: "(d) translucent duotone layer painted opaque",
  e: "(e) other (canonical ≈ per-element truth; region differs)",
};

function restMasks(
  ic: Icon,
  R: number,
): { steps: number[]; M0: Uint8Array; M4: Uint8Array; T: Uint8Array } {
  const icon = ic.icon as IconNode;
  const rule = restRule(icon);
  const els = elementsOf(icon);
  const T = raster(ic.regionPolys, R);
  // M0: the old rest: ONE merged d under the icon's own rule
  const M0 = raster(flatten(canonicalD(icon)).polys, R, rule);
  const vis = els.filter((e) => !e.trans);
  const strokes = new Uint8Array(R * R);
  for (const e of vis) if (e.strokeOn) strokeInto(e.polys, e.closed, e.half, R, strokes);
  // M1: translucent layers removed
  const M1 = raster(
    vis.flatMap((e) => e.polys),
    R,
    rule,
  );
  // M2: + only filled elements in the merge, strokes outlined
  const fills = vis.filter((e) => e.fillOn);
  const M2 = or(
    raster(
      fills.flatMap((e) => e.polys),
      R,
      rule,
    ),
    strokes,
  );
  // M3: + each rule group merged under its own rule
  const M3 = or(
    or(
      raster(
        fills.filter((e) => e.rule === "nonzero").flatMap((e) => e.polys),
        R,
        "nonzero",
      ),
      raster(
        fills.filter((e) => e.rule === "evenodd").flatMap((e) => e.polys),
        R,
        "evenodd",
      ),
    ),
    strokes,
  );
  // M4: + every element alone (union): the per-element truth
  let M4: Uint8Array = strokes;
  for (const e of fills) M4 = or(M4, raster(e.polys, R, e.rule));
  // Ms: what ships (restAttrs): the merged d under the closest single look
  const look = restAttrs(icon) ?? {};
  const merged = flatten(canonicalD(icon));
  let Ms =
    look.fill === "none"
      ? new Uint8Array(R * R)
      : raster(merged.polys, R, (look["fill-rule"] ?? "nonzero") as Rule);
  if (look.stroke === "inherit") {
    const s = new Uint8Array(R * R);
    strokeInto(merged.polys, merged.closed, ic.sw / 2, R, s);
    Ms = or(Ms, s);
  }
  return {
    steps: [M0, M1, M2, M3, M4].map((m) => iou(m, T)),
    shipped: iou(Ms, T),
    M0,
    M4,
    T,
  };
}

// Median over the sampling phases of every step, then the cause.
function restAnalysis(ic: Icon, R: number): RestResult {
  const runs = phased(() => restMasks(ic, R));
  const steps = runs[0].steps.map((_, i) => med(runs.map((r) => r.steps[i])));
  const { M0, M4, T } = runs[0];
  const gains = {
    d: steps[1] - steps[0],
    c: steps[2] - steps[1],
    b: steps[3] - steps[2],
    a: steps[4] - steps[3],
  };
  let cause = "e";
  let g = 0.002;
  for (const [k, v] of Object.entries(gains))
    if (v > g) {
      g = v;
      cause = k;
    }
  const shipped = med(runs.map((r) => r.shipped));
  return { iou: steps[0], shipped, steps, gains, cause, M0, M4, T };
}

// ---------------------------------------------------------------------------
// Dump mode

function normalize(e: Entry): Icon {
  const icon = svgToIcon(e.markup);
  const fill = paintOf(icon) === "fill";
  const m = /stroke-width="([\d.]+)"/.exec(e.markup);
  const sw = (m ? Number(m[1]) : 2) * e.vbScale;
  const region = toRegion(icon, { strokeWidth: sw });
  const s = resampleRegion(region);
  return {
    e,
    icon,
    fill,
    sw,
    region,
    regionPolys: flatten(region).polys,
    s,
    r96: raster(
      s.map((x) => x.pts),
      96,
    ),
  };
}

// Winding as a picture: positive black, negative (a hole painting) red.
function windingPanel(wn: Int16Array): [Uint8Array, Uint8Array] {
  const pos = new Uint8Array(wn.length);
  const neg = new Uint8Array(wn.length);
  for (let k = 0; k < wn.length; k++) {
    if (wn[k] > 0) pos[k] = 1;
    if (wn[k] < 0) neg[k] = 1;
  }
  return [neg, pos];
}

const entryCache = new Map<string, Entry[]>();
function findEntry(id: string): Entry | undefined {
  const [set, name] = id.split(":");
  if (!entryCache.has(set)) entryCache.set(set, loadSet(set).entries);
  return entryCache.get(set)?.find((x) => x.name === name);
}

if (dumpIds.length && pairMode) {
  // --pair a b [c d …]: frames t = 0, ⅛ … 1 at R=192 (red = negative
  // winding) + the plan's items, to tell a real leak from a checker artifact
  mkdirSync("/tmp/region-wide", { recursive: true });
  for (let i = 0; i + 1 < dumpIds.length; i += 2) {
    const ea = findEntry(dumpIds[i]);
    const eb = findEntry(dumpIds[i + 1]);
    if (!ea || !eb) {
      console.log(`${dumpIds[i]} / ${dumpIds[i + 1]}: not found`);
      continue;
    }
    const A = normalize(ea);
    const B = normalize(eb);
    const plan = buildRegionPlan(A.s, B.s);
    const o = allocOutputs(plan);
    const R = 192;
    const frames: Array<[Uint8Array, Uint8Array]> = [];
    const lines = [`${ea.id} → ${eb.id}: ${plan.items.length} items`];
    for (const t of [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1]) {
      interpPolar(plan, t, o);
      const wn = winding(o, R);
      let neg = 0;
      let ink = 0;
      for (const w of wn) {
        if (w < 0) neg++;
        if (w) ink++;
      }
      lines.push(`  t=${t}: neg ${pct(neg, ink)} of ink`);
      frames.push(windingPanel(wn));
    }
    plan.items.forEach((it, k) => {
      lines.push(
        `  item ${k}: ${it.hole ? "hole " : "outer"} θ=${it.theta.toFixed(3)} lnσ=${it.lnSigma.toFixed(3)} half=${it.half ?? "-"} block=${it.block ? "y" : "n"} area a=${signedArea(it.a).toFixed(2)} b=${signedArea(it.bO).toFixed(2)}`,
      );
    });
    const base = `/tmp/region-wide/pair-${ea.set}-${ea.name}--${eb.set}-${eb.name}`;
    writeFileSync(`${base}.png`, panels(R, frames));
    writeFileSync(`${base}.txt`, `${lines.join("\n")}\n`);
    console.log(`${base}.{png,txt}\n${lines.join("\n")}`);
  }
  process.exit(0);
}

if (dumpIds.length) {
  mkdirSync("/tmp/region-wide", { recursive: true });
  const cache = entryCache;
  for (const id of dumpIds) {
    const [set, name] = id.split(":");
    if (!cache.has(set)) cache.set(set, loadSet(set).entries);
    const e = cache.get(set)?.find((x) => x.name === name);
    if (!e) {
      console.log(`${id}: not found`);
      continue;
    }
    const base = `/tmp/region-wide/${set}-${name}`;
    writeFileSync(`${base}.svg`, e.markup);
    const ic = normalize(e);
    const R = 192;
    const lines = [`${id}  paint=${ic.fill ? "fill" : "stroke"}  sw=${ic.sw}`];
    if (ic.fill) {
      const icon = ic.icon as IconNode;
      const r = restAnalysis(ic, R);
      lines.push(
        `restRule=${restRule(icon)}  IoU(rest, region)=${r.iou.toFixed(4)}  cause=${r.cause}`,
        `steps M0..M4 = ${r.steps.map((v) => v.toFixed(4)).join(" ")}`,
        `IoU(region, per-element truth)=${r.steps[4].toFixed(4)} (median of phases)`,
        "elements:",
        ...icon.map(
          ([t, a]) =>
            `  <${t}> ${JSON.stringify({ ...a, d: undefined })} d=${String(a.d).slice(0, 200)}`,
        ),
        `canonicalD: ${canonicalD(icon)}`,
      );
      writeFileSync(`${base}.png`, panels(R, [r.M0, r.T, r.M4, [r.M0, r.T]]));
    } else {
      writeFileSync(`${base}.png`, panels(R, [raster(ic.regionPolys, R)]));
    }
    lines.push(`region d: ${ic.region[0][1].d}`);
    lines.push(
      `samples: ${ic.s.length} contours; IoU(samples, region) @192 = ${iou(
        raster(
          ic.s.map((x) => x.pts),
          R,
        ),
        raster(ic.regionPolys, R),
      ).toFixed(4)}`,
    );
    writeFileSync(`${base}.txt`, `${lines.join("\n")}\n`);
    console.log(`${base}.{svg,txt,png}\n  ${lines.slice(0, 4).join("\n  ")}`);
  }
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 1. Normalize robustness

const pick = rng(SEED);
const sample: Entry[] = [];
const population: Record<string, number> = {};
for (const set of SET_NAMES) {
  const { entries } = loadSet(set);
  population[set] = entries.length;
  for (let i = entries.length - 1; i > 0; i--) {
    const j = Math.floor(pick() * (i + 1));
    [entries[i], entries[j]] = [entries[j], entries[i]];
  }
  sample.push(...entries.slice(0, PER_SET));
}
progress(`sampled ${sample.length} icons (${PER_SET}/set, seed ${SEED})`);

const icons: Icon[] = [];
const rejected = new Map<string, string[]>(); // adapter message → ids
const throws: Array<[string, string]> = [];
const empties: string[] = [];
const nans: string[] = [];
const resampleFails: Array<[string, string]> = [];
const times: Array<[number, string]> = [];
const nonCanon: Array<[string, number]> = [];
const resampleIoU: Array<[string, number]> = [];
const samplesNonSimple: Array<[string, number]> = []; // folds already at rest
for (const e of sample) {
  let icon: IconInput;
  try {
    icon = svgToIcon(e.markup);
  } catch (err) {
    const msg = String((err as Error).message).replace(/"[^"]*"/, '"…"');
    rejected.set(msg, [...(rejected.get(msg) ?? []), e.id]);
    continue;
  }
  const fill = paintOf(icon) === "fill";
  const m = /stroke-width="([\d.]+)"/.exec(e.markup);
  const sw = (m ? Number(m[1]) : 2) * e.vbScale;
  let region: IconNode;
  const t = performance.now();
  try {
    region = toRegion(icon, { strokeWidth: sw });
  } catch (err) {
    times.push([performance.now() - t, e.id]);
    const msg = String((err as Error).message);
    if (/no visible surface/.test(msg)) empties.push(e.id);
    else throws.push([e.id, msg]);
    continue;
  }
  times.push([performance.now() - t, e.id]);
  if (/NaN|Infinity/.test(String(region[0][1].d))) {
    nans.push(e.id);
    continue;
  }
  let s: Sampled[];
  try {
    s = resampleRegion(region);
  } catch (err) {
    resampleFails.push([e.id, String((err as Error).message)]);
    continue;
  }
  if (hasNaN(s.map((x) => x.pts))) {
    nans.push(`${e.id} (samples)`);
    continue;
  }
  const regionPolys = flatten(region).polys;
  // canonical region: non-overlapping contours, outers +1 / holes −1 ⇒
  // winding ∈ {0, 1} everywhere
  const wn = winding(regionPolys, 96);
  let bad = 0;
  let ink = 0;
  for (const w of wn) {
    if (w) ink++;
    if (w !== 0 && w !== 1) bad++;
  }
  if (ink && bad / ink > 0.001) nonCanon.push([e.id, bad / ink]);
  const ws = winding(
    s.map((x) => x.pts),
    96,
  );
  const r96 = ruled(ws, "nonzero");
  let sbad = 0;
  for (const w of ws) if (w !== 0 && w !== 1) sbad++;
  if (ink && sbad / ink > 0.001) samplesNonSimple.push([e.id, sbad / ink]);
  resampleIoU.push([e.id, iou(r96, ruled(wn, "nonzero"))]);
  icons.push({ e, icon, fill, sw, region, regionPolys, s, r96 });
}

// Is an "empty" icon really empty? Its per-element union must have no ink.
const emptyReal = empties.filter((id) => {
  const e = sample.find((x) => x.id === id) as Entry;
  const icon = svgToIcon(e.markup);
  if (typeof icon === "string") return inkOf(raster(flatten(icon).polys, 96)) > 0;
  let ink = 0;
  for (const el of elementsOf(icon)) {
    if (el.trans) continue;
    const m = new Uint8Array(96 * 96);
    if (el.strokeOn) strokeInto(el.polys, el.closed, el.half, 96, m);
    if (el.fillOn) ink += inkOf(raster(el.polys, 96, el.rule));
    ink += inkOf(m);
  }
  return ink > 0;
});

const out: string[] = [];
const log = (s = "") => out.push(s);
times.sort((a, b) => a[0] - b[0]);
const tms = times.map((x) => x[0]);
const nFill = icons.filter((x) => x.fill).length;
let nRejected = 0;
for (const v of rejected.values()) nRejected += v.length;
log(
  `# region-wide · ${sample.length} icons (${PER_SET}/set of ${SET_NAMES.length} sets, seed ${SEED})`,
);
log();
log("## 1. Normalize robustness");
log(
  `${sample.length} sampled · ${nRejected} rejected by svgToIcon (not the normalizer) · ${times.length} normalized · ${icons.length} usable (${nFill} fill, ${icons.length - nFill} stroke)`,
);
for (const [msg, ids] of rejected)
  log(`  svgToIcon: ${msg} ×${ids.length}: ${ids.slice(0, 5).join(", ")}`);
log(
  `toRegion throws: ${throws.length} · NaN: ${nans.length} · empty: ${empties.length} (${emptyReal.length} of them have visible ink) · resampleRegion throws: ${resampleFails.length}`,
);
for (const [id, msg] of throws.slice(0, 10)) log(`  throw ${id}: ${msg}`);
for (const id of nans.slice(0, 10)) log(`  NaN ${id}`);
for (const id of empties.slice(0, 10))
  log(`  empty ${id}${emptyReal.includes(id) ? "  ← HAS INK" : ""}`);
for (const [id, msg] of resampleFails.slice(0, 10)) log(`  resample ${id}: ${msg}`);
log(
  `non-canonical region (winding ∉ {0,1} on > 0.1% of ink): ${nonCanon.length}${
    nonCanon.length
      ? ` — ${nonCanon
          .slice(0, 8)
          .map(([id, v]) => `${id} ${pct(v, 1)}`)
          .join(", ")}`
      : ""
  }`,
);
log(
  `toRegion time (ms, JSC): median ${f3(q(tms, 0.5))} · p95 ${f3(q(tms, 0.95))} · max ${f3(tms[tms.length - 1])} (${times[times.length - 1][1]})`,
);
log(
  `  slowest: ${times
    .slice(-5)
    .reverse()
    .map(([t, id]) => `${id} ${t.toFixed(1)}`)
    .join(", ")}`,
);
resampleIoU.sort((a, b) => a[1] - b[1]);
const rsv = resampleIoU.map((x) => x[1]);
log(
  `resample (64, or 128 past FINE) vs region (what t→1 lands on vs the rest snap) IoU: median ${f4(q(rsv, 0.5))} · <0.99 ${rsv.filter((v) => v < 0.99).length} · <0.95 ${rsv.filter((v) => v < 0.95).length} · worst ${resampleIoU
    .slice(0, 5)
    .map(([id, v]) => `${id} ${f3(v)}`)
    .join(", ")}`,
);
log(
  `samples already non-simple at rest (winding ∉ {0,1} on > 0.1% of ink): ${samplesNonSimple.length}${
    samplesNonSimple.length
      ? ` — ${samplesNonSimple
          .slice(0, 5)
          .map(([id, v]) => `${id} ${pct(v, 1)}`)
          .join(", ")}`
      : ""
  }`,
);
progress(`normalized ${icons.length}`);

// ---------------------------------------------------------------------------
// 2. Pre-chunk rest correctness (fill icons)

log();
log("## 2. Pre-chunk rest vs region — fill icons");
const rest: Array<{ id: string; set: string; len: number; rule: Rule; r: RestResult }> =
  [];
for (const ic of icons) {
  if (!ic.fill) continue;
  rest.push({
    id: ic.e.id,
    set: ic.e.set,
    len: ic.e.markup.length,
    rule: restRule(ic.icon as IconNode),
    r: restAnalysis(ic, 96),
  });
}
const below = (th: number) => rest.filter((x) => x.r.iou < th);
const shippedBelow = (th: number) => rest.filter((x) => x.r.shipped < th);
log(
  `${rest.length} fill icons · shipped (restAttrs: closest single look, fill / stroke / both): IoU < 0.99: ${shippedBelow(0.99).length} (${pct(shippedBelow(0.99).length, rest.length)}) · < 0.95: ${shippedBelow(0.95).length}`,
);
log(
  `  worst shipped: ${[...rest]
    .sort((a, b) => a.r.shipped - b.r.shipped)
    .slice(0, 8)
    .map((x) => `${x.id} ${f3(x.r.shipped)}`)
    .join(", ")}`,
);
log(
  `old rest (one merged d under the icon's own rule; the counterfactual base) · IoU < 0.99: ${below(0.99).length} (${pct(below(0.99).length, rest.length)}) · < 0.95: ${below(0.95).length} (${pct(below(0.95).length, rest.length)}) — the breakdown below is of this model`,
);
log("by set (fill icons · <0.99 · <0.95):");
for (const set of SET_NAMES) {
  const xs = rest.filter((x) => x.set === set);
  if (!xs.length) continue;
  const b99 = xs.filter((x) => x.r.iou < 0.99);
  const b95 = xs.filter((x) => x.r.iou < 0.95);
  const causes = new Map<string, number>();
  for (const x of b99) causes.set(x.r.cause, (causes.get(x.r.cause) ?? 0) + 1);
  log(
    `  ${set.padEnd(17)} ${String(xs.length).padStart(4)} · ${String(b99.length).padStart(3)} · ${String(b95.length).padStart(3)}   causes(<0.99): ${[...causes].map(([k, v]) => `${k}=${v}`).join(" ") || "-"}`,
  );
}
log(
  "by primary cause (largest IoU gain among counterfactual fixes) for IoU < 0.99 · < 0.95:",
);
for (const k of ["a", "b", "c", "d", "e"]) {
  const n99 = below(0.99).filter((x) => x.r.cause === k).length;
  const n95 = below(0.95).filter((x) => x.r.cause === k).length;
  const xs = below(0.99).filter((x) => x.r.cause === k);
  const worst = [...xs].sort((a, b) => a.r.iou - b.r.iou)[0];
  const small = [...xs].sort((a, b) => a.len - b.len)[0];
  log(
    `  ${CAUSE_NAMES[k]}: ${n99} · ${n95}${worst ? `   worst ${worst.id} ${f3(worst.r.iou)} · smallest ${small.id} ${f3(small.r.iou)} (${small.len} B)` : ""}`,
  );
  if (k === "a" && xs.length) {
    const eo = xs.filter((x) => x.rule === "evenodd").length;
    const ex = (r: Rule) =>
      xs
        .filter((x) => x.rule === r)
        .slice(0, 3)
        .map((x) => `${x.id} ${f3(x.r.iou)}`)
        .join(", ");
    log(
      `      split: ${eo} all-evenodd XOR (${ex("evenodd")}) · ${xs.length - eo} nonzero opposite winding (${ex("nonzero")})`,
    );
  }
}
const contrib = (k: "a" | "b" | "c" | "d") =>
  below(0.99).filter((x) => x.r.gains[k] > 0.002).length;
log(
  `  (contributing at all, gain > 0.002: a ${contrib("a")} · b ${contrib("b")} · c ${contrib("c")} · d ${contrib("d")})`,
);
const disagree = rest.filter((x) => x.r.steps[4] < 0.99);
log(
  `  region vs per-element truth (incl. round-stroked elements) < 0.99: ${disagree.length} — ${disagree
    .sort((x, y) => x.r.steps[4] - y.r.steps[4])
    .slice(0, 6)
    .map((x) => `${x.id} ${f3(x.r.steps[4])}`)
    .join(", ")}`,
);
log("15 worst (IoU rest vs region · cause · IoU after fixes d→c→b→a):");
for (const x of [...rest].sort((a, b) => a.r.iou - b.r.iou).slice(0, 15))
  log(
    `  ${x.id.padEnd(44)} ${f3(x.r.iou)}  ${x.r.cause}   ${x.r.steps.slice(1).map(f3).join(" → ")}`,
  );
progress("rest analysis done");

// ---------------------------------------------------------------------------
// 3. Region fidelity vs per-element ground truth (pure-fill icons)

log();
log("## 3. Region vs ground truth (pure-fill: each element alone, own rule, union)");
let skippedStroke = 0;
let withTransform = 0;
let withTrans = 0;
const fid: Array<{ id: string; i96: number; i192: number; dev: number }> = [];
for (const ic of icons) {
  if (!ic.fill) continue;
  const els = elementsOf(ic.icon as IconNode);
  if (els.some((e) => e.trans)) withTrans++;
  const vis = els.filter((e) => !e.trans);
  if (vis.some((e) => e.strokeOn)) {
    skippedStroke++;
    continue;
  }
  if (ic.e.hasTransform) withTransform++;
  const fills = vis.filter((e) => e.fillOn);
  const gt = (R: number) => {
    let m: Uint8Array = new Uint8Array(R * R);
    for (const e of fills) m = or(m, raster(e.polys, R, e.rule));
    return m;
  };
  const g192 = gt(192);
  const r192 = raster(ic.regionPolys, 192);
  // boundary deviation: differing pixels at R=192 lie between the two
  // boundaries, so their distance to the truth's boundary bounds how far
  // the region strays (from below). Capped at 3 units.
  const ix = segIndex(fills.flatMap((e) => e.polys));
  let dev = 0;
  for (let k = 0; k < r192.length; k++) {
    if (r192[k] === g192[k]) continue;
    const x = ((k % 192) + PX) / 8;
    const y = (Math.floor(k / 192) + PY) / 8;
    const d = distTo(ix, x, y);
    if (d > dev) dev = d;
  }
  fid.push({
    id: ic.e.id,
    i96: med(phased(() => iou(raster(ic.regionPolys, 96), gt(96)))),
    i192: med(phased(() => iou(raster(ic.regionPolys, 192), gt(192)))),
    dev,
  });
}
const i96 = fid.map((x) => x.i96);
const i192 = fid.map((x) => x.i192);
const devs = fid.map((x) => x.dev);
log(
  `${fid.length} checked · skipped ${skippedStroke} with stroked elements · ${withTransform} with transforms (baked by svgToIcon, included) · ${withTrans} had duotone layers (excluded from truth, as the region does)`,
);
log(
  `IoU R=96: median ${f4(q(i96, 0.5))} · min ${f4(Math.min(...i96))} · <0.99 ${i96.filter((v) => v < 0.99).length} · <0.95 ${i96.filter((v) => v < 0.95).length}`,
);
log(
  `IoU R=192: median ${f4(q(i192, 0.5))} · min ${f4(Math.min(...i192))} · <0.99 ${i192.filter((v) => v < 0.99).length} · <0.95 ${i192.filter((v) => v < 0.95).length}`,
);
log(
  `boundary deviation seen at R=192 (units of 24; pixel = 0.125): median ${f3(q(devs, 0.5))} · p95 ${f3(q(devs, 0.95))} · max ${f3(Math.max(...devs))} · > 0.25: ${devs.filter((v) => v > 0.25).length}`,
);
log("10 worst (IoU96 · IoU192 · max dev):");
for (const x of [...fid].sort((a, b) => a.i192 - b.i192).slice(0, 10))
  log(`  ${x.id.padEnd(44)} ${f3(x.i96)} · ${f3(x.i192)} · ${f3(x.dev)}`);
log("10 largest deviations:");
log(
  `  ${[...fid]
    .sort((a, b) => b.dev - a.dev)
    .slice(0, 10)
    .map((x) => `${x.id} ${f3(x.dev)}`)
    .join(", ")}`,
);
progress("fidelity done");

// ---------------------------------------------------------------------------
// 4. Topology on seeded random pairs

interface TopoReport {
  pairs: number;
  throws: Array<[string, string]>;
  nan: string[];
  broken: Array<[string, number, number]>;
  leaks: Array<{
    id: string;
    leak: number;
    hole: number;
    fold: number;
    at: number;
    len: number; // markup bytes of both sides (smallest repro)
  }>;
  planMs: Array<[number, string]>;
  kinds: Map<
    string,
    { n: number; broken: number; leaky: number; hole: number; fold: number }
  >;
  // by the larger contour count of the two sides
  strata: Map<string, { n: number; hole: number; fold: number }>;
}
const stratum = (c: number) =>
  c <= 2 ? "1-2" : c <= 5 ? "3-5" : c <= 10 ? "6-10" : "11+";

// Random pairs over a pool (sets drawn uniformly, then icons): half
// fill↔fill, half stroke↔fill (either direction), each half within one set
// or across two.
function topology(pool: Icon[], nPairs: number, seed: number): TopoReport {
  const pr = rng(seed);
  const choose = <T>(xs: readonly T[]): T => xs[Math.floor(pr() * xs.length)];
  const bySet = new Map<string, { fill: Icon[]; stroke: Icon[] }>();
  for (const ic of pool) {
    let b = bySet.get(ic.e.set);
    if (!b) {
      b = { fill: [], stroke: [] };
      bySet.set(ic.e.set, b);
    }
    (ic.fill ? b.fill : b.stroke).push(ic);
  }
  const fillSets = [...bySet].filter(([, b]) => b.fill.length >= 2).map(([s]) => s);
  const strokeSets = [...bySet].filter(([, b]) => b.stroke.length >= 1).map(([s]) => s);
  const mixedSets = [...bySet]
    .filter(([, b]) => b.stroke.length >= 1 && b.fill.length >= 1)
    .map(([s]) => s);
  const get = (s: string) => bySet.get(s) as { fill: Icon[]; stroke: Icon[] };
  const pairs: Array<{ a: Icon; b: Icon; kind: string }> = [];
  while (pairs.length < nPairs) {
    const ff = pr() < 0.5;
    const within = pr() < 0.5;
    let a: Icon;
    let b: Icon;
    if (ff) {
      const s1 = choose(fillSets);
      const s2 = within ? s1 : choose(fillSets.filter((s) => s !== s1));
      a = choose(get(s1).fill);
      b = choose(get(s2).fill);
      if (a === b) continue;
    } else {
      const s1 = within ? choose(mixedSets) : choose(strokeSets);
      const s2 = within ? s1 : choose(fillSets.filter((s) => s !== s1));
      a = choose(get(s1).stroke);
      b = choose(get(s2).fill);
      if (pr() < 0.5) [a, b] = [b, a];
    }
    pairs.push({
      a,
      b,
      kind: `${ff ? "fill↔fill" : "stroke↔fill"} ${within ? "within" : "cross"}`,
    });
  }

  const MID = [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875];
  const rep: TopoReport = {
    pairs: pairs.length,
    throws: [],
    nan: [],
    broken: [],
    leaks: [],
    planMs: [],
    kinds: new Map(),
    strata: new Map(
      ["1-2", "3-5", "6-10", "11+"].map((k) => [k, { n: 0, hole: 0, fold: 0 }]),
    ),
  };
  for (const { a, b, kind } of pairs) {
    const id = `${a.e.id} → ${b.e.id}`;
    const k = rep.kinds.get(kind) ?? { n: 0, broken: 0, leaky: 0, hole: 0, fold: 0 };
    rep.kinds.set(kind, k);
    k.n++;
    let plan: ReturnType<typeof buildRegionPlan>;
    const t = performance.now();
    try {
      plan = buildRegionPlan(a.s, b.s);
    } catch (err) {
      rep.throws.push([id, String((err as Error).message)]);
      continue;
    }
    rep.planMs.push([performance.now() - t, id]);
    const o = allocOutputs(plan);
    let nan = false;
    interpPolar(plan, 0, o);
    nan ||= hasNaN(o);
    const e0 = iou(raster(o, 96), a.r96);
    interpPolar(plan, 1, o);
    nan ||= hasNaN(o);
    const e1 = iou(raster(o, 96), b.r96);
    if (Math.min(e0, e1) < 0.99) {
      rep.broken.push([id, e0, e1]);
      k.broken++;
    }
    // Negative winding split by what produces it (winding is additive):
    // outers alone already negative → an outer contour folded over itself
    // (self-intersection, turned inside out); outers ≥ 0 but the sum
    // negative → a hole outside its surface or two holes stacked (what the
    // planner's hole rules are meant to prevent).
    const isHole = plan.items.map((it) => it.hole === true);
    let leak = 0;
    let hole = 0;
    let fold = 0;
    let at = 0;
    for (const tt of MID) {
      interpPolar(plan, tt, o);
      nan ||= hasNaN(o);
      const wo = winding(
        o.filter((_, i) => !isHole[i]),
        96,
      );
      const wh = winding(
        o.filter((_, i) => isHole[i]),
        96,
      );
      let nh = 0;
      let nf = 0;
      let ink = 0;
      for (let p = 0; p < wo.length; p++) {
        const w = wo[p] + wh[p];
        if (w) ink++;
        if (w < 0) {
          if (wo[p] < 0) nf++;
          else nh++;
        }
      }
      if (!ink) continue;
      if ((nh + nf) / ink > leak) {
        leak = (nh + nf) / ink;
        at = tt;
      }
      hole = Math.max(hole, nh / ink);
      fold = Math.max(fold, nf / ink);
    }
    if (nan) rep.nan.push(id);
    const st = rep.strata.get(stratum(Math.max(a.s.length, b.s.length))) as {
      n: number;
      hole: number;
      fold: number;
    };
    st.n++;
    if (hole > 0.01) st.hole++;
    if (fold > 0.01) st.fold++;
    if (leak > 0.01) {
      rep.leaks.push({
        id,
        leak,
        hole,
        fold,
        at,
        len: a.e.markup.length + b.e.markup.length,
      });
      k.leaky++;
      if (hole > 0.01) k.hole++;
      if (fold > 0.01) k.fold++;
    }
  }
  rep.planMs.sort((x, y) => x[0] - y[0]);
  rep.broken.sort((x, y) => Math.min(x[1], x[2]) - Math.min(y[1], y[2]));
  rep.leaks.sort((x, y) => y.leak - x.leak);
  return rep;
}

function logTopology(rep: TopoReport, full: boolean): void {
  const pms = rep.planMs.map((x) => x[0]);
  const holeN = rep.leaks.filter((x) => x.hole > 0.01).length;
  const foldN = rep.leaks.filter((x) => x.fold > 0.01).length;
  log(
    `${rep.pairs} pairs · plan throws ${rep.throws.length} · NaN in a frame ${rep.nan.length} · broken endpoint (IoU < 0.99) ${rep.broken.length} · mid-flight negative winding > 1% of ink ${rep.leaks.length} (${pct(rep.leaks.length, rep.pairs)}): hole outside surface ${holeN} · outer folded ${foldN}`,
  );
  for (const [kind, v] of [...rep.kinds].sort())
    log(
      `  ${kind.padEnd(20)} ${String(v.n).padStart(5)} pairs · broken ${v.broken} · >1%: ${v.leaky} (hole ${v.hole} · fold ${v.fold})`,
    );
  log(
    `  by max contours per side: ${[...rep.strata].map(([k, v]) => `${k}: ${v.n} pairs, hole ${pct(v.hole, v.n)} fold ${pct(v.fold, v.n)}`).join(" · ")}`,
  );
  log(
    `plan time (ms): median ${f3(q(pms, 0.5))} · p95 ${f3(q(pms, 0.95))} · max ${f3(pms[pms.length - 1])} (${rep.planMs[rep.planMs.length - 1][1]})`,
  );
  if (!full) return;
  for (const [id, msg] of rep.throws.slice(0, 5)) log(`  throw ${id}: ${msg}`);
  for (const id of rep.nan.slice(0, 5)) log(`  NaN ${id}`);
  log("worst endpoints (t0 · t1):");
  for (const [id, e0, e1] of rep.broken.slice(0, 10))
    log(`  ${id}  ${f3(e0)} · ${f3(e1)}`);
  const lv = rep.leaks.map((x) => x.leak);
  log(
    `negative winding: median of the > 1% ${lv.length ? pct(q(lv, 0.5), 1) : "-"} · > 5% ${lv.filter((v) => v > 0.05).length}`,
  );
  log("worst hole-outside-surface leaks (hole% · fold% · t of max):");
  for (const x of [...rep.leaks].sort((a, b) => b.hole - a.hole).slice(0, 10))
    if (x.hole > 0.01)
      log(`  ${x.id}  ${pct(x.hole, 1)} · ${pct(x.fold, 1)} · t=${x.at}`);
  const smallest = (f: (x: TopoReport["leaks"][number]) => boolean) =>
    rep.leaks
      .filter(f)
      .sort((a, b) => a.len - b.len)
      .slice(0, 3)
      .map((x) => `${x.id} (${x.len} B, hole ${pct(x.hole, 1)} fold ${pct(x.fold, 1)})`)
      .join(", ");
  const inv = new Map<string, number>();
  for (const x of rep.leaks)
    if (x.hole > 0.01)
      for (const side of x.id.split(" → ")) {
        const set = side.split(":")[0];
        inv.set(set, (inv.get(set) ?? 0) + 1);
      }
  log(
    `sets involved in hole leaks (either side): ${[...inv]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${v}`)
      .join(" · ")}`,
  );
  log(`smallest hole leaks: ${smallest((x) => x.hole > 0.01)}`);
  log(`smallest folds: ${smallest((x) => x.fold > 0.01 && x.hole <= 0.01)}`);
  log("worst folds (fold% · hole%):");
  for (const x of [...rep.leaks].sort((a, b) => b.fold - a.fold).slice(0, 6))
    if (x.fold > 0.01) log(`  ${x.id}  ${pct(x.fold, 1)} · ${pct(x.hole, 1)}`);
}

progress(`planning ${N_PAIRS} pairs`);
log();
log(`## 4. Topology on random pairs (seed ${SEED})`);
logTopology(topology(icons, N_PAIRS, SEED * 7919 + 13), true);

// Control: the SAME random-pair procedure over the 318 vendored icons the
// heuristics were tuned on. If they leak as often as the wide sample, the
// excess over bench:topology comes from random (dissimilar) pairs, not from
// icons the heuristics never saw.
{
  const { SETS } = await import("../playground/vendor-regions");
  const pool: Icon[] = [];
  for (const [key, set] of Object.entries(SETS))
    for (const [c, v] of Object.entries(set.icons)) {
      const vb = /viewBox="([^"]+)"/
        .exec(v.svg)?.[1]
        .trim()
        .split(/[\s,]+/)
        .map(Number) ?? [0, 0, 24, 24];
      pool.push(
        normalize({
          set: set.lib,
          name: `${key.split("/")[1]}/${c}`,
          id: `${key}:${c}`,
          markup: v.svg,
          vbScale: Math.min(24 / vb[2], 24 / vb[3]),
          hasTransform: /transform=/.test(v.svg),
        }),
      );
    }
  log();
  log(`### 4b. Control: same procedure over the ${pool.length} vendored (tuning) icons`);
  const rs = pool.map((ic) => iou(ic.r96, raster(ic.regionPolys, 96)));
  log(
    `resample (64 or 128) vs region IoU on these: median ${f4(q(rs, 0.5))} · <0.99 ${rs.filter((v) => v < 0.99).length} · <0.95 ${rs.filter((v) => v < 0.95).length} (wide sample: section 1)`,
  );
  logTopology(topology(pool, N_PAIRS, SEED * 7919 + 13), false);
}
progress("done");

console.log(out.join("\n"));
