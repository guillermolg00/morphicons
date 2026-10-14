/* Paint model and region sampling. A morph between two stroke icons flies
   as centerlines (the historical pipeline, untouched). Any pair where one
   side is painted by FILL flies as REGIONS: both endpoints are reduced to
   the visible surface — closed contours, outers wound positive and holes
   negative under the nonzero rule — so a cross made of two overlapping
   rectangles and a cross drawn as one outline are the same geometry.

   This module is the cheap, always-present half (pure, a few hundred
   bytes): it reads the paint of an icon. Producing the region (stroke
   outlining, unions, fill rules), sampling it and planning region morphs
   is the lazy half in src/region/. */

import type { IconInput, IconNodeAttrs } from "./types";

/** How an icon is painted: centerlines with a stroke, or filled surface. */
export type Paint = "stroke" | "fill";

/** Attribute that marks an IconNode as an already-normalized region (the
 *  output of `toRegion`): one `<path>` of non-overlapping closed contours,
 *  outers positive, holes negative. Normalization skips it. */
export const REGION_ATTR = "data-region";

/** A paint attribute that paints (not absent, not `none`). */
export const painted = (v: unknown): boolean =>
  v !== undefined && String(v).trim().toLowerCase() !== "none";

/** Paint of an icon. Raw `d` strings and IconNodes that never declare a
 *  painted fill are stroke icons — the historical contract, so every
 *  existing input keeps its meaning. One element with a painted `fill` makes
 *  the whole icon a fill icon (mixed stroke+fill icons need the region path
 *  too: their silhouette is not a set of centerlines). */
export function paintOf(icon: IconInput): Paint {
  if (typeof icon === "string") return "stroke";
  for (const [, a] of icon) if (painted(a.fill)) return "fill";
  return "stroke";
}

/** A duotone background layer (Phosphor: opacity 0.2) is not part of a
 *  monochrome silhouette: one path can't paint it translucent, so it is
 *  dropped from a fill icon rather than painted opaque. */
export const translucent = (a: IconNodeAttrs): boolean =>
  Number.parseFloat(String(a.opacity)) < 0.5 ||
  Number.parseFloat(String(a["fill-opacity"])) < 0.5;

/** The elements a fill icon actually draws: its translucent layers out. */
export function solid(icon: IconInput): IconInput {
  return typeof icon === "string" || paintOf(icon) === "stroke"
    ? icon
    : icon.filter(([, a]) => !translucent(a));
}

/** True when the icon is already a normalized region (no work left). */
export function isRegion(icon: IconInput): boolean {
  return typeof icon !== "string" && icon.length === 1 && REGION_ATTR in icon[0][1];
}

/** Even-odd point-in-polygon against a closed point cloud. */
export function inside(px: number, py: number, p: Float64Array): boolean {
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

/** Distance from (px, py) to the segment ab. */
export function distSeg(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = px - ax - t * dx;
  const ey = py - ay - t * dy;
  return Math.sqrt(ex * ex + ey * ey); // not Math.hypot: ~10× slower in V8/JSC
}

/** Shoelace signed area of a closed point cloud (SVG axes: y down). */
export function signedArea(p: Float64Array): number {
  const n = p.length / 2;
  let a = 0;
  for (let i = 0, j = n - 1; i < n; j = i++)
    a += p[2 * j] * p[2 * i + 1] - p[2 * i] * p[2 * j + 1];
  return a / 2;
}
