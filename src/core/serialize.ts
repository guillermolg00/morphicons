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

/** Cubic subpaths → canonical `d` at full precision (round-trip). */
export function cubicsToPathD(paths: readonly CubicPath[]): string {
  let d = "";
  for (const { pts, closed } of paths) {
    d += `M${pts[0]} ${pts[1]}`;
    for (let i = 2; i < pts.length; i += 6) {
      d += `C${pts[i]} ${pts[i + 1]} ${pts[i + 2]} ${pts[i + 3]} ${pts[i + 4]} ${
        pts[i + 5]
      }`;
    }
    if (closed) d += "Z";
  }
  return d;
}
