/* Executable specification of the math pipeline — invariants 1–7 of
   CLAUDE.md, fed from real Lucide `d` attributes. */

import { describe, expect, test } from "bun:test";
import { reversePts } from "../src/core/plan";
import {
  allocOutputs,
  buildPlan,
  interpLinear,
  interpPolar,
  Spring,
  serialize,
} from "../src/index";
import { deg, expectFinite, maxDiff, N, subsOf } from "./helpers";

describe("invariant 5 — resampling with anchored corners", () => {
  test("check: N points, exact endpoints, corner (9,17) anchored", () => {
    const [{ pts }] = subsOf("check");
    expect(pts.length).toBe(2 * N);
    expect(pts[0]).toBe(20);
    expect(pts[1]).toBe(6);
    expect(pts[2 * N - 2]).toBe(4);
    expect(pts[2 * N - 1]).toBe(12);
    let hasCorner = false;
    for (let i = 0; i < N; i++)
      if (pts[2 * i] === 9 && pts[2 * i + 1] === 17) hasCorner = true;
    expect(hasCorner).toBe(true);
  });
});

describe("invariant 1 — arrow-right → arrow-down: emergent rotation group", () => {
  test("θ = 90°, σ = 1, res ≈ 0 in both subpaths", () => {
    const plan = buildPlan(subsOf("arrow-right"), subsOf("arrow-down"));
    expect(plan.items.length).toBe(2);
    for (const it of plan.items) {
      expect(Math.abs(Math.abs(deg(it.theta)) - 90)).toBeLessThan(0.5);
      expect(Math.abs(Math.exp(it.lnSigma) - 1)).toBeLessThan(1e-6);
      expect(it.res).toBeLessThan(1e-6);
    }
  });
});

describe("invariant 2 — plus → x: emergent 45° rotation and scale", () => {
  test("|θ| = 45°, σ ≈ 1.212, res ≈ 0", () => {
    const plan = buildPlan(subsOf("plus"), subsOf("x"));
    for (const it of plan.items) {
      expect(Math.abs(Math.abs(deg(it.theta)) - 45)).toBeLessThan(0.5);
      expect(Math.abs(Math.exp(it.lnSigma) - 1.2122)).toBeLessThan(0.005);
      expect(it.res).toBeLessThan(1e-6);
    }
  });
});

describe("invariants 3 & 6 — menu → x: surjective with minimal rotation", () => {
  test("3 pairs, both diagonals covered, ±45° folds (never 135°)", () => {
    const plan = buildPlan(subsOf("menu"), subsOf("x"));
    expect(plan.items.length).toBe(3);
    const sig = (bO: Float64Array) => {
      const n = bO.length;
      return [
        [bO[0], bO[1]],
        [bO[n - 2], bO[n - 1]],
      ]
        .map((p) => p.map(Math.round).join(","))
        .sort()
        .join("|");
    };
    const sigs = plan.items.map((it) => sig(it.bO));
    expect(new Set(sigs).size).toBe(2);
    for (const it of plan.items) {
      expect(it.res).toBeLessThan(1e-6);
      expect(Math.abs(Math.abs(deg(it.theta)) - 45)).toBeLessThan(0.5);
    }
  });

  test("x → check: 2 subpaths collapse onto the single target without vanishing", () => {
    const plan = buildPlan(subsOf("x"), subsOf("check"));
    expect(plan.items.length).toBe(2);
    // Same target geometry modulo orientation (alignPair may reverse b)
    const [b0, b1] = [plan.items[0].bO, plan.items[1].bO];
    const same = Math.min(maxDiff(b0, b1), maxDiff(b0, reversePts(b1)));
    expect(same).toBe(0);
  });
});

describe("invariant 4 — exactness at the endpoints", () => {
  const pairs: Array<[string, string]> = [
    ["menu", "x"],
    ["x", "check"],
    ["arrow-right", "arrow-down"],
    ["check", "plus"],
  ];
  for (const [a, b] of pairs) {
    test(`${a} → ${b}: interp(0) = A and interp(1) = B with error < 1e-9`, () => {
      const plan = buildPlan(subsOf(a), subsOf(b));
      const out = allocOutputs(plan);
      interpPolar(plan, 0, out);
      plan.items.forEach((it, k) => {
        expect(maxDiff(out[k], it.a)).toBeLessThan(1e-9);
      });
      interpPolar(plan, 1, out);
      plan.items.forEach((it, k) => {
        expect(maxDiff(out[k], it.bO)).toBeLessThan(1e-9);
      });
      interpLinear(plan, 0, out);
      plan.items.forEach((it, k) => {
        expect(maxDiff(out[k], it.a)).toBeLessThan(1e-9);
      });
    });
  }
});

describe("serialization", () => {
  test("t = 0.5 of menu → x: 3 subpaths, starts with M, no NaN", () => {
    const plan = buildPlan(subsOf("menu"), subsOf("x"));
    const out = allocOutputs(plan);
    interpPolar(plan, 0.5, out);
    const d = serialize(out);
    expect(d[0]).toBe("M");
    expect(d.split("M").length - 1).toBe(3);
    expect(d.includes("NaN")).toBe(false);
  });
});

describe("invariant 7 — interruptions: re-plan from the intermediate shape", () => {
  test("burst of re-plans without NaN, velocity preserved, exact arrival", () => {
    const spring = new Spring();
    spring.config(420, 30);
    let plan = buildPlan(subsOf("menu"), subsOf("x"));
    let out = allocOutputs(plan);
    spring.start();
    for (const next of ["check", "plus", "arrow-right", "x"]) {
      for (let f = 0; f < 7; f++) spring.step(1 / 60); // mid-flight
      interpPolar(plan, spring.x, out);
      for (const o of out) expectFinite(o);
      const vBefore = spring.v;
      const src = out.map((o, k) => ({
        pts: Float64Array.from(o),
        closed: plan.items[k].closed,
      }));
      plan = buildPlan(src, subsOf(next));
      out = allocOutputs(plan);
      spring.start();
      expect(spring.v).toBe(Math.max(-14, Math.min(14, vBefore)));
    }
    let t = 0;
    let settled = false;
    while (t < 5 && !settled) {
      settled = spring.step(1 / 60);
      t += 1 / 60;
      interpPolar(plan, spring.x, out);
      for (const o of out) expectFinite(o);
    }
    expect(settled).toBe(true);
    interpPolar(plan, 1, out);
    plan.items.forEach((it, k) => {
      expect(maxDiff(out[k], it.bO)).toBeLessThan(1e-9);
    });
  });
});

describe("spring", () => {
  test("snappy preset settles in ~0.42 s (< 1.5 s)", () => {
    const s = new Spring();
    s.config(420, 30);
    s.start();
    let t = 0;
    let settled = false;
    while (t < 5 && !settled) {
      settled = s.step(1 / 60);
      t += 1 / 60;
    }
    expect(settled).toBe(true);
    expect(t).toBeLessThan(1.5);
    expect(Math.abs(1 - s.x)).toBeLessThan(0.001);
  });
});
