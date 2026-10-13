/* Region plans (lazy chunk — loaded with the normalizer, never by
   stroke-only apps). Filled contours morph under three rules on top of the
   centerline plan; see the block comment below. */

import { iconToCubics } from "../core/normalize";
import {
  applyGlobal,
  centroid,
  costMatrix,
  type MorphPlan,
  makeItem,
  type PlanItem,
  pairUp,
  rotatePts,
  SURJ_MAX,
} from "../core/plan";
import { signedArea } from "../core/region";
import { resamplePath } from "../core/resample";
import type { IconInput, Sampled } from "../core/types";

/* Region contours are dense polylines (the normalizer emits one vertex per
   ~⅛ px along curves). With the stroke threshold (22.5°) a tight arc would
   anchor every vertex and exhaust the N intervals, so regions anchor only
   real corners; if a contour still has more corners than intervals, the
   threshold relaxes until it fits (a gear with 40 teeth samples fine). */
const REGION_THRESHOLDS = [Math.PI / 4, Math.PI / 3, Math.PI / 2, Math.PI];

/** Samples a normalized region: one Sampled per contour, every one closed,
 *  `hole` read from the winding (outers positive, holes negative). */
export function resampleRegion(icon: IconInput, N = 64): Sampled[] {
  return iconToCubics(icon).map((path) => {
    let pts: Float64Array | undefined;
    for (const th of REGION_THRESHOLDS) {
      try {
        pts = resamplePath({ pts: path.pts, closed: true }, N, th);
        break;
      } catch {
        // more corners than intervals at this threshold — relax it (π
        // anchors nothing, so the last threshold always fits)
      }
    }
    const s = pts as Float64Array;
    return { pts: s, closed: true, hole: signedArea(s) < 0 };
  });
}

// ---------------------------------------------------------------------------
// Regions. Rules on top of the centerline plan — all of them about the
// winding, which IS the picture under nonzero:
//   1. Direction is locked (alignPair without reversal): winding is meaning.
//   2. Outers pair with outers. Cell division (one contour duplicated onto
//      several) is allowed only for contours WITHOUT holes: two coincident
//      copies sum to winding +2, and a hole (−1) inside them would paint.
//      A piece that can't be placed collapses (or grows) in place.
//   3. Holes pair one-to-one, only with holes of the paired outer and only
//      with a hole they overlap (holeCosts). A hole flies in its outer's
//      frame (inFrame): a hole outside every outer winds −1 and paints. One
//      without partner collapses to a point (ring → disc) or grows from one,
//      on one half of the flight.
//   4. A piece that vanishes takes its holes with it: outer and holes share
//      one homothety toward the same point, so they stay nested at every t.

// Rotation tie-break for outers (score = res + λ·|θ|/π; centerlines use
// 0.05). Filled contours are mostly symmetric — a star, a house, a disc —
// and tie in residual for a turn that maps them onto themselves: a fifth of
// a star, a house upside down. Icons stand upright, so a spin has to buy a
// real residual gain (a moon drawn rotated keeps its 90°: gain ≈ 0.4).
const REGION_LAMBDA = 0.3;

/** Even-odd point-in-polygon against a closed sampled cloud. */
function inside(px: number, py: number, p: Float64Array): boolean {
  const n = p.length / 2;
  let c = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const yi = p[2 * i + 1];
    const yj = p[2 * j + 1];
    if (
      yi > py !== yj > py &&
      px < ((p[2 * j] - p[2 * i]) * (py - yi)) / (yj - yi) + p[2 * i]
    )
      c = !c;
  }
  return c;
}

// The outer (index into subs) whose surface a hole pierces: the smallest
// outer containing points OF the hole's contour (majority of three). Not its
// centroid: in a camera the body's window is centered on the lens, an outer
// that sits inside the window — the centroid would pick the lens.
function parentOf(hole: Float64Array, subs: readonly Sampled[]): number {
  const n = hole.length / 2;
  let best = -1;
  let bestArea = Infinity;
  subs.forEach((s, k) => {
    if (s.hole) return;
    let votes = 0;
    for (const v of [0, Math.floor(n / 3), Math.floor((2 * n) / 3)])
      if (inside(hole[2 * v], hole[2 * v + 1], s.pts)) votes++;
    if (votes < 2) return;
    const ar = Math.abs(signedArea(s.pts));
    if (ar < bestArea) {
      bestArea = ar;
      best = k;
    }
  });
  return best;
}

