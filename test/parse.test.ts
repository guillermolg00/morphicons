import { describe, expect, test } from "bun:test";
import { parsePath } from "../src/core/parse";

describe("parsePath", () => {
  test("implicit lineto after M with extra pairs", () => {
    const subs = parsePath("M1 1 2 2 3 3");
    expect(subs.length).toBe(1);
    expect(subs[0].x0).toBe(1);
    expect(subs[0].y0).toBe(1);
    expect(subs[0].segs).toEqual([
      ["L", 2, 2],
      ["L", 3, 3],
    ]);
  });

  test("relative m: first pair as start, following ones accumulate", () => {
    const subs = parsePath("m1 1 2 2");
    expect(subs[0].x0).toBe(1);
    expect(subs[0].segs).toEqual([["L", 3, 3]]);
  });

  test("absolute H/V and relative h/v", () => {
    const subs = parsePath("M1 2H5V7h2v3");
    expect(subs[0].segs).toEqual([
      ["L", 5, 2],
      ["L", 5, 7],
      ["L", 7, 7],
      ["L", 7, 10],
    ]);
  });

  test("implicit repetition of a relative command with packed negatives", () => {
    const subs = parsePath("M12 5l7 7-7 7");
    expect(subs[0].segs).toEqual([
      ["L", 19, 12],
      ["L", 12, 19],
    ]);
  });

  test("S reflects the previous C's control point", () => {
    const subs = parsePath("M0 0C0 1 1 1 1 0S2 -1 2 0");
    expect(subs[0].segs[1]).toEqual(["C", 1, -1, 2, -1, 2, 0]);
  });

  test("S without a previous C uses the current point as control", () => {
    const subs = parsePath("M0 0S2 2 4 0");
    expect(subs[0].segs[0]).toEqual(["C", 0, 0, 2, 2, 4, 0]);
  });

  test("T reflects the previous Q's control point", () => {
    const subs = parsePath("M0 0Q1 1 2 0T4 0");
    expect(subs[0].segs[1]).toEqual(["Q", 3, -1, 4, 0]);
  });

  test("packed arc flags are equivalent to spaced ones", () => {
    const glued = parsePath("M0 0a5 5 0 015 5");
    const spaced = parsePath("M0 0a5 5 0 0 1 5 5");
    expect(glued).toEqual(spaced);
    expect(glued[0].segs[0]).toEqual(["A", 5, 5, 0, 0, 1, 5, 5]);
  });

  test("scientific notation and compact decimals", () => {
    const subs = parsePath("M1e1 -2E-1L.5.25");
    expect(subs[0].x0).toBe(10);
    expect(subs[0].y0).toBe(-0.2);
    expect(subs[0].segs).toEqual([["L", 0.5, 0.25]]);
  });

  test("Z closes and a later command opens a subpath at the start point", () => {
    const subs = parsePath("M0 0h2zl1 1");
    expect(subs.length).toBe(2);
    expect(subs[0].closed).toBe(true);
    expect(subs[1].x0).toBe(0);
    expect(subs[1].y0).toBe(0);
    expect(subs[1].segs).toEqual([["L", 1, 1]]);
  });

  test("multiple subpaths in one d", () => {
    const subs = parsePath("M4 6h16M4 12h16M4 18h16");
    expect(subs.length).toBe(3);
    expect(subs.map((s) => s.x0)).toEqual([4, 4, 4]);
    expect(subs.map((s) => s.y0)).toEqual([6, 12, 18]);
  });

  test("empty subpaths are dropped", () => {
    expect(parsePath("M5 5")).toEqual([]);
    expect(parsePath("M5 5Z")).toEqual([]);
  });

  test("clear errors", () => {
    expect(() => parsePath("L1 1")).toThrow(/start with M/);
    expect(() => parsePath("M1")).toThrow(/expected number/);
    expect(() => parsePath("M0 0A5 5 0 2 0 1 1")).toThrow(/flag/);
    expect(() => parsePath("M0 0K1 1")).toThrow(/expected number/);
  });
});
