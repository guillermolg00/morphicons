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
// Regions. Three rules on top of the centerline plan:
//   1. Direction is locked (alignPair without reversal): winding is meaning.
//   2. Outers pair with outers (cell division allowed: overlapping copies
//      of a filled outer render as their union under nonzero) and holes
//      pair one-to-one with holes. A duplicated hole would NOT be harmless:
//      two coincident holes inside one outer sum to winding −1 and paint.
//   3. A hole without partner collapses to a point (ring → disc) or grows
//      from one, riding its parent outer's similarity rigidly (block
//      transport) so it never drifts outside the surface it pierces — a
//      hole outside every outer has winding −1 and would paint as a blob.

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
// outer containing the hole's centroid (fallback: its first vertex).
function parentOf(hole: Float64Array, subs: readonly Sampled[]): number {
  const [cx, cy] = centroid(hole);
  let best = -1;
  let bestArea = Number.POSITIVE_INFINITY;
  for (const [x, y] of [
    [cx, cy],
    [hole[0], hole[1]],
  ]) {
    subs.forEach((s, k) => {
      if (s.hole || !inside(x, y, s.pts)) return;
      const ar = Math.abs(signedArea(s.pts));
      if (ar < bestArea) {
        bestArea = ar;
        best = k;
      }
    });
    if (best >= 0) return best;
  }
  return best;
}

// One-to-one assignment of the r rows into distinct columns (r ≤ c),
// minimum cost. Exhaustive with pruning when small, greedy otherwise.
function bestInjection(C: number[][]): number[] {
  const r = C.length;
  const c = r ? C[0].length : 0;
  if (c ** r > SURJ_MAX) {
    const pairs: Array<[number, number, number]> = [];
    for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) pairs.push([C[i][j], i, j]);
    pairs.sort((x, y) => x[0] - y[0]);
    const out = new Array<number>(r).fill(-1);
    const used = new Array<boolean>(c).fill(false);
    for (const [, i, j] of pairs) {
      if (out[i] < 0 && !used[j]) {
        out[i] = j;
        used[j] = true;
      }
    }
    return out;
  }
  let best = new Array<number>(r).fill(-1);
  let bc = Number.POSITIVE_INFINITY;
  const f = new Array<number>(r);
  const used = new Array<boolean>(c).fill(false);
  const rec = (i: number, acc: number) => {
    if (acc >= bc) return;
    if (i === r) {
      bc = acc;
      best = f.slice();
      return;
    }
    for (let j = 0; j < c; j++) {
      if (used[j]) continue;
      used[j] = true;
      f[i] = j;
      rec(i + 1, acc + C[i][j]);
      used[j] = false;
    }
  };
  rec(0, 0);
  return best;
}

// A hole that exists on one side only. `grow` = it appears (exists in B).
// Its far endpoint is a single point: the hole's centroid carried through
// the parent outer's similarity, and the whole item rides that similarity
// as a rigid block around the parent's centroid (see interpPolar).
function vanishingHole(
  pts: Float64Array,
  parent: PlanItem | undefined,
  grow: boolean,
): PlanItem {
  const n = pts.length / 2;
  const hc = centroid(pts);
  const theta = parent?.theta ?? 0;
  const lnSigma = parent?.lnSigma ?? 0;
  const s = Math.exp(lnSigma);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const pa = parent?.ca ?? hc;
  const pb = parent?.cb ?? hc;
  // Map the centroid to the other side: forward (A→B) σR(θ)(x − c_A) + c_B,
  // or its inverse for a growing hole.
  let far: [number, number];
  if (grow) {
    const dx = hc[0] - pb[0];
    const dy = hc[1] - pb[1];
    far = [pa[0] + (dx * cos + dy * sin) / s, pa[1] + (-dx * sin + dy * cos) / s];
  } else {
    const dx = hc[0] - pa[0];
    const dy = hc[1] - pa[1];
    far = [pb[0] + s * (dx * cos - dy * sin), pb[1] + s * (dx * sin + dy * cos)];
  }
  const ca: readonly [number, number] = grow ? far : hc;
  const cb: readonly [number, number] = grow ? hc : far;
  const a = new Float64Array(2 * n);
  const aC = new Float64Array(2 * n);
  const bT = new Float64Array(2 * n);
  const bO = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) {
    if (grow) {
      a[2 * i] = ca[0];
      a[2 * i + 1] = ca[1];
      bO[2 * i] = pts[2 * i];
      bO[2 * i + 1] = pts[2 * i + 1];
      // B in A's frame: R(−θ)(b − c_B)/σ
      const bx = pts[2 * i] - cb[0];
      const by = pts[2 * i + 1] - cb[1];
      bT[2 * i] = (bx * cos + by * sin) / s;
      bT[2 * i + 1] = (-bx * sin + by * cos) / s;
    } else {
      a[2 * i] = pts[2 * i];
      a[2 * i + 1] = pts[2 * i + 1];
      aC[2 * i] = pts[2 * i] - ca[0];
      aC[2 * i + 1] = pts[2 * i + 1] - ca[1];
      bO[2 * i] = cb[0];
      bO[2 * i + 1] = cb[1];
    }
  }
  return {
    a,
    aC,
    bT,
    bO,
    ca,
    cb,
    theta,
    lnSigma,
    res: 0,
    closed: true,
    hole: true,
    // c(t) = c_A + t·drift + (σᵗR(tθ) − I)·off rides the parent: with
    // off = c_A − parent.c_A and drift = parent.c_B − parent.c_A it equals
    // parent.c(t) + σᵗR(tθ)·off, and c(1) = c_B by construction.
    block: { off: [ca[0] - pa[0], ca[1] - pa[1]], drift: [pb[0] - pa[0], pb[1] - pa[1]] },
  };
}