type Pt = readonly [number, number];
type Frame = Pick<PlanItem, "ca" | "cb" | "theta" | "lnSigma" | "block">;

// Assignment of rows to columns at minimum cost. one[j] caps column j at a
// single row (else it takes several — cell division); skip[i] is the cost
// of leaving row i out (−1); an infinite cost forbids a pair; with `cover`
// every column gets a row. Exhaustive with pruning when small, greedy
// otherwise.
function assign(C: number[][], skip: number[], one: boolean[], cover: boolean): number[] {
  const L = C.length;
  const S = one.length;
  const f = new Array<number>(L).fill(-1);
  const mult = new Array<number>(S).fill(0);
  if ((S + 1) ** L > SURJ_MAX) {
    const pairs: Array<[number, number, number]> = [];
    for (let i = 0; i < L; i++)
      for (let j = 0; j < S; j++) if (C[i][j] < Infinity) pairs.push([C[i][j], i, j]);
    pairs.sort((x, y) => x[0] - y[0]);
    for (const [, i, j] of pairs)
      if (f[i] < 0 && !mult[j]) {
        f[i] = j;
        mult[j] = 1;
      }
    // leftovers divide onto the cheapest column that takes several
    for (let i = 0; i < L; i++) {
      if (f[i] >= 0) continue;
      for (let j = 0; j < S; j++)
        if (!one[j] && (f[i] < 0 || C[i][j] < C[i][f[i]])) f[i] = j;
    }
    return f;
  }
  let best = f.slice();
  let bc = Infinity;
  const rec = (i: number, acc: number, covered: number) => {
    if (acc >= bc || (cover && S - covered > L - i)) return;
    if (i === L) {
      bc = acc;
      best = f.slice();
      return;
    }
    for (let j = 0; j < S; j++) {
      if ((one[j] && mult[j]) || !(C[i][j] < Infinity)) continue;
      f[i] = j;
      mult[j]++;
      rec(i + 1, acc + C[i][j], covered + (mult[j] === 1 ? 1 : 0));
      mult[j]--;
    }
    f[i] = -1;
    rec(i + 1, acc + skip[i], covered);
  };
  rec(0, 0, 0);
  return best;
}

// Leaving a piece out always costs more than any placement: fewest
// vanishing pieces (unmatched holes) first, then the cheapest.
const SKIP = 1e6;

// (x, y) carried through a similarity: to + s·R(θ)·((x, y) − from).
function carry(x: number, y: number, from: Pt, to: Pt, theta: number, s: number): Pt {
  const c = Math.cos(theta) * s;
  const n = Math.sin(theta) * s;
  const dx = x - from[0];
  const dy = y - from[1];
  return [to[0] + dx * c - dy * n, to[1] + dx * n + dy * c];
}

// n copies of one point: the far endpoint of something that vanishes.
function dots(c: Pt, n: number): Float64Array {
  const d = new Float64Array(2 * n);
  for (let i = 0; i < 2 * n; i += 2) {
    d[i] = c[0];
    d[i + 1] = c[1];
  }
  return d;
}

// An item flying in a borrowed frame — another item's centroids, θ, σ and
// block: P(t) = c(t) + σᵗR(tθ)·[(1−m)(a − c_A) + m·R(−θ)(b − c_B)/σ], with
// m = t (or one half of it, see PlanItem.half). A hole flies in its outer's
// frame so the two lerp side by side in one frame: with a similarity of its
// own a hole spins or drifts apart from its outer (a star ring's inner star
// picks the other spin) and its tips paint outside the surface. The cut of
// b is chosen under that rotation; b may be a point (dots).
function inFrame(
  a: Float64Array,
  b: Float64Array,
  f: Frame,
  hole: boolean,
  half?: 0 | 1,
): PlanItem {
  const n = a.length / 2;
  const s = Math.exp(f.lnSigma);
  const aC = new Float64Array(2 * n);
  const bt = new Float64Array(2 * n);
  let nb = 0;
  for (let i = 0; i < 2 * n; i += 2) {
    aC[i] = a[i] - f.ca[0];
    aC[i + 1] = a[i + 1] - f.ca[1];
    [bt[i], bt[i + 1]] = carry(b[i], b[i + 1], f.cb, [0, 0], -f.theta, 1 / s);
    nb += (b[i] - f.cb[0]) ** 2 + (b[i + 1] - f.cb[1]) ** 2;
  }
  let off = 0;
  let be = Infinity;
  for (let o = 0; o < n && be > 0; o++) {
    let e = 0;
    for (let i = 0; i < n && e < be; i++) {
      const j = (i + o) % n;
      e += (aC[2 * i] - bt[2 * j]) ** 2 + (aC[2 * i + 1] - bt[2 * j + 1]) ** 2;
    }
    if (e < be) {
      be = e;
      off = o;
    }
  }
  return {
    a,
    aC,
    bT: rotatePts(bt, off),
    bO: rotatePts(b, off),
    ca: f.ca,
    cb: f.cb,
    theta: f.theta,
    lnSigma: f.lnSigma,
    res: nb > 1e-12 ? Math.sqrt((s * s * be) / nb) : 0,
    closed: true,
    hole,
    half,
    block: f.block,
  };
}

