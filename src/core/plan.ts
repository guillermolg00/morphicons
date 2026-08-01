/* Correspondence and alignment. Closed-form 2D Procrustes (no SVD: atan2),
   subpath matching by centroid+length cost (surjective when p ≠ q: leftovers
   duplicate — "cell division"), circular correspondence for closed loops,
   minimal-rotation tie-break with λ, and a global hybrid: if the whole icon
   is congruent under ONE similarity, every subpath shares it (coherent
   block rotation). */

import type { Sampled } from "./types";

/** Weight of |ΔL| in the subpath pairing cost. */
const LEN_WEIGHT = 0.35;

/** λ of the minimal-rotation tie-break: score = res + λ·|θ|/π.
 *  It exists because shapes symmetric under inversion (lines) tie in
 *  residual for both traversal orientations yet produce different rotations. */
const LAMBDA = 0.05;

/** Global residual below which the whole icon counts as congruent and the
 *  plan shares (θ, σ) across all items (hybrid variant of Procrustes). */
const GLOBAL_EPS = 5e-3;

/** Bounds for exhaustive matching; above them it falls back to greedy with
 *  repair. 8! = 40 320 permutations / 1e5 assignments — both sub-ms. */
const PERM_MAX = 8;
const SURJ_MAX = 1e5;

export interface Similarity {
  theta: number;
  sigma: number;
  res: number;
}

export interface Alignment extends Similarity {
  ca: readonly [number, number];
  cb: readonly [number, number];
  /** A with the chosen correspondence (re-indexed only if A is the closed loop). */
  a: Float64Array;
  /** B with the chosen correspondence (orientation and circular offset). */
  b: Float64Array;
}

export interface PlanItem {
  /** Points of A with the chosen correspondence (if A is a closed loop it
   *  may come circularly re-indexed: same points, different cut). */
  a: Float64Array;
  /** A centered on its centroid. */
  aC: Float64Array;
  /** B brought into A's frame: R(−θ)·(b − c_B)/σ. */
  bT: Float64Array;
  /** B oriented, raw (for linear mode and for exact t=1). */
  bO: Float64Array;
  ca: readonly [number, number];
  cb: readonly [number, number];
  theta: number;
  lnSigma: number;
  res: number;
  /** true if both endpoints are closed loops: the subpath flies with Z.
   *  Closed → open flies open: the loop opens at the chosen cut. */
  closed: boolean;
  /** Block transport (set by the global hybrid, else null): mid-flight the
   *  centroid rides the shared similarity around the global centroid instead
   *  of lerping — off = c_A − g_A; drift closes c(1) = c_B exactly. */
  block: {
    off: readonly [number, number];
    drift: readonly [number, number];
  } | null;
}

export interface MorphPlan {
  items: PlanItem[];
  n: number;
}

export function centroid(p: Float64Array): [number, number] {
  const n = p.length / 2;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    cx += p[2 * i];
    cy += p[2 * i + 1];
  }
  return [cx / n, cy / n];
}

export function polyLen(p: Float64Array): number {
  const n = p.length / 2;
  let L = 0;
  for (let i = 1; i < n; i++)
    L += Math.hypot(p[2 * i] - p[2 * i - 2], p[2 * i + 1] - p[2 * i - 1]);
  return L;
}

export function reversePts(p: Float64Array): Float64Array {
  const n = p.length / 2;
  const out = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) {
    out[2 * i] = p[2 * (n - 1 - i)];
    out[2 * i + 1] = p[2 * (n - 1 - i) + 1];
  }
  return out;
}

/** Circular re-indexing of a loop: out[i] = p[(i+off) mod n]. Same point
 *  set, different cut point — the circular degree of freedom of closed paths. */
export function rotatePts(p: Float64Array, off: number): Float64Array {
  const n = p.length / 2;
  const out = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) {
    const j = (i + off) % n;
    out[2 * i] = p[2 * j];
    out[2 * i + 1] = p[2 * j + 1];
  }
  return out;
}

