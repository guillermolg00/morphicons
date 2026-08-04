/* React binding via renderToString (no real DOM): what matters in SSR is
   the exact static markup — canonical d, a11y and drop-in props. Client
   behavior (morphTo/seek on the <path>) is already pinned by the driver
   tests; only the React layer is checked here. */

import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { canonicalD } from "../../src/dom/index";
import type { IconNode } from "../../src/index";
import { MorphIcon } from "../../src/react/index";
import { ICONS } from "../helpers";

const SQUARE: IconNode = [["rect", { x: 2, y: 2, width: 20, height: 20 }]];

/* Arcs at non-cardinal angles: the arc→cubic trig carries engine-specific
   last-ulp noise, which the quantized emission must absorb (SSR compares
   the server's bytes against the browser's). */
const EYE: IconNode = [
  [
    "path",
    {
      d: "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0",
    },
  ],
  ["circle", { cx: 12, cy: 12, r: 3 }],
];

describe("MorphIcon (SSR)", () => {
  test("uncontrolled: emits the icon's canonical d and aria-hidden", () => {
    const html = renderToString(<MorphIcon icon={ICONS.menu} />);
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
    const html = renderToString(<MorphIcon icon={SQUARE} />);
    expect(html).toContain(`d="${canonicalD(SQUARE)}"`);
  });

  test("IconNode with arcs: the SSR d is engine-stable (quantized)", () => {
    const html = renderToString(<MorphIcon icon={EYE} />);
    const d = / d="([^"]*)"/.exec(html)?.[1] ?? "";
    expect(d.length).toBeGreaterThan(0);
    expect(d).not.toMatch(/\d\.\d{5,}/);
  });

  test("label: role img + <title>, no aria-hidden", () => {
    const html = renderToString(<MorphIcon icon={ICONS.x} label="Close menu" />);
    expect(html).toContain('role="img"');
    expect(html).toContain("<title>Close menu</title>");
    expect(html).not.toContain("aria-hidden");
  });

  test("lucide-react drop-in: size, color, strokeWidth, className passthrough", () => {
    const html = renderToString(
      <MorphIcon
        icon={ICONS.check}
        size={32}
        color="#e6a83c"
        strokeWidth={1.5}
        className="my-icon"
        data-testid="morph"
      />,
    );
    expect(html).toContain('width="32"');
    expect(html).toContain('height="32"');
    expect(html).toContain('stroke="#e6a83c"');
    expect(html).toContain('stroke-width="1.5"');
    expect(html).toContain('class="my-icon"');
    expect(html).toContain('data-testid="morph"');
  });

  test("absoluteStrokeWidth compensates for scale like lucide-react", () => {
    const html = renderToString(
      <MorphIcon icon={ICONS.check} size={48} strokeWidth={2} absoluteStrokeWidth />,
    );
    expect(html).toContain('stroke-width="1"');
  });

  test("controlled at the endpoints: canonical d of from (t=0) and to (t=1)", () => {
    const at0 = renderToString(<MorphIcon from={ICONS.menu} to={ICONS.x} progress={0} />);
    const at1 = renderToString(<MorphIcon from={ICONS.menu} to={ICONS.x} progress={1} />);
    expect(at0).toContain(`d="${ICONS.menu}"`);
    expect(at1).toContain(`d="${ICONS.x}"`);
  });

  test("controlled mid-way: polyline of the frozen morph, deterministic", () => {
    const render = () =>
      renderToString(<MorphIcon from={ICONS.menu} to={ICONS.x} progress={0.5} />);
    const html = render();
    const d = html.match(/ d="([^"]*)"/)?.[1] ?? "";
    expect(d.startsWith("M")).toBe(true);
    expect(d).toContain("L");
    expect(d).not.toContain("NaN");
    expect(d).not.toBe(ICONS.menu);
    expect(d).not.toBe(ICONS.x);
    expect(render()).toBe(html);
  });

  test("no icon: empty path (pure imperative mode)", () => {
    const html = renderToString(<MorphIcon />);
    expect(html).toContain('d=""');
  });
});
