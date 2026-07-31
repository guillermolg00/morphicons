/* morphicons spike — math core, zero dependencies.
   Icon = list of subpaths; subpath = polyline of vertices (corners).
   Pipeline: resample (arc-length + anchored corners) → subpath matching
   → 2D Procrustes (closed form) → polar interpolation → serialize. */

// ---------- resampling ----------
// Samples an open polyline at N points equidistant by arc length, forcing
// every vertex (corner) to be exactly a sample point. Interval apportionment
// per segment: proportional to length, minimum 1, largest-remainder method
// so they sum exactly to N-1.
function resample(verts, N) {
  const m = verts.length - 1;
  const lens = new Array(m);
  let L = 0;
  for (let k = 0; k < m; k++) {
    const dx = verts[k + 1][0] - verts[k][0];
    const dy = verts[k + 1][1] - verts[k][1];
    lens[k] = Math.hypot(dx, dy);
    L += lens[k];
  }
  const ideal = lens.map((l) => ((N - 1) * l) / (L || 1));
  const counts = ideal.map((q) => Math.max(1, Math.floor(q)));
  let R = N - 1 - counts.reduce((a, b) => a + b, 0);
  if (R > 0) {
    const order = ideal
      .map((q, i) => [q - Math.floor(q), i])
      .sort((a, b) => b[0] - a[0]);
    for (let j = 0; j < R; j++) counts[order[j % m][1]]++;
  }
  while (R < 0) {
    let bi = 0;
    for (let i = 1; i < m; i++) if (counts[i] > counts[bi]) bi = i;
    if (counts[bi] <= 1) break;
    counts[bi]--;
    R++;
  }
  const out = new Float64Array(N * 2);
  let idx = 0;
  for (let k = 0; k < m; k++) {
    const x0 = verts[k][0], y0 = verts[k][1];
    const x1 = verts[k + 1][0], y1 = verts[k + 1][1];
    for (let j = 0; j < counts[k]; j++) {
      const t = j / counts[k];
      out[idx * 2] = x0 + (x1 - x0) * t;
      out[idx * 2 + 1] = y0 + (y1 - y0) * t;
      idx++;
    }
  }
  out[idx * 2] = verts[m][0];
  out[idx * 2 + 1] = verts[m][1];
  return out;
}

// ---------- geometric utilities ----------
function centroid(p) {
  const n = p.length / 2;
  let cx = 0, cy = 0;
  for (let i = 0; i < n; i++) { cx += p[2 * i]; cy += p[2 * i + 1]; }
  return [cx / n, cy / n];
}

function polyLen(p) {
  const n = p.length / 2;
  let L = 0;
  for (let i = 1; i < n; i++)
    L += Math.hypot(p[2 * i] - p[2 * i - 2], p[2 * i + 1] - p[2 * i - 1]);
  return L;
}

function reversePts(p) {
  const n = p.length / 2;
  const out = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) {
    out[2 * i] = p[2 * (n - 1 - i)];
    out[2 * i + 1] = p[2 * (n - 1 - i) + 1];
  }
  return out;
}

// ---------- 2D Procrustes, closed form ----------
// Optimal similarity (θ, σ) minimizing Σ|σ·R(θ)·(a−cA) − (b−cB)|².
// θ* = atan2(Σ(aₓbᵧ−aᵧbₓ), Σ(aₓbₓ+aᵧbᵧ)); σ* by zero derivative.
// res = RMS residual normalized by b's energy (0 → same shape).
function procrustes(a, b, ca, cb) {
  const n = a.length / 2;
  let sxx = 0, sxy = 0, syx = 0, syy = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) {
    const ax = a[2 * i] - ca[0], ay = a[2 * i + 1] - ca[1];
    const bx = b[2 * i] - cb[0], by = b[2 * i + 1] - cb[1];
    sxx += ax * bx; syy += ay * by; sxy += ax * by; syx += ay * bx;
    na += ax * ax + ay * ay; nb += bx * bx + by * by;
  }
  const theta = Math.atan2(sxy - syx, sxx + syy);
  const num = Math.cos(theta) * (sxx + syy) + Math.sin(theta) * (sxy - syx);
  let sigma = na > 1e-12 ? num / na : 1;
  if (!(sigma > 1e-6)) sigma = 1e-6;
  const res2 = Math.max(0, sigma * sigma * na - 2 * sigma * num + nb);
  const res = nb > 1e-12 ? Math.sqrt(res2 / nb) : 0;
  return { theta, sigma, res };
}