/** Region plan: outers ↔ outers, holes ↔ holes, direction locked, holes
 *  without partner collapse/grow inside their parent (rules above). Every
 *  item flies closed. */
export function buildRegionPlan(
  srcSubs: readonly Sampled[],
  dstSubs: readonly Sampled[],
): MorphPlan {
  const n = srcSubs[0].pts.length / 2;
  const sO: number[] = [];
  const sH: number[] = [];
  const dO: number[] = [];
  const dH: number[] = [];
  srcSubs.forEach((s, i) => {
    (s.hole ? sH : sO).push(i);
  });
  dstSubs.forEach((s, i) => {
    (s.hole ? dH : dO).push(i);
  });
  if (sO.length === 0 || dO.length === 0)
    throw new Error("morphicons: region has no outer contour");
  const items: PlanItem[] = [];
  // item index per src / dst outer, for hole parenting
  const bySrc = new Map<number, PlanItem>();
  const byDst = new Map<number, PlanItem>();
  for (const [i, j] of pairUp(
    sO.map((k) => srcSubs[k].pts),
    dO.map((k) => dstSubs[k].pts),
  )) {
    const it = makeItem(srcSubs[sO[i]].pts, dstSubs[dO[j]].pts, true, true, false);
    it.hole = false;
    items.push(it);
    if (!bySrc.has(sO[i])) bySrc.set(sO[i], it);
    if (!byDst.has(dO[j])) byDst.set(dO[j], it);
  }
  const HA = sH.map((k) => srcSubs[k].pts);
  const HB = dH.map((k) => dstSubs[k].pts);
  const matchedA = new Set<number>();
  const matchedB = new Set<number>();
  if (HA.length && HB.length) {
    const flip = HA.length > HB.length;
    const f = flip
      ? bestInjection(costMatrix(HB, HA))
      : bestInjection(costMatrix(HA, HB));
    f.forEach((j, i) => {
      const [ia, ib] = flip ? [j, i] : [i, j];
      if (ia < 0 || ib < 0) return;
      matchedA.add(ia);
      matchedB.add(ib);
      const it = makeItem(HA[ia], HB[ib], true, true, false);
      it.hole = true;
      items.push(it);
    });
  }
  HA.forEach((pts, i) => {
    if (!matchedA.has(i))
      items.push(vanishingHole(pts, bySrc.get(parentOf(pts, srcSubs)), false));
  });
  HB.forEach((pts, j) => {
    if (!matchedB.has(j))
      items.push(vanishingHole(pts, byDst.get(parentOf(pts, dstSubs)), true));
  });
  // The global hybrid only for congruent regions with every hole paired
  // (a vanishing hole already rides its parent's similarity).
  if (items.length > 1 && matchedA.size === HA.length && matchedB.size === HB.length)
    applyGlobal(items, n);
  return { items, n };
}
