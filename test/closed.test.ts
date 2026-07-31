/* Closed loops — intrinsic sampling, optimal start point via circular
   correspondence, Z in flight, loop opening when morphing toward an open
   path, block coherence (global hybrid) and greedy matching for large
   subpath counts (invariants 8–11 of CLAUDE.md). */

import { describe, expect, test } from "bun:test";
import {
  allocOutputs,
  buildPlan,
  type IconNode,
  interpPolar,
  resampleIcon,
  serialize,
} from "../src/index";
import { deg, expectFinite, maxDiff, N, subsOf } from "./helpers";

const node = (tag: string, attrs: Record<string, string | number>): IconNode => [
  [tag, attrs],
];

const SQUARE = node("rect", { x: 2, y: 2, width: 20, height: 20 });
/** The same square as SQUARE but with M at the middle of the top side. */
const SQUARE_MID = "M12 2H22V22H2V2Z";
const DIAMOND = node("polygon", { points: "12 2 22 12 12 22 2 12" });
const CIRCLE_S = node("circle", { cx: 6, cy: 6, r: 4 });
const CIRCLE_L = node("circle", { cx: 16, cy: 16, r: 8 });

const closedFlags = (plan: { items: Array<{ closed: boolean }> }) =>
  plan.items.map((it) => it.closed);

describe("resampleIcon propagates topology", () => {
  test("open path + closed circle", () => {
    const subs = resampleIcon(
      [
        ["path", { d: "M4 6h16" }],
        ["circle", { cx: 12, cy: 12, r: 3 }],
      ],
      N,
    );
    expect(subs.map((s) => s.closed)).toEqual([false, true]);
    for (const s of subs) expect(s.pts.length).toBe(2 * N);
  });
});

describe("circular correspondence of closed loops", () => {
  test("same square with a different start point: res ≈ 0, θ ≈ 0", () => {
    const plan = buildPlan(resampleIcon(SQUARE, N), resampleIcon(SQUARE_MID, N));
    const it = plan.items[0];
    expect(it.closed).toBe(true);
    expect(it.res).toBeLessThan(1e-6);
    expect(Math.abs(deg(it.theta))).toBeLessThan(0.5);
    expect(Math.abs(Math.exp(it.lnSigma) - 1)).toBeLessThan(1e-6);
  });

  test("square → diamond: emergent 45° rotation and scale in closed paths", () => {
    const plan = buildPlan(resampleIcon(SQUARE, N), resampleIcon(DIAMOND, N));
    const it = plan.items[0];
    expect(it.res).toBeLessThan(1e-6);
    expect(Math.abs(Math.abs(deg(it.theta)) - 45)).toBeLessThan(0.5);
    expect(Math.abs(Math.exp(it.lnSigma) - Math.SQRT1_2)).toBeLessThan(1e-3);
  });

  test("translated and scaled circles: θ ≈ 0 (minimal rotation), σ = 2", () => {
    const plan = buildPlan(resampleIcon(CIRCLE_S, N), resampleIcon(CIRCLE_L, N));
    const it = plan.items[0];
    expect(it.res).toBeLessThan(1e-6);
    expect(Math.abs(deg(it.theta))).toBeLessThan(0.5);
    expect(Math.abs(Math.exp(it.lnSigma) - 2)).toBeLessThan(1e-6);
  });

  test("exact endpoints also with closed paths", () => {
    const plan = buildPlan(resampleIcon(SQUARE, N), resampleIcon(CIRCLE_L, N));
    const out = allocOutputs(plan);
    interpPolar(plan, 0, out);
    plan.items.forEach((it, k) => {
      expect(maxDiff(out[k], it.a)).toBeLessThan(1e-9);
    });
    interpPolar(plan, 1, out);
    plan.items.forEach((it, k) => {
      expect(maxDiff(out[k], it.bO)).toBeLessThan(1e-9);
    });
  });
});

describe("topology in flight", () => {
  test("closed ↔ closed flies with Z", () => {
    const plan = buildPlan(resampleIcon(CIRCLE_L, N), resampleIcon(SQUARE, N));
    expect(plan.items[0].closed).toBe(true);
    const out = allocOutputs(plan);
    interpPolar(plan, 0.5, out);
    const d = serialize(out, closedFlags(plan));
    expect(d.endsWith("Z")).toBe(true);
    expect(d.includes("NaN")).toBe(false);
  });

  test("closed → open: the loop opens at the chosen cut, no Z", () => {
    const plan = buildPlan(resampleIcon(CIRCLE_L, N), subsOf("check"));
    expect(plan.items[0].closed).toBe(false);
    const out = allocOutputs(plan);
    interpPolar(plan, 0, out);
    expect(maxDiff(out[0], plan.items[0].a)).toBeLessThan(1e-9);
    interpPolar(plan, 1, out);
    expect(maxDiff(out[0], plan.items[0].bO)).toBeLessThan(1e-9);
    interpPolar(plan, 0.5, out);
    expectFinite(out[0]);
    expect(serialize(out, closedFlags(plan)).includes("Z")).toBe(false);
  });
});

describe("global hybrid (block coherence)", () => {
  test("arrow-right → arrow-down: both subpaths share the SAME θ", () => {
    const plan = buildPlan(subsOf("arrow-right"), subsOf("arrow-down"));
    const [t0, t1] = plan.items.map((it) => it.theta);
    expect(Math.abs(t0 - t1)).toBeLessThan(1e-6);
    expect(Math.abs(Math.abs(deg(t0)) - 90)).toBeLessThan(0.5);
  });

  test("menu → x does NOT share θ: per-subpath fold toward both diagonals", () => {
    const plan = buildPlan(subsOf("menu"), subsOf("x"));
    const signs = new Set(plan.items.map((it) => Math.sign(Math.round(deg(it.theta)))));
    expect(signs.size).toBe(2);
  });
});

describe("matching with many subpaths (greedy)", () => {
  const dots = (k: number, dx = 0, dy = 0): IconNode =>
    Array.from(
      { length: k },
      (_, i) =>
        [
          "circle",
          { cx: dx + 4 + (i % 4) * 6, cy: dy + 4 + Math.floor(i / 4) * 6, r: 1.5 },
        ] as const,
    );

  test("12 dots → menu: greedy surjective, all 3 targets covered", () => {
    const plan = buildPlan(resampleIcon(dots(12), N), subsOf("menu"));
    expect(plan.items.length).toBe(12);
    const targets = new Set(plan.items.map((it) => it.cb[1].toFixed(2)));
    expect(targets.size).toBe(3);
    const out = allocOutputs(plan);
    interpPolar(plan, 0.5, out);
    for (const o of out) expectFinite(o);
  });

  test("9 → 9 translated dots: greedy pairs each with its twin", () => {
    const plan = buildPlan(resampleIcon(dots(9), N), resampleIcon(dots(9, 2, 3), N));
    expect(plan.items.length).toBe(9);
    for (const it of plan.items) {
      expect(it.res).toBeLessThan(1e-6);
      expect(Math.abs(it.cb[0] - it.ca[0] - 2)).toBeLessThan(1e-9);
      expect(Math.abs(it.cb[1] - it.ca[1] - 3)).toBeLessThan(1e-9);
    }
  });
});