/** Optimal similarity (θ, σ) minimizing Σ|σ·R(θ)·(a−c_A) − (b−c_B)|².
 *  θ* = atan2(S_xy − S_yx, S_xx + S_yy); σ* by zero derivative.
 *  res = RMS residual normalized by b's energy (0 → same shape). */
export function procrustes(
  a: Float64Array,
  b: Float64Array,
  ca: readonly [number, number],
  cb: readonly [number, number],
): Similarity {
  const n = a.length / 2;
  let sxx = 0;
  let sxy = 0;
  let syx = 0;
  let syy = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const ax = a[2 * i] - ca[0];
    const ay = a[2 * i + 1] - ca[1];
    const bx = b[2 * i] - cb[0];
    const by = b[2 * i + 1] - cb[1];
    sxx += ax * bx;
    syy += ay * by;
    sxy += ax * by;
    syx += ay * bx;
    na += ax * ax + ay * ay;
    nb += bx * bx + by * by;
  }
  const theta = Math.atan2(sxy - syx, sxx + syy);
  const num = Math.cos(theta) * (sxx + syy) + Math.sin(theta) * (sxy - syx);
  let sigma = na > 1e-12 ? num / na : 1;
  if (!(sigma > 1e-6)) sigma = 1e-6;
  const res2 = Math.max(0, sigma * sigma * na - 2 * sigma * num + nb);
  const res = nb > 1e-12 ? Math.sqrt(res2 / nb) : 0;
  return { theta, sigma, res };
}

/** Best index-to-index correspondence between a and b: tries both traversal
 *  directions and, if there is a closed loop, its N circular offsets,
 *  scoring with score = res + λ·|θ|/π. The freedom is applied to ONE cloud
 *  — the closed one (b if both are); varying both at once would be
 *  redundant. */
export function alignPair(
  aPts: Float64Array,
  bPts: Float64Array,
  aClosed = false,
  bClosed = false,
): Alignment {
  const ca = centroid(aPts);
  const cb = centroid(bPts);
  const varyA = aClosed && !bClosed;
  const base = varyA ? aPts : bPts;
  const offs = aClosed || bClosed ? base.length / 2 : 1;
  let bestScore = Number.POSITIVE_INFINITY;
  let best = base;
  let sim: Similarity = { theta: 0, sigma: 1, res: 0 };
  for (let dir = 0; dir < 2; dir++) {
    const walk = dir ? reversePts(base) : base;
    for (let off = 0; off < offs; off++) {
      const cand = off ? rotatePts(walk, off) : walk;
      const s = varyA ? procrustes(cand, bPts, ca, cb) : procrustes(aPts, cand, ca, cb);
      const score = s.res + (LAMBDA * Math.abs(s.theta)) / Math.PI;
      if (score < bestScore) {
        bestScore = score;
        best = cand;
        sim = s;
      }
    }
  }
  return varyA
    ? { ca, cb, a: best, b: bPts, ...sim }
    : { ca, cb, a: aPts, b: best, ...sim };
}

// Cost matrix dist(centroids) + LEN_WEIGHT·|ΔL| between all pairs.
function costMatrix(A: Float64Array[], B: Float64Array[]): number[][] {
  const cbs = B.map(centroid);
  const lbs = B.map(polyLen);
  return A.map((a) => {
    const ca = centroid(a);
    const la = polyLen(a);
    return cbs.map(
      (cb, j) =>
        Math.hypot(ca[0] - cb[0], ca[1] - cb[1]) + LEN_WEIGHT * Math.abs(la - lbs[j]),
    );
  });
}