// A hole on one side only (`grow` = it exists in B): its far endpoint is
// its centroid carried through the outer's similarity. It is gone by
// mid-flight, or born after it: the outer has barely deformed while the
// hole is large, so it can't slide out of it, and a hole that collapses
// never overlaps one that grows in its place (two holes on one spot wind
// −1 and paint).
function vanishingHole(pts: Float64Array, outer: PlanItem, grow: boolean): PlanItem {
  const s = Math.exp(outer.lnSigma);
  const [x, y] = centroid(pts);
  const dot = dots(
    grow
      ? carry(x, y, outer.cb, outer.ca, -outer.theta, 1 / s)
      : carry(x, y, outer.ca, outer.cb, outer.theta, s),
    pts.length / 2,
  );
  return grow ? inFrame(dot, pts, outer, true, 1) : inFrame(pts, dot, outer, true, 0);
}

// A piece (outer + its holes) on one side only: every point flies along
// ONE homothety toward the outer's centroid — P(t) = (1−t)·p + t·c when it
// collapses, (1−t)·c + t·p when it grows — so its holes stay nested inside
// it at every t (overshoot included: a negative factor is a point
// reflection, which keeps orientation).
function vanishingPiece(
  outer: Float64Array,
  holes: readonly Float64Array[],
  grow: boolean,
): PlanItem[] {
  const c = centroid(outer);
  const f: Frame = { ca: c, cb: c, theta: 0, lnSigma: 0, block: null };
  const dot = dots(c, outer.length / 2);
  return [outer, ...holes].map((p, k) =>
    grow ? inFrame(dot, p, f, k > 0) : inFrame(p, dot, f, k > 0),
  );
}

// Cost of a piece vanishing: matching it against a point at its centroid.
const vanishCost = (pts: Float64Array): number =>
  costMatrix([pts], [dots(centroid(pts), pts.length / 2)])[0][0];

// Bounding box [x0, y0, x1, y1] of a point cloud.
function bbox(p: Float64Array): [number, number, number, number] {
  const b: [number, number, number, number] = [p[0], p[1], p[0], p[1]];
  for (let i = 2; i < p.length; i += 2) {
    b[0] = Math.min(b[0], p[i]);
    b[1] = Math.min(b[1], p[i + 1]);
    b[2] = Math.max(b[2], p[i]);
    b[3] = Math.max(b[3], p[i + 1]);
  }
  return b;
}

// Two holes may pair only if they overlap where they are — bounding boxes
// with IoU ≥ HOLE_IOU once B is in the outer's frame. A hole blending into
// one elsewhere, or of another size (a trash can's lid gap into one of the
// slats), sweeps across the holes around it, and two holes on one spot wind
// −1 and paint. Unpaired holes collapse and grow on separate halves of the
// flight instead, so they never meet.
const HOLE_IOU = 0.25;
function holeCosts(HA: Float64Array[], HB: Float64Array[], outer: PlanItem): number[][] {
  const s = Math.exp(outer.lnSigma);
  const C = costMatrix(HA, HB);
  const inA = HB.map((h) => {
    const q = new Float64Array(h.length);
    for (let i = 0; i < h.length; i += 2)
      [q[i], q[i + 1]] = carry(h[i], h[i + 1], outer.cb, outer.ca, -outer.theta, 1 / s);
    return bbox(q);
  });
  HA.forEach((h, i) => {
    const a = bbox(h);
    inA.forEach((b, j) => {
      const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
      const v = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
      const inter = w > 0 && v > 0 ? w * v : 0;
      const union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter;
      if (!(inter >= HOLE_IOU * union)) C[i][j] = Infinity;
    });
  });
  return C;
}

