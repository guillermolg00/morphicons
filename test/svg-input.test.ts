/* SVG markup as IconInput: a string starting with "<" is parsed, scanned for
   morphability and re-gridded via its viewBox — so an Iconify body, a full
   <svg>, or a shadcn <path> can be morphed directly, no adapter. */

import { describe, expect, test } from "bun:test";
import { isSvgMarkup } from "../src/core/normalize";
import { canonicalD } from "../src/dom/index";
import { buildPlan, iconToCubics, resampleIcon } from "../src/index";

// Verbatim @iconify-json/lucide bodies (what @unocss/preset-icons rasterizes).
const MENU =
  '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5h16M4 12h16M4 19h16"/>';
const X =
  '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 6L6 18M6 6l12 12"/>';
const SEARCH =
  '<g fill="none" stroke="currentColor" stroke-width="2"><path d="m21 21l-4.34-4.34"/><circle cx="11" cy="11" r="8"/></g>';

const maxCoord = (d: string): number =>
  Math.max(...(d.match(/-?\d+(?:\.\d+)?/g) ?? ["0"]).map((n) => Math.abs(Number(n))));

describe("isSvgMarkup", () => {
  test("markup vs d attribute", () => {
    expect(isSvgMarkup("<path d='M0 0'/>")).toBe(true);
    expect(isSvgMarkup("  \n<svg>")).toBe(true);
    expect(isSvgMarkup("M4 5h16")).toBe(false);
    expect(isSvgMarkup("m6 9l6 6")).toBe(false);
  });
});

describe("SVG markup flows through the core", () => {
  test("an Iconify body lowers, resamples and yields a canonical d", () => {
    for (const body of [MENU, X, SEARCH]) {
      expect(iconToCubics(body).length).toBeGreaterThan(0);
      expect(resampleIcon(body).length).toBeGreaterThan(0);
      expect(canonicalD(body).startsWith("M")).toBe(true);
    }
  });

  test("a plan builds between two markup icons (menu → x)", () => {
    const plan = buildPlan(resampleIcon(MENU), resampleIcon(X));
    expect(plan.items.length).toBeGreaterThan(0);
  });

  test("a plain d string is still passed through verbatim as canonical", () => {
    expect(canonicalD("M4 5h16")).toBe("M4 5h16");
  });
});

describe("auto-fit via viewBox", () => {
  const line = 'stroke="currentColor" fill="none" d="M0 24h48"';

  test("off-grid <svg viewBox> is re-gridded onto 24", () => {
    const d = canonicalD(`<svg viewBox="0 0 48 48"><path ${line}/></svg>`);
    expect(maxCoord(d)).toBeCloseTo(24, 1); // 48 → 24
  });

  test("a bare body (no viewBox) is assumed on-grid — not rescaled", () => {
    const d = canonicalD(`<path ${line}/>`);
    expect(maxCoord(d)).toBeCloseTo(48, 1); // untouched
  });

  test("a matching 24 viewBox is identity", () => {
    expect(canonicalD(`<svg viewBox="0 0 24 24">${MENU}</svg>`)).toBe(canonicalD(MENU));
  });
});

describe("morphability scan rejects what can't morph", () => {
  test("a fill-drawn icon (no stroke) throws", () => {
    // Material Symbols style: filled silhouette, no stroke, no fill=none.
    expect(() => iconToCubics('<path d="M4 4h16v16H4z"/>')).toThrow(/fill-drawn/);
  });

  test("a transform throws", () => {
    expect(() =>
      iconToCubics('<path stroke="currentColor" transform="translate(2 2)" d="M0 0h4"/>'),
    ).toThrow(/transform/);
  });

  test("an unsupported element throws", () => {
    expect(() => iconToCubics('<text stroke="currentColor" x="0">a</text>')).toThrow(
      /unsupported SVG element/,
    );
  });

  test("empty geometry throws", () => {
    expect(() => iconToCubics('<g stroke="currentColor"></g>')).toThrow(/no morphable/);
  });
});

describe("non-rendered content is ignored", () => {
  test("<defs> children are not hoisted as geometry", () => {
    const withDefs =
      '<svg stroke="currentColor" fill="none">' +
      '<defs><path d="M0 0h99"/></defs>' +
      '<path d="M4 5h16M4 12h16M4 19h16"/>' +
      "</svg>";
    // Only the visible menu path survives → identical to the bare menu icon.
    expect(canonicalD(withDefs)).toBe(canonicalD(MENU));
  });
});
