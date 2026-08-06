/* React Native binding, render half: what the SSR suites pin for the web
   bindings — the initial d comes from the pure core once and the framework
   never rewrites it, a11y and drop-in presentation props — asserted here on
   the mounted markup (RN has no renderToString). Plus the RN-only behavior:
   with reducedMotion="user" the OS setting comes from AccessibilityInfo
   (best-effort query + reduceMotionChanged subscription, armed lazily by the
   first "user" instance), where the web bindings consult matchMedia inside
   the driver. */

import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { canonicalD } from "../../src/dom/index";
import type { IconNode } from "../../src/index";
import type { MorphIconProps } from "../../src/react-native/index";
import { frame, pendingFrames, registerDom, settleAll } from "../client-dom";
import { ICONS } from "../helpers";
import { fireReduceMotion, rm } from "./mocks";

const { MorphIcon } = await import("../../src/react-native/index");

registerDom();
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

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

const cleanups: Array<() => Promise<void>> = [];

async function mountIcon(props: MorphIconProps) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const rerender = (next: MorphIconProps): Promise<void> =>
    act(async () => {
      root.render(<MorphIcon {...next} />);
    });
  await rerender(props);
  const instance = {
    svg: (): Element | null => container.querySelector("svg"),
    d: (): string => container.querySelector("path")?.getAttribute("d") ?? "",
    rerender,
    unmount: (): Promise<void> =>
      act(async () => {
        root.unmount();
      }),
  };
  cleanups.push(instance.unmount);
  return instance;
}

afterEach(async () => {
  settleAll(5000);
  fireReduceMotion(false);
  for (const dispose of cleanups.splice(0)) await dispose();
});

describe("MorphIcon (React Native render)", () => {
  test("uncontrolled: paints the icon's canonical d and hides from a11y", async () => {
    const m = await mountIcon({ icon: ICONS.menu });
    expect(m.d()).toBe(ICONS.menu);
    const svg = m.svg();
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("role")).toBeNull();
    expect(svg?.getAttribute("width")).toBe("24");
    expect(svg?.getAttribute("height")).toBe("24");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg?.getAttribute("fill")).toBe("none");
    expect(svg?.getAttribute("stroke")).toBe("currentColor");
    expect(svg?.getAttribute("stroke-width")).toBe("2");
    expect(svg?.getAttribute("stroke-linecap")).toBe("round");
    expect(svg?.getAttribute("stroke-linejoin")).toBe("round");
  });

  test("IconNode: the initial d is the canonical cubics", async () => {
    const m = await mountIcon({ icon: SQUARE });
    expect(m.d()).toBe(canonicalD(SQUARE));
  });

  test("IconNode with arcs: the SSR d is engine-stable (quantized)", async () => {
    const m = await mountIcon({ icon: EYE });
    const d = m.d() ?? "";
    expect(d.length).toBeGreaterThan(0);
    expect(d).not.toMatch(/\d\.\d{5,}/);
  });

  test("label: role img + aria-label, no aria-hidden", async () => {
    const m = await mountIcon({ icon: ICONS.x, label: "Close menu" });
    const svg = m.svg();
    expect(svg?.getAttribute("role")).toBe("img");
    expect(svg?.getAttribute("aria-label")).toBe("Close menu");
    expect(svg?.getAttribute("aria-hidden")).toBeNull();
  });

  test("lucide drop-in: size, color, strokeWidth, testID passthrough", async () => {
    const m = await mountIcon({
      icon: ICONS.check,
      size: 32,
      color: "#e6a83c",
      strokeWidth: 1.5,
      testID: "morph",
    });
    const svg = m.svg();
    expect(svg?.getAttribute("width")).toBe("32");
    expect(svg?.getAttribute("height")).toBe("32");
    expect(svg?.getAttribute("stroke")).toBe("#e6a83c");
    expect(svg?.getAttribute("stroke-width")).toBe("1.5");
    expect(svg?.getAttribute("data-testid")).toBe("morph");
  });

  test("absoluteStrokeWidth compensates for scale like lucide", async () => {
    const m = await mountIcon({
      icon: ICONS.check,
      size: 48,
      strokeWidth: 2,
      absoluteStrokeWidth: true,
    });
    expect(m.svg()?.getAttribute("stroke-width")).toBe("1");
  });

  test("controlled at the endpoints: canonical d of from (t=0) and to (t=1)", async () => {
    const at0 = await mountIcon({ from: ICONS.menu, to: ICONS.x, progress: 0 });
    const at1 = await mountIcon({ from: ICONS.menu, to: ICONS.x, progress: 1 });
    expect(at0.d()).toBe(ICONS.menu);
    expect(at1.d()).toBe(ICONS.x);
  });

  test("controlled mid-way: polyline of the frozen morph, deterministic", async () => {
    const render = () => mountIcon({ from: ICONS.menu, to: ICONS.x, progress: 0.5 });
    const a = await render();
    const d = a.d();
    expect(d.startsWith("M")).toBe(true);
    expect(d).toContain("L");
    expect(d).not.toContain("NaN");
    expect(d).not.toBe(ICONS.menu);
    expect(d).not.toBe(ICONS.x);
    const b = await render();
    expect(b.d()).toBe(d);
  });

  test("no icon: empty path (pure imperative mode)", async () => {
    const m = await mountIcon({});
    expect(m.d()).toBe("");
  });
});

