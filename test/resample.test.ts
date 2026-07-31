import { describe, expect, test } from "bun:test";
import { detectCorners } from "../src/core/resample";
import { iconToCubics, resamplePath } from "../src/index";

describe("resampling with anchored corners", () => {
  test("zigzag corners detected and anchored bit-exactly", () => {
    const [p] = iconToCubics("M0 0h4v4h4v-4");
    expect(detectCorners(p)).toEqual([1, 2, 3]);
    const pts = resamplePath(p, 64);
    expect(pts.length).toBe(128);
    const has = (x: number, y: number) => {
      for (let i = 0; i < 64; i++)
        if (pts[2 * i] === x && pts[2 * i + 1] === y) return true;
      return false;
    };
    expect(has(0, 0)).toBe(true);
    expect(has(4, 0)).toBe(true);
    expect(has(4, 4)).toBe(true);
    expect(has(8, 4)).toBe(true);
    expect(has(8, 0)).toBe(true);
  });

  test("arc-length equidistance within each run", () => {
    const [p] = iconToCubics([["circle", { cx: 0, cy: 0, r: 10 }]]);
    const pts = resamplePath(p, 64);
    const gaps: number[] = [];
    for (let i = 0; i < 64; i++) {
      const j = (i + 1) % 64;
      gaps.push(Math.hypot(pts[2 * j] - pts[2 * i], pts[2 * j + 1] - pts[2 * i + 1]));
    }
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    for (const g of gaps) expect(Math.abs(g - mean)).toBeLessThan(mean * 5e-3);
  });

  test("closed square: 4 exact vertices, closing corner included", () => {
    const [p] = iconToCubics([["rect", { x: 0, y: 0, width: 8, height: 8 }]]);
    expect(detectCorners(p)).toEqual([0, 1, 2, 3]);
    const pts = resamplePath(p, 64);
    for (const [x, y] of [
      [0, 0],
      [8, 0],
      [8, 8],
      [0, 8],
    ]) {
      let found = false;
      for (let i = 0; i < 64; i++)
        if (pts[2 * i] === x && pts[2 * i + 1] === y) found = true;
      expect(found).toBe(true);
    }
  });

  test("N too small for the runs between corners throws a clear error", () => {
    const [p] = iconToCubics("M0 0h4v4h4v-4");
    expect(() => resamplePath(p, 4)).toThrow(/too small/);
  });

  test("degenerate subpath (length ~0) fills without NaN", () => {
    const [p] = iconToCubics("M5 5h0.0000000000001");
    if (p) {
      const pts = resamplePath(p, 8);
      for (const v of pts) expect(Number.isFinite(v)).toBe(true);
    }
  });
});