// p === q: minimum-cost permutation. Exhaustive with pruning up to PERM_MAX;
// greedy (pairs sorted by cost) above it — with that many subpaths the
// exact optimum stops mattering visually.
function bestPermutation(C: number[][]): number[] {
  const n = C.length;
  if (n > PERM_MAX) {
    const pairs: Array<[number, number, number]> = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) pairs.push([C[i][j], i, j]);
    pairs.sort((x, y) => x[0] - y[0]);
    const out = new Array<number>(n).fill(-1);
    const used = new Array<boolean>(n).fill(false);
    for (const [, i, j] of pairs) {
      if (out[i] < 0 && !used[j]) {
        out[i] = j;
        used[j] = true;
      }
    }
    return out;
  }
  const idx = Array.from({ length: n }, (_, i) => i);
  let best = idx.slice();
  let bc = Number.POSITIVE_INFINITY;
  const perm = (arr: number[], k: number, acc: number) => {
    if (acc >= bc) return;
    if (k === n) {
      bc = acc;
      best = arr.slice();
      return;
    }
    for (let i = k; i < n; i++) {
      [arr[k], arr[i]] = [arr[i], arr[k]];
      perm(arr, k + 1, acc + C[k][arr[k]]);
      [arr[k], arr[i]] = [arr[i], arr[k]];
    }
  };
  perm(idx, 0, 0);
  return best;
}

// p ≠ q: surjective assignment from the large side to the small one, minimum
// cost. Enumeration with pruning when S^B is small; greedy + coverage repair
// otherwise. Surjectivity guarantees no subpath appears or vanishes out of
// nowhere.
function bestSurjection(C: number[][]): number[] {
  const B = C.length;
  const S = C[0].length;
  if (S ** B > SURJ_MAX) {
    const f = C.map((row) => {
      let m = 0;
      for (let j = 1; j < row.length; j++) if (row[j] < row[m]) m = j;
      return m;
    });
    const mult = new Array<number>(S).fill(0);
    for (const s of f) mult[s]++;
    for (let s = 0; s < S; s++) {
      if (mult[s] > 0) continue;
      let bi = -1;
      let bc = Number.POSITIVE_INFINITY;
      for (let i = 0; i < B; i++) {
        if (mult[f[i]] < 2) continue; // only donors with multiplicity
        const extra = C[i][s] - C[i][f[i]];
        if (extra < bc) {
          bc = extra;
          bi = i;
        }
      }
      mult[f[bi]]--;
      f[bi] = s;
      mult[s]++;
    }
    return f;
  }
  let best: number[] | null = null;
  let bc = Number.POSITIVE_INFINITY;
  const f = new Array<number>(B);
  const mult = new Array<number>(S).fill(0);
  const rec = (i: number, acc: number, covered: number) => {
    if (acc >= bc || S - covered > B - i) return;
    if (i === B) {
      bc = acc;
      best = f.slice();
      return;
    }
    for (let s = 0; s < S; s++) {
      f[i] = s;
      mult[s]++;
      rec(i + 1, acc + C[i][s], covered + (mult[s] === 1 ? 1 : 0));
      mult[s]--;
    }
  };
  rec(0, 0, 0);
  if (!best) throw new Error("morphicons: no valid surjection (B < S)");
  return best;
}