// Tries both orientations of b (directional correspondence).
// Score = residual + λ·|θ|/π: minimizes deformation and, on ties (shapes
// symmetric like lines), picks the shortest rotation — keeps a line from
// spinning 135° when −45° produces the same result.
function alignPair(aPts, bPts) {
  const ca = centroid(aPts);
  const cb = centroid(bPts);
  const rev = reversePts(bPts);
  const pf = procrustes(aPts, bPts, ca, cb);
  const pr = procrustes(aPts, rev, ca, cb);
  const L = 0.05;
  const sf = pf.res + (L * Math.abs(pf.theta)) / Math.PI;
  const sr = pr.res + (L * Math.abs(pr.theta)) / Math.PI;
  const useRev = sr < sf;
  return { ca, cb, b: useRev ? rev : bPts, ...(useRev ? pr : pf) };
}

// ---------- subpath matching ----------
function pairCost(a, b) {
  const ca = centroid(a), cb = centroid(b);
  return (
    Math.hypot(ca[0] - cb[0], ca[1] - cb[1]) +
    0.35 * Math.abs(polyLen(a) - polyLen(b))
  );
}

// p === q: best permutation by brute force (p ≤ 4).
function bestPermutation(A, B) {
  const n = A.length;
  const idx = Array.from({ length: n }, (_, i) => i);
  let best = null, bc = Infinity;
  const perm = (arr, k) => {
    if (k === n) {
      let c = 0;
      for (let i = 0; i < n; i++) c += pairCost(A[i], B[arr[i]]);
      if (c < bc) { bc = c; best = arr.slice(); }
      return;
    }
    for (let i = k; i < n; i++) {
      [arr[k], arr[i]] = [arr[i], arr[k]];
      perm(arr, k + 1);
      [arr[k], arr[i]] = [arr[i], arr[k]];
    }
  };
  perm(idx, 0);
  return best;
}

// p ≠ q: surjective assignment from the large side to the small one
// (leftovers duplicate — "cell division"), minimum cost, enumeration
// (≤ 3^3 cases).
function bestSurjection(big, small) {
  const B = big.length, S = small.length;
  let best = null, bc = Infinity;
  const f = new Array(B);
  const rec = (i) => {
    if (i === B) {
      if (new Set(f).size < S) return;
      let c = 0;
      for (let j = 0; j < B; j++) c += pairCost(big[j], small[f[j]]);
      if (c < bc) { bc = c; best = f.slice(); }
      return;
    }
    for (let s = 0; s < S; s++) { f[i] = s; rec(i + 1); }
  };
  rec(0);
  return best;
}

// ---------- morph plan ----------
// srcSubs/dstSubs: arrays of Float64Array(2N). Returns a cacheable plan:
// per pair, A's centered points (aC), B brought into A's frame
// (bT = R(−θ)(b−cB)/σ), B oriented raw (bO, for linear mode) and the
// similarity (θ, ln σ, centroids).
function buildPlan(srcSubs, dstSubs) {
  const p = srcSubs.length, q = dstSubs.length;
  const pairs = [];
  if (p === q) {
    const perm = bestPermutation(srcSubs, dstSubs);
    for (let i = 0; i < p; i++) pairs.push([i, perm[i]]);
  } else if (p < q) {
    const f = bestSurjection(dstSubs, srcSubs);
    for (let j = 0; j < q; j++) pairs.push([f[j], j]);
  } else {
    const f = bestSurjection(srcSubs, dstSubs);
    for (let i = 0; i < p; i++) pairs.push([i, f[i]]);
  }
  const n = srcSubs[0].length / 2;
  const items = pairs.map(([si, di]) => {
    const a = srcSubs[si];
    const al = alignPair(a, dstSubs[di]);
    const aC = new Float64Array(2 * n);
    const bT = new Float64Array(2 * n);
    const bO = new Float64Array(2 * n);
    const cos = Math.cos(-al.theta), sin = Math.sin(-al.theta);
    for (let i = 0; i < n; i++) {
      aC[2 * i] = a[2 * i] - al.ca[0];
      aC[2 * i + 1] = a[2 * i + 1] - al.ca[1];
      const bx = al.b[2 * i] - al.cb[0], by = al.b[2 * i + 1] - al.cb[1];
      bT[2 * i] = (bx * cos - by * sin) / al.sigma;
      bT[2 * i + 1] = (bx * sin + by * cos) / al.sigma;
      bO[2 * i] = al.b[2 * i];
      bO[2 * i + 1] = al.b[2 * i + 1];
    }
    return {
      a, aC, bT, bO,
      ca: al.ca, cb: al.cb,
      theta: al.theta, lnSigma: Math.log(al.sigma), res: al.res,
    };
  });
  return { items, n };
}

