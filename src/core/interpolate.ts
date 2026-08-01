/* Polar interpolation: the similarity is interpolated in its natural space
   (linear angle, log-linear scale, lerped centroid) and applied to the
   residual blend in the aligned frame:
     P(t) = c(t) + σᵗ·R(t·θ)·[(1−t)·aC + t·bT]
   Under the global hybrid the centroid does not lerp — it rides the shared
   similarity around the global centroid (block transport, see plan.ts):
     c(t) = ca + t·drift + (σᵗ·R(t·θ) − I)·off
   so congruent icons stay rigid mid-flight, not only at the endpoints.
   Exact at t=0 and t=1; with spring overshoot (t>1) it extrapolates
   naturally. Raw lerp (linear mode) is kept for comparison. */

import type { MorphPlan } from "./plan";

/** Preallocated output buffers for a plan (zero allocation per frame). */
export function allocOutputs(plan: MorphPlan): Float64Array[] {
  return plan.items.map(() => new Float64Array(2 * plan.n));
}

export function interpPolar(plan: MorphPlan, t: number, out: Float64Array[]): void {
  for (let k = 0; k < plan.items.length; k++) {
    const it = plan.items[k];
    const o = out[k];
    const n = plan.n;
    const s = Math.exp(it.lnSigma * t);
    const ang = it.theta * t;
    const cos = Math.cos(ang) * s;
    const sin = Math.sin(ang) * s;
    let cx: number;
    let cy: number;
    if (it.block) {
      const [ox, oy] = it.block.off;
      const [dx, dy] = it.block.drift;
      cx = it.ca[0] + dx * t + (ox * cos - oy * sin - ox);
      cy = it.ca[1] + dy * t + (ox * sin + oy * cos - oy);
    } else {
      cx = it.ca[0] + (it.cb[0] - it.ca[0]) * t;
      cy = it.ca[1] + (it.cb[1] - it.ca[1]) * t;
    }
    for (let i = 0; i < n; i++) {
      const px = it.aC[2 * i] + (it.bT[2 * i] - it.aC[2 * i]) * t;
      const py = it.aC[2 * i + 1] + (it.bT[2 * i + 1] - it.aC[2 * i + 1]) * t;
      o[2 * i] = cx + px * cos - py * sin;
      o[2 * i + 1] = cy + px * sin + py * cos;
    }
  }
}

/** Raw coordinate lerp (same correspondence, no decomposition). */
export function interpLinear(plan: MorphPlan, t: number, out: Float64Array[]): void {
  for (let k = 0; k < plan.items.length; k++) {
    const it = plan.items[k];
    const o = out[k];
    const n = plan.n;
    for (let i = 0; i < n; i++) {
      o[2 * i] = it.a[2 * i] + (it.bO[2 * i] - it.a[2 * i]) * t;
      o[2 * i + 1] = it.a[2 * i + 1] + (it.bO[2 * i + 1] - it.a[2 * i + 1]) * t;
    }
  }
}
