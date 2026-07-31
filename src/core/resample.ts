/* Arc-length resampling with anchored corners.
   The length of a cubic has no closed form: |B′(t)| is integrated with
   8-point Gauss-Legendre. Corners (tangent discontinuity above an angular
   threshold) are anchored as exact sample points; the remaining points are
   distributed by arc length between corners — integer apportionment by
   largest remainder, minimum 1 interval per run, summing exactly to N−1
   (N if closed). */

import { iconToCubics } from "./normalize";
import type { CubicPath, IconInput, Sampled } from "./types";

/** Default angular threshold for a segment joint to count as a corner. */
export const CORNER_THRESHOLD = Math.PI / 8; // 22.5°

// Gauss-Legendre, 8 points on [−1, 1] — symmetric nodes: only half is stored.
const GX = [
  0.18343464249564978, 0.525532409916329, 0.7966664774136267, 0.9602898564975363,
];
const GW = [
  0.362683783378362, 0.31370664587788727, 0.22238103445337448, 0.10122853629037626,
];

// |B′(t)| of segment k. B′(t) = 3(1−t)²(P₁−P₀) + 6(1−t)t(P₂−P₁) + 3t²(P₃−P₂).
function speed(p: Float64Array, k: number, t: number): number {
  const i = 6 * k;
  const u = 1 - t;
  const c0 = 3 * u * u;
  const c1 = 6 * u * t;
  const c2 = 3 * t * t;
  const dx =
    c0 * (p[i + 2] - p[i]) + c1 * (p[i + 4] - p[i + 2]) + c2 * (p[i + 6] - p[i + 4]);
  const dy =
    c0 * (p[i + 3] - p[i + 1]) + c1 * (p[i + 5] - p[i + 3]) + c2 * (p[i + 7] - p[i + 5]);
  return Math.hypot(dx, dy);
}

// ∫₀^t1 |B′| of segment k via Gauss-Legendre.
function segLen(p: Float64Array, k: number, t1 = 1): number {
  const half = t1 / 2;
  let s = 0;
  for (let j = 0; j < 4; j++)
    s += GW[j] * (speed(p, k, half + half * GX[j]) + speed(p, k, half - half * GX[j]));
  return s * half;
}

// Bernstein evaluation of segment k at t → (out[o], out[o+1]).
function point(
  p: Float64Array,
  k: number,
  t: number,
  out: Float64Array,
  o: number,
): void {
  const i = 6 * k;
  const u = 1 - t;
  const b0 = u * u * u;
  const b1 = 3 * u * u * t;
  const b2 = 3 * u * t * t;
  const b3 = t * t * t;
  out[o] = b0 * p[i] + b1 * p[i + 2] + b2 * p[i + 4] + b3 * p[i + 6];
  out[o + 1] = b0 * p[i + 1] + b1 * p[i + 3] + b2 * p[i + 5] + b3 * p[i + 7];
}

// Tangent at an endpoint of segment k. atEnd: outgoing at P₃ (P₃−P₂);
// otherwise incoming at P₀ (P₁−P₀). Falls back to the next control point
// when degenerate.
function tangent(
  p: Float64Array,
  k: number,
  atEnd: boolean,
): readonly [number, number] | null {
  const i = 6 * k;
  const b = atEnd ? i + 6 : i; // base point (endpoint)
  const s = atEnd ? -1 : 1;
  for (const j of atEnd ? [4, 2, 0] : [2, 4, 6]) {
    const dx = s * (p[i + j] - p[b]);
    const dy = s * (p[i + j + 1] - p[b + 1]);
    if (dx * dx + dy * dy > 1e-18) return [dx, dy];
  }
  return null;
}

/** Segment boundaries (index of the segment starting at the corner) whose
 *  tangent discontinuity exceeds the threshold. For closed paths this
 *  includes the closing joint (boundary = first active segment). */
export function detectCorners(path: CubicPath, threshold = CORNER_THRESHOLD): number[] {
  const p = path.pts;
  const m = (p.length / 2 - 1) / 3;
  const active: number[] = [];
  for (let k = 0; k < m; k++) if (segLen(p, k) > 1e-9) active.push(k);
  if (active.length === 0) return [];
  const corners = new Set<number>();
  const test = (a: number, b: number) => {
    const u = tangent(p, a, true);
    const v = tangent(p, b, false);
    if (!u || !v) return;
    const ang = Math.abs(
      Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]),
    );
    if (ang > threshold) corners.add(b);
  };
  for (let j = 0; j + 1 < active.length; j++) test(active[j], active[j + 1]);
  if (path.closed && active.length > 1) test(active[active.length - 1], active[0]);
  return [...corners].sort((a, b) => a - b);
}

/** Total arc length of the subpath (per-segment Gauss-Legendre). */
export function arcLength(path: CubicPath): number {
  const m = (path.pts.length / 2 - 1) / 3;
  let L = 0;
  for (let k = 0; k < m; k++) L += segLen(path.pts, k);
  return L;
}