// ---------- interpolation ----------
// Polar: geodesic similarity (linear angle, log-linear scale, lerped
// centroid) applied to the residual blend in the aligned frame.
// P(t) = c(t) + σ^t·R(t·θ)·[(1−t)·aC + t·bT]
function interpPolar(plan, t, out) {
  for (let k = 0; k < plan.items.length; k++) {
    const it = plan.items[k], o = out[k], n = plan.n;
    const cx = it.ca[0] + (it.cb[0] - it.ca[0]) * t;
    const cy = it.ca[1] + (it.cb[1] - it.ca[1]) * t;
    const s = Math.exp(it.lnSigma * t);
    const ang = it.theta * t;
    const cos = Math.cos(ang) * s, sin = Math.sin(ang) * s;
    for (let i = 0; i < n; i++) {
      const px = it.aC[2 * i] + (it.bT[2 * i] - it.aC[2 * i]) * t;
      const py = it.aC[2 * i + 1] + (it.bT[2 * i + 1] - it.aC[2 * i + 1]) * t;
      o[2 * i] = cx + px * cos - py * sin;
      o[2 * i + 1] = cy + px * sin + py * cos;
    }
  }
}

// Linear: raw coordinate lerp (same correspondence, no decomposition).
function interpLinear(plan, t, out) {
  for (let k = 0; k < plan.items.length; k++) {
    const it = plan.items[k], o = out[k], n = plan.n;
    for (let i = 0; i < n; i++) {
      o[2 * i] = it.a[2 * i] + (it.bO[2 * i] - it.a[2 * i]) * t;
      o[2 * i + 1] = it.a[2 * i + 1] + (it.bO[2 * i + 1] - it.a[2 * i + 1]) * t;
    }
  }
}

// ---------- serialization ----------
function fmt(v) {
  return String(Math.round(v * 100) / 100);
}
function serialize(subs) {
  let d = "";
  for (let k = 0; k < subs.length; k++) {
    const o = subs[k], n = o.length / 2;
    d += "M" + fmt(o[0]) + " " + fmt(o[1]);
    for (let i = 1; i < n; i++) d += "L" + fmt(o[2 * i]) + " " + fmt(o[2 * i + 1]);
  }
  return d;
}

// ---------- spring (damped oscillator, semi-implicit Euler) ----------
function Spring() {
  this.x = 1; this.v = 0; this.k = 250; this.c = 24;
}
Spring.prototype.config = function (k, c) { this.k = k; this.c = c; };
Spring.prototype.start = function () {
  this.x = 0;
  if (this.v > 14) this.v = 14;
  if (this.v < -14) this.v = -14;
};
Spring.prototype.step = function (dt) {
  const h = 1 / 240;
  let steps = Math.max(1, Math.min(16, Math.ceil(dt / h)));
  const s = dt / steps;
  for (let i = 0; i < steps; i++) {
    const a = this.k * (1 - this.x) - this.c * this.v;
    this.v += a * s;
    this.x += this.v * s;
  }
  return Math.abs(1 - this.x) < 0.001 && Math.abs(this.v) < 0.02;
};

if (typeof module !== "undefined") {
  module.exports = {
    resample, centroid, polyLen, reversePts, procrustes, alignPair,
    buildPlan, interpPolar, interpLinear, serialize, Spring,
  };
}
