/* Serialization. In flight each subpath is emitted as a polyline
   `M x y L x y …` with 2 decimals — invisible at 24px, and Math.round is
   faster than toFixed. It is the frame's only allocation. On settle, the
   driver snaps to the target icon's canonical `d` (exact fidelity at rest). */

import type { CubicPath } from "./types";

function fmt(v: number): string {
  return String(Math.round(v * 100) / 100);
}

/** Sampled subpaths → polyline `d` attribute. `closed[k]` appends Z to
 *  subpath k (closed loops in flight); without flags everything is open. */
export function serialize(
  subs: readonly Float64Array[],
  closed?: readonly boolean[],
): string {
  let d = "";
  for (let k = 0; k < subs.length; k++) {
    const o = subs[k];
    const n = o.length / 2;
    d += `M${fmt(o[0])} ${fmt(o[1])}`;
    for (let i = 1; i < n; i++) d += `L${fmt(o[2 * i])} ${fmt(o[2 * i + 1])}`;
    if (closed?.[k]) d += "Z";
  }
  return d;
}

/* Canonical emission uses 4 decimals instead: still invisible at 24px, but
   here the point is byte stability, not size. Arc→cubic conversion goes
   through trig whose last ulp differs across JS engines (V8 vs JSC), and SSR
   hydration compares the server's d against the browser's byte by byte —
   full-precision tails made those differ (Next hydration mismatch on icons
   with non-cardinal arcs, e.g. lucide's eye). Quantization absorbs the ulp;
   parse → emit round-trips within 5e-5 (pinned in normalize.test.ts). */
function fmtCanon(v: number): string {
  return String(Math.round(v * 1e4) / 1e4);
}

/** Cubic subpaths → canonical `d`, quantized to 4 decimals (engine-stable
 *  bytes; see fmtCanon). */
export function cubicsToPathD(paths: readonly CubicPath[]): string {
  let d = "";
  for (const { pts, closed } of paths) {
    d += `M${fmtCanon(pts[0])} ${fmtCanon(pts[1])}`;
    for (let i = 2; i < pts.length; i += 6) {
      d += `C${fmtCanon(pts[i])} ${fmtCanon(pts[i + 1])} ${fmtCanon(pts[i + 2])} ${fmtCanon(
        pts[i + 3],
      )} ${fmtCanon(pts[i + 4])} ${fmtCanon(pts[i + 5])}`;
    }
    if (closed) d += "Z";
  }
  return d;
}