// Arc-length inversion: t such that ∫₀^t |B′| = s. Safeguarded Newton with
// a bisection bracket; |B′| is the exact derivative of the objective.
function invert(p: Float64Array, k: number, s: number, ls: number): number {
  if (s <= 0) return 0;
  if (s >= ls) return 1;
  let lo = 0;
  let hi = 1;
  let t = s / ls;
  for (let it = 0; it < 12; it++) {
    const f = segLen(p, k, t) - s;
    if (Math.abs(f) < 1e-10 * ls + 1e-14) break;
    if (f > 0) hi = t;
    else lo = t;
    const sp = speed(p, k, t);
    let nt = sp > 1e-12 ? t - f / sp : (lo + hi) / 2;
    if (!(nt > lo && nt < hi)) nt = (lo + hi) / 2;
    t = nt;
  }
  return t;
}

/** Samples a cubic subpath at N points equidistant by arc length, anchoring
 *  corners and endpoints as exact samples. Returns Float64Array(2N). Closed
 *  paths distribute N intervals around the loop (without duplicating the
 *  first point); the circular start-point freedom is resolved by the plan's
 *  circular correspondence. */
export function resamplePath(
  path: CubicPath,
  N = 64,
  cornerThreshold = CORNER_THRESHOLD,
): Float64Array {
  const p = path.pts;
  const m = (p.length / 2 - 1) / 3;
  const out = new Float64Array(2 * N);
  const fill = () => {
    for (let i = 0; i < N; i++) {
      out[2 * i] = p[0];
      out[2 * i + 1] = p[1];
    }
    return out;
  };
  if (m < 1) return fill();
  const lens = new Array<number>(m);
  let L = 0;
  for (let k = 0; k < m; k++) {
    lens[k] = segLen(p, k);
    L += lens[k];
  }
  if (L < 1e-12) return fill();

  // Anchors: segment boundaries. For open paths, endpoints + corners. For
  // closed paths, ONLY corners: sampling must be intrinsic to the shape and
  // not to the arbitrary M point — two congruent loops with different start
  // points produce the same sample set (modulo index rotation, which the
  // plan's circular correspondence resolves). With no corners (a circle)
  // the path start is the only possible reference.
  const cs = detectCorners(path, cornerThreshold);
  const anchors = path.closed
    ? cs.length > 0
      ? cs
      : [0]
    : [...new Set([0, ...cs, m])].sort((a, b) => a - b);
  // Runs between anchors; for closed paths the last wraps to anchors[0] + m.
  const runs: Array<[number, number]> = [];
  if (path.closed) {
    for (let j = 0; j < anchors.length; j++) {
      const a = anchors[j];
      const b = j + 1 < anchors.length ? anchors[j + 1] : anchors[0] + m;
      runs.push([a, b]);
    }
  } else {
    for (let j = 0; j + 1 < anchors.length; j++) runs.push([anchors[j], anchors[j + 1]]);
  }
  const rl = runs.map(([a, b]) => {
    let s = 0;
    for (let k = a; k < b; k++) s += lens[k % m];
    return s;
  });
  const intervals = path.closed ? N : N - 1;
  if (runs.length > intervals)
    throw new Error(`morphicons: N=${N} too small (${runs.length} runs)`);

  // Largest-remainder apportionment: proportional to length, min 1, exact sum.
  const total = rl.reduce((a, b) => a + b, 0) || 1;
  const ideal = rl.map((l) => (intervals * l) / total);
  const counts = ideal.map((q) => Math.max(1, Math.floor(q)));
  let R = intervals - counts.reduce((a, b) => a + b, 0);
  if (R > 0) {
    // Quantized fraction: the quadrature's fp noise (~1e-15) must not decide
    // the tie-break — runs congruent under rotation must apportion the same
    // in both icons or Procrustes loses the exact congruence.
    const order = ideal
      .map((q, idx) => [Math.round((q - Math.floor(q)) * 1e9), idx] as const)
      .sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    for (let j = 0; j < R; j++) counts[order[j % counts.length][1]]++;
  }
  while (R < 0) {
    let bi = 0;
    for (let idx = 1; idx < counts.length; idx++) if (counts[idx] > counts[bi]) bi = idx;
    if (counts[bi] <= 1) break;
    counts[bi]--;
    R++;
  }

  // Sampling: exact anchor at the start of each run + interiors by inversion.
  let w = 0;
  for (let r = 0; r < runs.length; r++) {
    const [k0, k1] = runs[r];
    const cnt = counts[r];
    const Lr = rl[r];
    const vi = 6 * (k0 % m);
    out[2 * w] = p[vi];
    out[2 * w + 1] = p[vi + 1];
    w++;
    let seg = k0;
    let acc = 0;
    for (let j = 1; j < cnt; j++) {
      const target = (Lr * j) / cnt;
      while (seg < k1 - 1 && acc + lens[seg % m] < target) {
        acc += lens[seg % m];
        seg++;
      }
      const k = seg % m;
      const ls = lens[k];
      const t = ls > 1e-12 ? invert(p, k, target - acc, ls) : 0;
      point(p, k, t, out, 2 * w);
      w++;
    }
  }
  if (!path.closed) {
    const vi = 6 * m;
    out[2 * w] = p[vi];
    out[2 * w + 1] = p[vi + 1];
  }
  return out;
}

/** Full input pipeline: icon → cubics → sampled subpaths with their
 *  topology (the plan needs to know which subpaths are closed loops). */
export function resampleIcon(input: IconInput, N = 64): Sampled[] {
  return iconToCubics(input).map((path) => ({
    pts: resamplePath(path, N),
    closed: path.closed,
  }));
}