// Global hybrid: Procrustes over the concatenated clouds with the already
// chosen correspondence. If the global residual ≈ 0 the whole icon is
// congruent and every item shares (θ, σ): coherent block rotation (keeps a
// symmetric subpath from picking the opposite spin).
function applyGlobal(items: PlanItem[], n: number): void {
  const T = items.length * n;
  const ga = new Float64Array(2 * T);
  const gb = new Float64Array(2 * T);
  items.forEach((it, k) => {
    ga.set(it.a, 2 * n * k);
    gb.set(it.bO, 2 * n * k);
  });
  const gca = centroid(ga);
  const g = procrustes(ga, gb, gca, centroid(gb));
  if (g.res >= GLOBAL_EPS) return;
  const cos = Math.cos(-g.theta);
  const sin = Math.sin(-g.theta);
  const rc = Math.cos(g.theta);
  const rs = Math.sin(g.theta);
  for (const it of items) {
    let e2 = 0;
    let nb = 0;
    for (let i = 0; i < n; i++) {
      const bx = it.bO[2 * i] - it.cb[0];
      const by = it.bO[2 * i + 1] - it.cb[1];
      it.bT[2 * i] = (bx * cos - by * sin) / g.sigma;
      it.bT[2 * i + 1] = (bx * sin + by * cos) / g.sigma;
      const ex = g.sigma * (rc * it.aC[2 * i] - rs * it.aC[2 * i + 1]) - bx;
      const ey = g.sigma * (rs * it.aC[2 * i] + rc * it.aC[2 * i + 1]) - by;
      e2 += ex * ex + ey * ey;
      nb += bx * bx + by * by;
    }
    it.theta = g.theta;
    it.lnSigma = Math.log(g.sigma);
    it.res = nb > 1e-12 ? Math.sqrt(e2 / nb) : 0;
    // Block transport: every part spins with the shared θ, but lerping the
    // centroids would send off-center parts along the chord — inside the
    // arc — and the block would deform mid-flight (an arrow's head sags
    // toward its shaft). The centroid rides the shared similarity around
    // the global centroid instead; drift absorbs the (tiny) global residual
    // so t = 1 stays exact. Same ops as the interpolator on purpose: the
    // rotation delta cancels bit-exactly at both endpoints.
    const s1 = Math.exp(it.lnSigma);
    const c1 = Math.cos(it.theta) * s1;
    const n1 = Math.sin(it.theta) * s1;
    const ox = it.ca[0] - gca[0];
    const oy = it.ca[1] - gca[1];
    const rx = ox * c1 - oy * n1 - ox;
    const ry = ox * n1 + oy * c1 - oy;
    it.block = {
      off: [ox, oy],
      drift: [it.cb[0] - it.ca[0] - rx, it.cb[1] - it.ca[1] - ry],
    };
  }
}

/** Builds the morph plan between two lists of sampled subpaths. The plan is
 *  cacheable and serializable; it accepts any list — including intermediate
 *  shapes (interruptions). */
export function buildPlan(
  srcSubs: readonly Sampled[],
  dstSubs: readonly Sampled[],
): MorphPlan {
  const p = srcSubs.length;
  const q = dstSubs.length;
  if (p === 0 || q === 0) throw new Error("morphicons: icon has no subpaths");
  const A = srcSubs.map((s) => s.pts);
  const B = dstSubs.map((s) => s.pts);
  const pairs: Array<[number, number]> = [];
  if (p === q) {
    const perm = bestPermutation(costMatrix(A, B));
    for (let i = 0; i < p; i++) pairs.push([i, perm[i]]);
  } else if (p < q) {
    const f = bestSurjection(costMatrix(B, A));
    for (let j = 0; j < q; j++) pairs.push([f[j], j]);
  } else {
    const f = bestSurjection(costMatrix(A, B));
    for (let i = 0; i < p; i++) pairs.push([i, f[i]]);
  }
  const n = A[0].length / 2;
  const items: PlanItem[] = pairs.map(([si, di]) => {
    const al = alignPair(A[si], B[di], srcSubs[si].closed, dstSubs[di].closed);
    const a = al.a;
    const aC = new Float64Array(2 * n);
    const bT = new Float64Array(2 * n);
    const bO = new Float64Array(2 * n);
    const cos = Math.cos(-al.theta);
    const sin = Math.sin(-al.theta);
    for (let i = 0; i < n; i++) {
      aC[2 * i] = a[2 * i] - al.ca[0];
      aC[2 * i + 1] = a[2 * i + 1] - al.ca[1];
      const bx = al.b[2 * i] - al.cb[0];
      const by = al.b[2 * i + 1] - al.cb[1];
      bT[2 * i] = (bx * cos - by * sin) / al.sigma;
      bT[2 * i + 1] = (bx * sin + by * cos) / al.sigma;
      bO[2 * i] = al.b[2 * i];
      bO[2 * i + 1] = al.b[2 * i + 1];
    }
    return {
      a,
      aC,
      bT,
      bO,
      ca: al.ca,
      cb: al.cb,
      theta: al.theta,
      lnSigma: Math.log(al.sigma),
      res: al.res,
      closed: srcSubs[si].closed && dstSubs[di].closed,
      block: null,
    };
  });
  if (items.length > 1) applyGlobal(items, n);
  return { items, n };
}
