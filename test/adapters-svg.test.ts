/* svgToIcon (morphicons/adapters): SVG markup → IconInput. Parsed, scanned
   for morphability and re-gridded via its viewBox — so an Iconify body, a
   full <svg>, or a shadcn <path> becomes something every entry can morph.
   The core itself never sees markup: its input contract stays IconNode + d
   (docs/adr/0001). */

import { describe, expect, test } from "bun:test";
import { svgToIcon } from "../src/adapters/index";
import { cubicsToPathD } from "../src/core/serialize";
import type { IconInput } from "../src/core/types";
import { buildPlan, iconToCubics, resampleIcon } from "../src/index";

// Verbatim @iconify-json/lucide bodies (what @unocss/preset-icons rasterizes).
const MENU =
  '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5h16M4 12h16M4 19h16"/>';
const X =
  '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 6L6 18M6 6l12 12"/>';
const SEARCH =
  '<g fill="none" stroke="currentColor" stroke-width="2"><path d="m21 21l-4.34-4.34"/><circle cx="11" cy="11" r="8"/></g>';
const PAUSE =
  '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><rect width="5" height="18" x="14" y="3" rx="1"/><rect width="5" height="18" x="5" y="3" rx="1"/></g>';

/** Canonical d of any IconInput — normalizes node vs fitted-d return shapes. */
const canon = (icon: IconInput): string => cubicsToPathD(iconToCubics(icon));

const maxCoord = (d: string): number =>
  Math.max(...(d.match(/-?\d+(?:\.\d+)?/g) ?? ["0"]).map((n) => Math.abs(Number(n))));

describe("svgToIcon → core pipeline", () => {
  test("an Iconify body lowers, resamples and yields a canonical d", () => {
    for (const body of [MENU, X, SEARCH, PAUSE]) {
      const icon = svgToIcon(body);
      expect(iconToCubics(icon).length).toBeGreaterThan(0);
      expect(resampleIcon(icon).length).toBeGreaterThan(0);
      expect(canon(icon).startsWith("M")).toBe(true);
    }
  });

  test("geometry and attrs are preserved verbatim (Lucide's IconNode shape)", () => {
    expect(svgToIcon(MENU)).toEqual([
      [
        "path",
        {
          fill: "none",
          stroke: "currentColor",
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          "stroke-width": "2",
          d: "M4 5h16M4 12h16M4 19h16",
        },
      ],
    ]);
    const pause = svgToIcon(PAUSE) as ReadonlyArray<readonly [string, unknown]>;
    expect(pause.map(([tag]) => tag)).toEqual(["rect", "rect"]);
    expect(pause[0][1]).toMatchObject({ width: "5", height: "18", x: "14", rx: "1" });
  });

  test("tag case is normalized (<PATH> works)", () => {
    const node = svgToIcon('<PATH stroke="currentColor" d="M0 0h4"/>');
    expect((node as ReadonlyArray<readonly [string, unknown]>)[0][0]).toBe("path");
  });

  test("a plan builds between two adapted icons (menu → x)", () => {
    const plan = buildPlan(resampleIcon(svgToIcon(MENU)), resampleIcon(svgToIcon(X)));
    expect(plan.items.length).toBeGreaterThan(0);
  });

  test("a d string is not markup — svgToIcon refuses it with a clear error", () => {
    expect(() => svgToIcon("M4 5h16")).toThrow(/expects SVG markup/);
  });
});

describe("auto-fit via viewBox", () => {
  const line = 'stroke="currentColor" fill="none" d="M0 24h48"';

  test("off-grid <svg viewBox> is re-gridded onto 24", () => {
    const d = canon(svgToIcon(`<svg viewBox="0 0 48 48"><path ${line}/></svg>`));
    expect(maxCoord(d)).toBeCloseTo(24, 1); // 48 → 24
  });

  test("a bare body (no viewBox) is assumed on-grid — not rescaled", () => {
    const d = canon(svgToIcon(`<path ${line}/>`));
    expect(maxCoord(d)).toBeCloseTo(48, 1); // untouched
  });

  test("a matching 24 viewBox is identity", () => {
    expect(canon(svgToIcon(`<svg viewBox="0 0 24 24">${MENU}</svg>`))).toBe(
      canon(svgToIcon(MENU)),
    );
  });

  test("a non-zero viewBox origin is translated onto the grid", () => {
    // Geometry spans 4..44 on a "4 4 40 40" canvas → lands inside 0..24.
    const d = canon(
      svgToIcon(
        `<svg viewBox="4 4 40 40"><path stroke="currentColor" fill="none" d="M4 24h40"/></svg>`,
      ),
    );
    expect(maxCoord(d)).toBeLessThanOrEqual(24.01);
  });
});

describe("morphability scan rejects what can't morph", () => {
  test("a fill-drawn icon (no stroke) throws", () => {
    // Material Symbols style: filled silhouette, no stroke, no fill=none.
    expect(() => svgToIcon('<path d="M4 4h16v16H4z"/>')).toThrow(/fill-drawn/);
  });

  test('an explicit stroke="none" is fill-drawn too', () => {
    expect(() => svgToIcon('<path stroke="none" d="M4 4h16v16H4z"/>')).toThrow(
      /fill-drawn/,
    );
  });

  test("a transform throws", () => {
    expect(() =>
      svgToIcon('<path stroke="currentColor" transform="translate(2 2)" d="M0 0h4"/>'),
    ).toThrow(/transform/);
  });

  test("an unsupported element throws", () => {
    expect(() => svgToIcon('<text stroke="currentColor" x="0">a</text>')).toThrow(
      /unsupported SVG element/,
    );
  });

  test("empty geometry throws", () => {
    expect(() => svgToIcon('<g stroke="currentColor"></g>')).toThrow(/no morphable/);
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
    expect(canon(svgToIcon(withDefs))).toBe(canon(svgToIcon(MENU)));
  });

  test("<clipPath> content is stripped like any non-rendered container", () => {
    const withClip =
      '<svg stroke="currentColor" fill="none">' +
      '<clipPath id="c"><rect width="99" height="99"/></clipPath>' +
      '<path d="M4 5h16M4 12h16M4 19h16"/>' +
      "</svg>";
    expect(canon(svgToIcon(withClip))).toBe(canon(svgToIcon(MENU)));
  });

  test("a stray self-closed container (<defs/>) is skipped, not rejected", () => {
    const node = svgToIcon('<defs/><path stroke="currentColor" d="M0 0h4"/>');
    expect((node as ReadonlyArray<readonly [string, unknown]>).length).toBe(1);
  });
});
