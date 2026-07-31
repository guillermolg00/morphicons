const {
  resample, centroid, buildPlan, interpPolar, interpLinear, serialize, Spring,
} = require("./core.js");

const N = 64;
const deg = (r) => (r * 180) / Math.PI;

const ICONS = {
  menu: [[[4, 6], [20, 6]], [[4, 12], [20, 12]], [[4, 18], [20, 18]]],
  x: [[[18, 6], [6, 18]], [[6, 6], [18, 18]]],
  plus: [[[5, 12], [19, 12]], [[12, 5], [12, 19]]],
  "arrow-right": [[[5, 12], [19, 12]], [[12, 5], [19, 12], [12, 19]]],
  "arrow-down": [[[12, 5], [12, 19]], [[19, 12], [12, 19], [5, 12]]],
  check: [[[20, 6], [9, 17], [4, 12]]],
};
const subsOf = (name) => ICONS[name].map((v) => resample(v, N));

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log("  ok  " + name + (detail ? "  — " + detail : ""));
  else { failures++; console.log("  FAIL " + name + (detail ? "  — " + detail : "")); }
}

console.log("resampling");
{
  const pts = resample(ICONS.check[0], N);
  check("N points", pts.length === 2 * N);
  check("exact start endpoint", pts[0] === 20 && pts[1] === 6);
  check("exact final endpoint", pts[2 * N - 2] === 4 && pts[2 * N - 1] === 12);
  let hasCorner = false;
  for (let i = 0; i < N; i++)
    if (pts[2 * i] === 9 && pts[2 * i + 1] === 17) hasCorner = true;
  check("corner (9,17) anchored exactly", hasCorner);
}

console.log("\narrow-right -> arrow-down (emergent rotation group)");
{
  const plan = buildPlan(subsOf("arrow-right"), subsOf("arrow-down"));
  for (const it of plan.items) {
    const t = deg(it.theta);
    check(
      "pair: pure rotation",
      Math.abs(Math.abs(t) - 90) < 0.5 && it.res < 1e-6 && Math.abs(Math.exp(it.lnSigma) - 1) < 1e-6,
      `θ=${t.toFixed(1)}° σ=${Math.exp(it.lnSigma).toFixed(3)} res=${it.res.toExponential(1)}`
    );
  }
}

console.log("\nplus -> x (emergent 45° rotation)");
{
  const plan = buildPlan(subsOf("plus"), subsOf("x"));
  for (const it of plan.items) {
    const t = deg(it.theta);
    check(
      "pair: 45° rotation + scale",
      Math.abs(Math.abs(t) - 45) < 0.5 && it.res < 1e-6,
      `θ=${t.toFixed(1)}° σ=${Math.exp(it.lnSigma).toFixed(3)} res=${it.res.toExponential(1)}`
    );
  }
}

console.log("\nmenu -> x (3 subpaths -> 2, surjective)");
{
  const src = subsOf("menu"), dst = subsOf("x");
  const plan = buildPlan(src, dst);
  check("3 pairs generated", plan.items.length === 3);
  const sig = (it) => {
    const n = it.bO.length;
    const e = [[it.bO[0], it.bO[1]], [it.bO[n - 2], it.bO[n - 1]]]
      .map((p) => p.map(Math.round).join(","))
      .sort();
    return e.join("|");
  };
  const sigs = plan.items.map(sig);
  check("both diagonals covered", new Set(sigs).size === 2, sigs.join("  "));
  for (const it of plan.items)
    check(
      "line -> diagonal: pure, minimal rotation (±45°)",
      it.res < 1e-6 && Math.abs(Math.abs(deg(it.theta)) - 45) < 0.5,
      `θ=${deg(it.theta).toFixed(1)}°`
    );
}

console.log("\nexactness at the endpoints (t=0 and t=1)");
{
  for (const [a, b] of [["menu", "x"], ["x", "check"], ["arrow-right", "arrow-down"], ["check", "plus"]]) {
    const plan = buildPlan(subsOf(a), subsOf(b));
    const out = plan.items.map(() => new Float64Array(2 * N));
    let e0 = 0, e1 = 0;
    interpPolar(plan, 0, out);
    plan.items.forEach((it, k) => {
      for (let i = 0; i < 2 * N; i++) e0 = Math.max(e0, Math.abs(out[k][i] - it.a[i]));
    });
    interpPolar(plan, 1, out);
    plan.items.forEach((it, k) => {
      for (let i = 0; i < 2 * N; i++) e1 = Math.max(e1, Math.abs(out[k][i] - it.bO[i]));
    });
    check(`${a} -> ${b} polar`, e0 < 1e-9 && e1 < 1e-9, `err0=${e0.toExponential(1)} err1=${e1.toExponential(1)}`);
    interpLinear(plan, 0, out);
    let l0 = 0;
    plan.items.forEach((it, k) => {
      for (let i = 0; i < 2 * N; i++) l0 = Math.max(l0, Math.abs(out[k][i] - it.a[i]));
    });
    check(`${a} -> ${b} linear t=0`, l0 < 1e-9);
  }
}

console.log("\nserialization");
{
  const plan = buildPlan(subsOf("menu"), subsOf("x"));
  const out = plan.items.map(() => new Float64Array(2 * N));
  interpPolar(plan, 0.5, out);
  const d = serialize(out);
  check("starts with M and contains 3 subpaths", d[0] === "M" && d.split("M").length - 1 === 3, d.slice(0, 40) + "…  len=" + d.length);
  check("no NaN", !d.includes("NaN"));
}

console.log("\nspring");
{
  const s = new Spring();
  s.config(420, 30);
  s.start();
  let t = 0, settled = false;
  while (t < 5 && !settled) { settled = s.step(1 / 60); t += 1 / 60; }
  check("settles in <1.5s", settled && t < 1.5, `t=${t.toFixed(2)}s x=${s.x.toFixed(4)}`);
}

console.log(failures === 0 ? "\nALL OK" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