describe("MorphIcon (React Native reduced motion)", () => {
  // Ordering matters in this describe: the default-policy tests assert that
  // the accessibility bridge was NEVER touched, so they must run before any
  // "user" test arms the module-level init.

  test("default 'never': mounting touches no AccessibilityInfo at all", async () => {
    await mountIcon({ icon: ICONS.menu });
    await mountIcon({ icon: ICONS.x });
    expect(rm.queries).toBe(0);
    expect(rm.subscriptions).toBe(0);
    expect(rm.listener).toBeNull();
  });

  test("default 'never': icon changes fly even with the OS setting on", async () => {
    rm.enabled = true; // the OS setting is on, but nobody asked for it
    const m = await mountIcon({ icon: ICONS.menu });
    await m.rerender({ icon: ICONS.x });
    expect(pendingFrames()).toBeGreaterThan(0);
    settleAll();
    expect(m.d()).toBe(ICONS.x);
    expect(rm.queries).toBe(0);
  });

  test("'always': jumps with zero frames, bridge still untouched", async () => {
    const m = await mountIcon({ icon: ICONS.menu, reducedMotion: "always" });
    await m.rerender({ icon: ICONS.x, reducedMotion: "always" });
    expect(m.d()).toBe(ICONS.x);
    expect(pendingFrames()).toBe(0);
    expect(rm.queries).toBe(0);
  });

  test("first 'user' instance queries AccessibilityInfo and subscribes exactly once", async () => {
    await mountIcon({ icon: ICONS.menu, reducedMotion: "user" });
    await mountIcon({ icon: ICONS.x, reducedMotion: "user" });
    // Module-level init: one query + one subscription for the whole run, no
    // matter how many "user" instances mount.
    expect(rm.queries).toBe(1);
    expect(rm.subscriptions).toBe(1);
    expect(rm.listener).not.toBeNull();
  });

  test("'user' + reduce motion on: icon changes jump to the target, zero frames", async () => {
    const m = await mountIcon({ icon: ICONS.menu, reducedMotion: "user" });
    await act(async () => {
      fireReduceMotion(true);
    });
    await m.rerender({ icon: ICONS.x, reducedMotion: "user" });
    expect(m.d()).toBe(ICONS.x);
    expect(pendingFrames()).toBe(0);
  });

  test("'user' + reduce motion off again: icon changes fly", async () => {
    const m = await mountIcon({ icon: ICONS.menu, reducedMotion: "user" });
    await act(async () => {
      fireReduceMotion(true);
    });
    await act(async () => {
      fireReduceMotion(false);
    });
    await m.rerender({ icon: ICONS.x, reducedMotion: "user" });
    expect(pendingFrames()).toBeGreaterThan(0);
    frame(16);
    const mid = m.d();
    expect(mid).not.toBe(ICONS.menu);
    expect(mid).not.toBe(ICONS.x);
    settleAll();
    expect(m.d()).toBe(ICONS.x);
  });

  test("the policy is live: back to 'never' flies while the OS setting is on", async () => {
    const m = await mountIcon({ icon: ICONS.menu, reducedMotion: "user" });
    await act(async () => {
      fireReduceMotion(true);
    });
    await m.rerender({ icon: ICONS.x, reducedMotion: "never" });
    expect(pendingFrames()).toBeGreaterThan(0);
    settleAll();
    expect(m.d()).toBe(ICONS.x);
  });
});
