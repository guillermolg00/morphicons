/* viewBox fitting — packs that don't draw on 24×24 (Heroicons solid on 20,
   Carbon on 32) must be re-gridded before morphing, or Procrustes reads the
   scale/offset gap as rotation. `fitIcon` is the shared-coordinate-space
   precondition made explicit. */

import { describe, expect, test } from "bun:test";
import { buildPlan, fitIcon, iconToCubics, resampleIcon } from "../src/index";
import { deg, N } from "./helpers";

/** Axis-aligned bounds of an icon, over control points (a superset of the
 *  curve — exact here because every fixture is polylines). */
function bounds(d: string) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const { pts } of iconToCubics(d)) {
    for (let i = 0; i < pts.length; i += 2) {
      x0 = Math.min(x0, pts[i]);
      x1 = Math.max(x1, pts[i]);
      y0 = Math.min(y0, pts[i + 1]);
      y1 = Math.max(y1, pts[i + 1]);
    }
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

/** Same shape as `d`, redrawn on a k× grid (what a pack on another canvas
 *  looks like: identical geometry, different coordinate space). */
function onGrid(d: string, k: number): string {
  return d.replace(/-?\d*\.?\d+/g, (n) => String(Number(n) * k));
}

const LUCIDE_ARROW = "M5 12h14M12 5l7 7-7 7";

describe("fitIcon", () => {
  test("a 24 icon on the 24 grid is geometrically unchanged", () => {
    const b = bounds(fitIcon(LUCIDE_ARROW, 24));
    const o = bounds(LUCIDE_ARROW);
    expect(Math.abs(b.w - o.w)).toBeLessThan(1e-9);
    expect(Math.abs(b.cx - o.cx)).toBeLessThan(1e-9);
    expect(Math.abs(b.cy - o.cy)).toBeLessThan(1e-9);
  });

  test("scales a 20 grid up (×1.2) and a 32 grid down (×0.75)", () => {
    const o = bounds(LUCIDE_ARROW);
    expect(bounds(fitIcon(onGrid(LUCIDE_ARROW, 20 / 24), 20)).w).toBeCloseTo(o.w, 9);
    expect(bounds(fitIcon(onGrid(LUCIDE_ARROW, 32 / 24), 32)).w).toBeCloseTo(o.w, 9);
  });

  test("accepts a number, a viewBox string and a tuple alike", () => {
    const d = onGrid(LUCIDE_ARROW, 32 / 24);
    const a = fitIcon(d, 32);
    expect(fitIcon(d, "0 0 32 32")).toBe(a);
    expect(fitIcon(d, "0,0,32,32")).toBe(a);
    expect(fitIcon(d, [0, 0, 32, 32])).toBe(a);
  });

  test("a non-zero viewBox origin is translated back to the grid", () => {
    // Same drawing shifted by +100 in x and declared with minX = 100.
    const shifted = LUCIDE_ARROW.replace(/M(\d+)/g, (_, n) => `M${Number(n) + 100}`);
    const b = bounds(fitIcon(shifted, [100, 0, 24, 24]));
    expect(b.cx).toBeCloseTo(bounds(LUCIDE_ARROW).cx, 9);
  });

  test("a non-square viewBox keeps aspect ratio and centres (xMidYMid meet)", () => {
    // A 48×24 canvas meets the 24 grid at ×0.5 — the wider axis decides —
    // and the spare vertical room is split evenly.
    const b = bounds(fitIcon(LUCIDE_ARROW, "0 0 48 24"));
    const o = bounds(LUCIDE_ARROW);
    expect(b.w).toBeCloseTo(o.w * 0.5, 9);
    expect(b.h).toBeCloseTo(o.h * 0.5, 9); // scaled, not stretched
    expect(b.cy).toBeCloseTo(12, 9); // centred on the grid
  });

  test("rejects a malformed viewBox", () => {
    for (const bad of ["0 0 24", "0 0 0 24", "a b c d", 0, -24] as const)
      expect(() => fitIcon(LUCIDE_ARROW, bad)).toThrow(/invalid viewBox/);
  });
});

describe("cross-grid morphs", () => {
  /** Worst offenders in the wild: Heroicons solid (20) and Carbon (32). */
  const GRIDS = [20, 32, 48] as const;

  test("an unfitted foreign grid overflows the canvas and fakes a zoom", () => {
    // Procrustes is similarity-invariant, so a uniform grid change is *not*
    // mistaken for rotation (θ stays 0) — it lands in σ instead. That is the
    // real damage: an unwanted 1 → 4/3 zoom, and a target drawn outside the
    // 24×24 canvas the binding renders.
    const raw = onGrid(LUCIDE_ARROW, 32 / 24);
    expect(bounds(raw).x1).toBeGreaterThan(24); // clipped by viewBox="0 0 24 24"

    const plan = buildPlan(resampleIcon(LUCIDE_ARROW, N), resampleIcon(raw, N));
    for (const it of plan.items) {
      expect(Math.abs(deg(it.theta))).toBeLessThan(1e-6);
      expect(Math.exp(it.lnSigma)).toBeCloseTo(32 / 24, 6); // the spurious zoom
    }
  });

  test("after fitting, the same icon on any grid is congruent: θ ≈ 0, σ ≈ 1", () => {
    const A = resampleIcon(LUCIDE_ARROW, N);
    for (const g of GRIDS) {
      const B = resampleIcon(fitIcon(onGrid(LUCIDE_ARROW, g / 24), g), N);
      for (const it of buildPlan(A, B).items) {
        expect(Math.abs(deg(it.theta))).toBeLessThan(1e-6);
        expect(Math.exp(it.lnSigma)).toBeCloseTo(1, 9);
        expect(it.res).toBeLessThan(1e-9);
      }
    }
  });

  test("real packs already on 24 need no fitting (Heroicons outline, Iconoir)", () => {
    // Verbatim `d` from the shadcn registry — both draw on 0 0 24 24.
    const HEROICONS_OUTLINE = "m14 5l7 7m0 0l-7 7m7-7H3";
    const ICONOIR = "M3 12h18m0 0l-8.5-8.5M21 12l-8.5 8.5";
    const A = resampleIcon(LUCIDE_ARROW, N);
    for (const d of [HEROICONS_OUTLINE, ICONOIR]) {
      const plan = buildPlan(A, resampleIcon(d, N));
      for (const it of plan.items) {
        expect(Number.isFinite(it.theta)).toBe(true);
        expect(Math.exp(it.lnSigma)).toBeGreaterThan(0.4);
        expect(Math.exp(it.lnSigma)).toBeLessThan(2.5);
      }
    }
  });
});
