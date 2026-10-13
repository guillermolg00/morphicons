/* Topology check over real pairs (dev only): rasterizes the plan's frames
   under nonzero and compares t=0 / t=1 against the A / B regions, and every
   frame for holes painting outside their surface. A plan is "broken" when an
   endpoint doesn't render its region (IoU < 0.99); a frame "leaks" when
   more than 1% of its ink has negative winding. Also counts big spins.

     bun bench/region-topology.ts */

import { CONCEPTS, SETS } from "../playground/vendor-regions";
import { svgToIcon } from "../src/adapters/index";
import { allocOutputs, interpPolar } from "../src/core/interpolate";
import { paintOf, signedArea } from "../src/core/region";
import type { Sampled } from "../src/core/types";
import { buildRegionPlan, resampleRegion, toRegion } from "../src/region/index";

const R = 96;
// Off-lattice and different per axis, so 45° edges miss pixel centers.
const PX = 0.618;
const PY = 0.3711;
// Per-pixel winding number of the contours (scanline, nonzero).
function winding(contours: readonly Float64Array[]): Int8Array {
  const wn = new Int8Array(R * R);
  for (let row = 0; row < R; row++) {
    const y = ((row + PY) * 24) / R;
    const xs: number[] = [];
    const ds: number[] = [];
    for (const p of contours) {
      const n = p.length / 2;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const yi = p[2 * i + 1];
        const yj = p[2 * j + 1];
        if (yj <= y !== yi <= y) {
          xs.push(p[2 * j] + ((y - yj) * (p[2 * i] - p[2 * j])) / (yi - yj));
          ds.push(yi > yj ? -1 : 1); // outers (signedArea > 0) wind +1
        }
      }
    }
    const o = xs.map((_, k) => k).sort((a, b) => xs[a] - xs[b]);
    let w = 0;
    for (let k = 0; k < o.length - 1; k++) {
      w += ds[o[k]];
      if (w === 0) continue;
      const c0 = Math.max(0, Math.ceil((xs[o[k]] * R) / 24 - PX));
      const c1 = Math.min(R, Math.ceil((xs[o[k + 1]] * R) / 24 - PX));
      wn.fill(w, row * R + c0, row * R + c1);
    }
  }
  return wn;
}
const raster = (contours: readonly Float64Array[]) =>
  winding(contours).map((w) => (w ? 1 : 0));
const iou = (a: Int8Array, b: Int8Array) => {
  let i = 0;
  let u = 0;
  for (let k = 0; k < a.length; k++) {
    i += a[k] & b[k];
    u += a[k] | b[k];
  }
  return u ? i / u : 1;
};

const icons: Array<{ id: string; s: Sampled[]; fill: boolean }> = [];
for (const [key, set] of Object.entries(SETS))
  for (const c of CONCEPTS) {
    const e = set.icons[c];
    if (!e) continue;
    const sw = /stroke-width="([\d.]+)"/.exec(e.svg);
    const icon = svgToIcon(e.svg);
    icons.push({
      id: `${key}:${c}`,
      s: resampleRegion(toRegion(icon, { strokeWidth: sw ? Number(sw[1]) : 2 })),
      fill: paintOf(icon) === "fill",
    });
  }

// every icon → the same concept in every other set, and → the next concept;
// only pairs that fly as regions (one side painted by fill — stroke ↔
// stroke keeps the centerline pipeline)
const pairs: Array<[number, number]> = [];
icons.forEach((a, i) => {
  icons.forEach((b, j) => {
    if (i === j || !(a.fill || b.fill)) return;
    const [, ca] = a.id.split(":");
    const [sb, cb] = b.id.split(":");
    if (ca === cb || (sb === a.id.split(":")[0] && j === i + 1)) pairs.push([i, j]);
  });
});

// Mid-flight: a pixel with negative winding is a hole outside its outer,
// painting under nonzero (the crescent of a hole sliding off its body).
const MID = [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875];
let broken = 0;
let leaky = 0;
let spun = 0; // same concept, main outer turning > 46° (a star by a fifth…)
let same = 0;
const worst: Array<[string, number, number]> = [];
const leaks: Array<[string, number, number]> = [];
for (const [i, j] of pairs) {
  const A = icons[i].s;
  const B = icons[j].s;
  const plan = buildRegionPlan(A, B);
  const out = allocOutputs(plan);
  interpPolar(plan, 0, out);
  const e0 = iou(raster(out), raster(A.map((s) => s.pts)));
  interpPolar(plan, 1, out);
  const e1 = iou(raster(out), raster(B.map((s) => s.pts)));
  if (Math.min(e0, e1) < 0.99) {
    broken++;
    worst.push([`${icons[i].id} → ${icons[j].id}`, e0, e1]);
  }
  if (icons[i].id.split(":")[1] === icons[j].id.split(":")[1]) {
    same++;
    let main = plan.items[0];
    for (const it of plan.items)
      if (!it.hole && Math.abs(signedArea(it.a)) > Math.abs(signedArea(main.a)))
        main = it;
    if (Math.abs(main.theta) > 0.8) spun++;
  }
  let leak = 0;
  let at = 0;
  for (const t of MID) {
    interpPolar(plan, t, out);
    const wn = winding(out);
    let neg = 0;
    let ink = 0;
    for (const w of wn) {
      if (w < 0) neg++;
      if (w) ink++;
    }
    if (ink && neg / ink > leak) {
      leak = neg / ink;
      at = t;
    }
  }
  if (leak > 0.01) {
    leaky++;
    leaks.push([`${icons[i].id} → ${icons[j].id}`, leak, at]);
  }
}
worst.sort((x, y) => Math.min(x[1], x[2]) - Math.min(y[1], y[2]));
leaks.sort((x, y) => y[1] - x[1]);
console.log(
  `${pairs.length} pairs · ${broken} with an endpoint that doesn't render its region`,
);
for (const [id, e0, e1] of worst.slice(0, 15))
  console.log(`  ${id}  t0 ${e0.toFixed(3)}  t1 ${e1.toFixed(3)}`);
console.log(`${leaky} with a hole painting outside its surface mid-flight (> 1% of ink)`);
for (const [id, leak, t] of leaks.slice(0, 15))
  console.log(`  ${id}  ${(leak * 100).toFixed(1)}% at t=${t}`);
console.log(`${spun} of ${same} same-concept pairs turn their main outer > 46°`);
