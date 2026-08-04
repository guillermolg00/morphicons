/* Svelte binding via svelte/server render (no real DOM): what matters in SSR
   is the exact static markup — canonical d, a11y and drop-in props. Client
   behavior (morphTo/seek on the <path>) is already pinned by the driver
   tests; only the Svelte layer is checked here — mirror of test/vue/. */

import { describe, expect, test } from "bun:test";
import { render } from "svelte/server";
import { canonicalD } from "../../src/dom/index";
import type { IconNode } from "../../src/index";
import { MorphIcon, type MorphIconProps } from "../../src/svelte/index";
import { ICONS } from "../helpers";

const SQUARE: IconNode = [["rect", { x: 2, y: 2, width: 20, height: 20 }]];

const ssr = (props: Record<string, unknown> = {}) =>
  render(MorphIcon, { props: props as MorphIconProps }).body;

describe("MorphIcon (Svelte SSR)", () => {
  test("uncontrolled: emits the icon's canonical d and aria-hidden", () => {
    const html = ssr({ icon: ICONS.menu });
    expect(html).toContain(`d="${ICONS.menu}"`);
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("role=");
    expect(html).toContain('width="24"');
    expect(html).toContain('height="24"');
    expect(html).toContain('viewBox="0 0 24 24"');
    expect(html).toContain('stroke="currentColor"');
    expect(html).toContain('stroke-width="2"');
    expect(html).toContain('fill="none"');
    expect(html).toContain('stroke-linecap="round"');
    expect(html).toContain('stroke-linejoin="round"');
  });

  test("IconNode: the initial d is the canonical cubics", () => {
    const html = ssr({ icon: SQUARE });
    expect(html).toContain(`d="${canonicalD(SQUARE)}"`);
  });

  test("label: role img + <title>, no aria-hidden", () => {
    const html = ssr({ icon: ICONS.x, label: "Close menu" });
    expect(html).toContain('role="img"');
    expect(html).toContain("<title>Close menu</title>");
    expect(html).not.toContain("aria-hidden");
  });

  test("lucide drop-in: size, color, strokeWidth, class passthrough", () => {
    const html = ssr({
      icon: ICONS.check,
      size: 32,
      color: "#e6a83c",
      strokeWidth: 1.5,
      class: "my-icon",
      "data-testid": "morph",
    });
    expect(html).toContain('width="32"');
    expect(html).toContain('height="32"');
    expect(html).toContain('stroke="#e6a83c"');
    expect(html).toContain('stroke-width="1.5"');
    expect(html).toContain('class="my-icon"');
    expect(html).toContain('data-testid="morph"');
  });

  test("absoluteStrokeWidth compensates for scale like lucide", () => {
    const html = ssr({
      icon: ICONS.check,
      size: 48,
      strokeWidth: 2,
      absoluteStrokeWidth: true,
    });
    expect(html).toContain('stroke-width="1"');
  });

  test("controlled at the endpoints: canonical d of from (t=0) and to (t=1)", () => {
    const at0 = ssr({ from: ICONS.menu, to: ICONS.x, progress: 0 });
    const at1 = ssr({ from: ICONS.menu, to: ICONS.x, progress: 1 });
    expect(at0).toContain(`d="${ICONS.menu}"`);
    expect(at1).toContain(`d="${ICONS.x}"`);
  });

  test("controlled mid-way: polyline of the frozen morph, deterministic", () => {
    const once = () => ssr({ from: ICONS.menu, to: ICONS.x, progress: 0.5 });
    const html = once();
    const d = html.match(/ d="([^"]*)"/)?.[1] ?? "";
    expect(d.startsWith("M")).toBe(true);
    expect(d).toContain("L");
    expect(d).not.toContain("NaN");
    expect(d).not.toBe(ICONS.menu);
    expect(d).not.toBe(ICONS.x);
    expect(once()).toBe(html);
  });

  test("no icon: empty path (pure imperative mode)", () => {
    const html = ssr();
    expect(html).toContain('<path d=""></path>');
  });
});
