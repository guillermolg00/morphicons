import { describe, expect, test } from "bun:test";
import { KAPPA } from "../src/core/normalize";
import { arcLength, detectCorners } from "../src/core/resample";
import { segCount } from "../src/core/types";
import { cubicsToPathD, iconToCubics, resamplePath } from "../src/index";
import { maxDiff } from "./helpers";

describe("normalization to cubics", () => {
  test("line → cubic with collinear controls at ⅓ and ⅔", () => {
    const [p] = iconToCubics("M0 0L3 4");
    expect(segCount(p)).toBe(1);
    expect([...p.pts]).toEqual([0, 0, 1, 4 / 3, 2, 8 / 3, 3, 4]);
    expect(arcLength(p)).toBeCloseTo(5, 12);
  });

  test("quadratic → exact degree elevation", () => {
    const [p] = iconToCubics("M0 0Q1 1 2 0");
    expect(segCount(p)).toBe(1);
    // C1 = Q0 + ⅔(Q1−Q0), C2 = Q2 + ⅔(Q1−Q2)
    expect(p.pts[2]).toBeCloseTo(2 / 3, 12);
    expect(p.pts[3]).toBeCloseTo(2 / 3, 12);
    expect(p.pts[4]).toBeCloseTo(4 / 3, 12);
    expect(p.pts[5]).toBeCloseTo(2 / 3, 12);
    // The elevated curve matches the original quadratic
    const q = (t: number) => {
      const u = 1 - t;
      return [2 * u * t * 1 + t * t * 2, 2 * u * t * 1] as const;
    };
    for (const t of [0.25, 0.5, 0.75]) {
      const u = 1 - t;
      const bx =
        3 * u * u * t * p.pts[2] + 3 * u * t * t * p.pts[4] + t * t * t * p.pts[6];
      const by =
        3 * u * u * t * p.pts[3] + 3 * u * t * t * p.pts[5] + t * t * t * p.pts[7];
      expect(bx).toBeCloseTo(q(t)[0], 12);
      expect(by).toBeCloseTo(q(t)[1], 12);
    }
  });

  test("circle → 4 closed cubics with k ≈ 0.5523, faithful radius", () => {
    expect(KAPPA).toBeCloseTo(0.5523, 3);
    const [p] = iconToCubics([["circle", { cx: 12, cy: 12, r: 10 }]]);
    expect(p.closed).toBe(true);
    expect(segCount(p)).toBe(4);
    expect(arcLength(p)).toBeCloseTo(2 * Math.PI * 10, 1);
    const pts = resamplePath(p, 64);
    for (let i = 0; i < 64; i++) {
      const r = Math.hypot(pts[2 * i] - 12, pts[2 * i + 1] - 12);
      expect(Math.abs(r - 10)).toBeLessThan(10 * 5e-4);
    }
    expect(detectCorners(p)).toEqual([]);
  });

  test("quarter-circle A arc: one segment, length πr/2", () => {
    const [p] = iconToCubics("M0 0A5 5 0 0 1 5 5");
    expect(segCount(p)).toBe(1);
    expect(p.pts[6]).toBe(5); // exact final endpoint
    expect(p.pts[7]).toBe(5);
    expect(arcLength(p)).toBeCloseTo((2 * Math.PI * 5) / 4, 2);
    expect(detectCorners(p)).toEqual([]);
  });

  test("arc with insufficient radii scales up (F.6.6): emergent semicircle", () => {
    const [p] = iconToCubics("M0 0A1 1 0 0 0 4 0");
    expect(segCount(p)).toBe(2); // 180° → 2 slices ≤ 90°
    expect(p.pts[p.pts.length - 2]).toBe(4);
    expect(arcLength(p)).toBeCloseTo(Math.PI * 2, 2); // r scaled to 2
  });

  test("arc with zero radius degrades to a line (F.6.6)", () => {
    const [p] = iconToCubics("M0 0A0 5 0 0 1 4 0");
    expect(segCount(p)).toBe(1);
    expect(arcLength(p)).toBeCloseTo(4, 9);
  });

  test("rect without rx: 4 corners, exact perimeter", () => {
    const [p] = iconToCubics([["rect", { x: 3, y: 3, width: 18, height: 12 }]]);
    expect(p.closed).toBe(true);
    expect(detectCorners(p).length).toBe(4);
    expect(arcLength(p)).toBeCloseTo(2 * (18 + 12), 9);
  });

  test("rounded rect (rx): tangent joints, zero corners", () => {
    const [p] = iconToCubics([["rect", { x: 3, y: 3, width: 18, height: 18, rx: 2 }]]);
    expect(p.closed).toBe(true);
    expect(detectCorners(p)).toEqual([]);
    // perimeter = straight sides + full circumference of radius rx
    expect(arcLength(p)).toBeCloseTo(4 * (18 - 4) + 2 * Math.PI * 2, 1);
  });

  test("polygon: closed with corners and perimeter", () => {
    const [p] = iconToCubics([["polygon", { points: "0,0 4,0 4,4" }]]);
    expect(p.closed).toBe(true);
    expect(segCount(p)).toBe(3); // includes the closing segment
    expect(detectCorners(p).length).toBe(3);
    expect(arcLength(p)).toBeCloseTo(8 + Math.sqrt(32), 9);
  });

  test("open polyline", () => {
    const [p] = iconToCubics([["polyline", { points: "0 0 4 0 4 4" }]]);
    expect(p.closed).toBe(false);
    expect(segCount(p)).toBe(2);
  });

  test("mixed IconNode: path + circle", () => {
    const paths = iconToCubics([
      ["path", { d: "M4 6h16" }],
      ["circle", { cx: 12, cy: 12, r: 3 }],
    ]);
    expect(paths.length).toBe(2);
    expect(paths.map((p) => p.closed)).toEqual([false, true]);
  });

  test("unknown tag throws a clear error", () => {
    expect(() => iconToCubics([["text", {}]])).toThrow(/unsupported/);
  });

  test("round-trip: cubics → d → identical cubics", () => {
    for (const d of [
      "M20 6 9 17l-5-5",
      "M0 0C0 1 1 1 1 0S2 -1 2 0",
      "M0 0A5 5 0 0 1 5 5",
      "M0 0h4v4h-4z",
    ]) {
      const a = iconToCubics(d);
      const b = iconToCubics(cubicsToPathD(a));
      expect(b.length).toBe(a.length);
      for (let i = 0; i < a.length; i++) {
        expect(b[i].closed).toBe(a[i].closed);
        expect(maxDiff(a[i].pts, b[i].pts)).toBeLessThan(1e-12);
      }
    }
  });
});