interface Pieces {
  outers: Float64Array[];
  holes: Float64Array[][]; // per outer: the holes it is pierced by
}

// Outers and the holes each one is pierced by (smallest containing outer;
// an orphan hole — numerically outside every outer — goes to the nearest).
function piecesOf(subs: readonly Sampled[]): Pieces {
  const idx: number[] = [];
  subs.forEach((s, k) => {
    if (!s.hole) idx.push(k);
  });
  const holes: Float64Array[][] = idx.map(() => []);
  subs.forEach((s) => {
    if (!s.hole) return;
    let k = idx.indexOf(parentOf(s.pts, subs));
    if (k < 0) {
      const [hx, hy] = centroid(s.pts);
      let bd = Infinity;
      idx.forEach((o, m) => {
        const [ox, oy] = centroid(subs[o].pts);
        const d = Math.hypot(ox - hx, oy - hy);
        if (d < bd) {
          bd = d;
          k = m;
        }
      });
    }
    holes[k].push(s.pts);
  });
  return { outers: idx.map((k) => subs[k].pts), holes };
}

/** Region plan: outers ↔ outers (holed contours never duplicated), holes ↔
 *  overlapping holes of the paired outer, direction locked; whatever has no
 *  partner collapses/grows without ever breaking the nesting (rules above).
 *  Every item flies closed. */
export function buildRegionPlan(
  srcSubs: readonly Sampled[],
  dstSubs: readonly Sampled[],
): MorphPlan {
  const n = srcSubs[0].pts.length / 2;
  const A = piecesOf(srcSubs);
  const B = piecesOf(dstSubs);
  if (A.outers.length === 0 || B.outers.length === 0)
    throw new Error("morphicons: region has no outer contour");

  // Outer pairs [i, j]; −1 = the piece vanishes on that side. The larger
  // side maps onto the smaller (cell division), except that a contour with
  // holes takes at most one partner (rule 2).
  let pairs: Array<[number, number]>;
  const p = A.outers.length;
  const q = B.outers.length;
  const [large, small] = p < q ? [B, A] : [A, B];
  if (p === q || small.holes.every((h) => h.length === 0)) {
    pairs = pairUp(A.outers, B.outers); // historical cell division, safe
  } else {
    const f = assign(
      costMatrix(large.outers, small.outers),
      large.outers.map((o) => SKIP + vanishCost(o)),
      small.holes.map((h) => h.length > 0),
      true,
    );
    pairs = f.map((s, l) => (p < q ? [s, l] : [l, s]));
  }

  const items: PlanItem[] = [];
  let partial = false; // some piece or hole vanishes: no global hybrid
  for (const [i, j] of pairs) {
    if (i < 0 || j < 0) {
      partial = true;
      items.push(
        ...(i < 0
          ? vanishingPiece(B.outers[j], B.holes[j], true)
          : vanishingPiece(A.outers[i], A.holes[i], false)),
      );
      continue;
    }
    const it = makeItem(A.outers[i], B.outers[j], true, true, false, REGION_LAMBDA);
    it.hole = false;
    items.push(it);
    // A duplicated contour has no holes (rule 2), so every hole is
    // visited exactly once, by the one pair its outer belongs to.
    const HA = A.holes[i];
    const HB = B.holes[j];
    const f = assign(
      holeCosts(HA, HB, it),
      HA.map(() => SKIP),
      HB.map(() => true),
      false,
    );
    HA.forEach((h, k) => {
      items.push(f[k] < 0 ? vanishingHole(h, it, false) : inFrame(h, HB[f[k]], it, true));
    });
    HB.forEach((h, k) => {
      if (!f.includes(k)) items.push(vanishingHole(h, it, true));
    });
    const m = f.filter((x) => x >= 0).length;
    if (m < HA.length || m < HB.length) partial = true;
  }
  // The global hybrid only for congruent regions where everything pairs
  // (a vanishing hole already rides its outer's similarity).
  if (items.length > 1 && !partial) applyGlobal(items, n);
  return { items, n };
}
