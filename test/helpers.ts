import { expect } from "bun:test";
import { resampleIcon, type Sampled } from "../src/index";

/** The 6 reference icons as real Lucide `d` attributes. They exercise H/V,
 *  implicit lineto after M, implicit command repetition, relatives and
 *  packed negative numbers ("7-7"). */
export const ICONS: Record<string, string> = {
  menu: "M4 6h16M4 12h16M4 18h16",
  x: "M18 6 6 18M6 6l12 12",
  plus: "M5 12h14M12 5v14",
  "arrow-right": "M5 12h14M12 5l7 7-7 7",
  "arrow-down": "M12 5v14M19 12l-7 7-7-7",
  check: "M20 6 9 17l-5-5",
};

export const N = 64;

export const subsOf = (name: string): Sampled[] => {
  const d = ICONS[name];
  if (!d) throw new Error(`unknown icon: ${name}`);
  return resampleIcon(d, N);
};

export const deg = (r: number): number => (r * 180) / Math.PI;

/** Maximum absolute difference between two point clouds. */
export const maxDiff = (a: Float64Array, b: Float64Array): number => {
  expect(a.length).toBe(b.length);
  let e = 0;
  for (let i = 0; i < a.length; i++) e = Math.max(e, Math.abs(a[i] - b[i]));
  return e;
};

export const expectFinite = (arr: Float64Array): void => {
  for (const v of arr) expect(Number.isFinite(v)).toBe(true);
};
