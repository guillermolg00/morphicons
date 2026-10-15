/* React Native binding, Fabric-reconciliation half (issue #25): under the New
   Architecture every React commit rebuilds the native path from the props on
   the fiber, so a `d` written imperatively with setNativeProps is dropped
   unless React's own declarative value is the live one. The Path mock replays
   that reconciliation on every update (see mocks.tsx), which turns the
   intermittent field report — "the settled morph resets to the initial icon
   when an unrelated prop changes" — into a deterministic assertion, in the
   four states where the driver owns the shape: at rest, mid-flight, after a
   lazy imperative birth and mid-scrub in controlled mode. */

import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import "./mocks";
import type { MorphHandle, MorphIconProps } from "../../src/react-native/index";
import { frame, pendingFrames, registerDom, settleAll } from "../client-dom";
import { FILL_DISC, ICONS, regionScrubD } from "../helpers";

const { MorphIcon } = await import("../../src/react-native/index");
const { preloadRegion } = await import("../../src/dom/index");

registerDom();
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const cleanups: Array<() => Promise<void>> = [];

async function mountIcon(props: MorphIconProps) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const ref = { current: null as MorphHandle | null };
  const rerender = (next: MorphIconProps): Promise<void> =>
    act(async () => {
      root.render(<MorphIcon ref={ref} {...next} />);
    });
  await rerender(props);
  const instance = {
    d: (): string => container.querySelector("path")?.getAttribute("d") ?? "",
    paint: (name: string): string | null =>
      container.querySelector("path")?.getAttribute(name) ?? null,
    rerender,
    ref,
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
  for (const dispose of cleanups.splice(0)) await dispose();
});

describe("MorphIcon (React Native / Fabric commits)", () => {
  test("a settled morph survives an unrelated render", async () => {
    const m = await mountIcon({ icon: ICONS.menu, color: "#52697b" });
    await m.rerender({ icon: ICONS.x, color: "#52697b" });
    settleAll();
    expect(m.d()).toBe(ICONS.x);
    // The report's trigger: selection/color changes while `icon` stays put.
    await m.rerender({ icon: ICONS.x, color: "#14854f" });
    expect(m.d()).toBe(ICONS.x);
    expect(pendingFrames()).toBe(0);
  });

  test("a render mid-flight does not rewind the path", async () => {
    const m = await mountIcon({ icon: ICONS.menu });
    await m.rerender({ icon: ICONS.x });
    frame(16);
    frame(16);
    const mid = m.d();
    expect(mid).not.toBe(ICONS.menu);
    await m.rerender({ icon: ICONS.x, color: "#14854f" });
    expect(m.d()).toBe(mid); // no frame ran in between
    settleAll();
    expect(m.d()).toBe(ICONS.x);
  });

  test("an imperatively born icon survives an unrelated render", async () => {
    const m = await mountIcon({});
    await act(async () => {
      m.ref.current?.set(ICONS.menu);
    });
    expect(m.d()).toBe(ICONS.menu);
    await m.rerender({ color: "#14854f" });
    expect(m.d()).toBe(ICONS.menu); // not the empty mount path
  });

  test("a frozen controlled pair survives an unrelated render", async () => {
    const m = await mountIcon({ from: ICONS.menu, to: ICONS.x, progress: 0.5 });
    const frozen = m.d();
    await m.rerender({ from: ICONS.menu, to: ICONS.x, progress: 0.5, color: "#14854f" });
    expect(m.d()).toBe(frozen);
    await m.rerender({ from: ICONS.menu, to: ICONS.x, progress: 0.75 });
    const advanced = m.d();
    expect(advanced).not.toBe(frozen);
    await m.rerender({ from: ICONS.menu, to: ICONS.x, progress: 0.75, color: "#52697b" });
    expect(m.d()).toBe(advanced);
  });
});

/* Paint rides the same road as `d`: the driver writes fill / stroke /
   fill-rule through the shim (setNativeProps), and every commit must
   declare the live values or Fabric resets them. RN has no cascade, so
   currentColor / inherit resolve to the color prop. */
describe("MorphIcon (React Native / paint)", () => {
  test("a fill icon paints in the color prop and survives unrelated renders", async () => {
    const m = await mountIcon({ icon: FILL_DISC, color: "#52697b" });
    expect(m.paint("fill")).toBe("#52697b");
    expect(m.paint("stroke")).toBe("none");
    expect(m.paint("fill-rule")).toBe("nonzero");
    await m.rerender({ icon: FILL_DISC, color: "#52697b", size: 32 });
    expect(m.paint("fill")).toBe("#52697b");
    expect(m.paint("stroke")).toBe("none");
    await m.rerender({ icon: FILL_DISC, color: "#14854f" });
    expect(m.paint("fill")).toBe("#14854f");
  });

  test("the stroke width reaches the driver: stroke ↔ fill outlines at it", async () => {
    const x1 = await regionScrubD(ICONS.x, 0.5, 1);
    const menu3 = await regionScrubD(ICONS.menu, 0.5, 3);
    const m = await mountIcon({
      from: ICONS.x,
      to: FILL_DISC,
      progress: 0.5,
      strokeWidth: 1,
    });
    expect(m.d()).toBe(x1);
    await m.rerender({ from: ICONS.menu, to: FILL_DISC, progress: 0.5, strokeWidth: 3 });
    expect(m.d()).toBe(menu3); // live
    await m.rerender({
      from: ICONS.x,
      to: FILL_DISC,
      progress: 0.5,
      size: 48,
      strokeWidth: 2,
      absoluteStrokeWidth: true,
    });
    expect(m.d()).toBe(x1); // absolute: 2 px at 48 is 1 on the grid
  });

  test("fill → stroke flies and rests stroked in the color prop", async () => {
    await preloadRegion();
    const m = await mountIcon({ icon: FILL_DISC, color: "#52697b" });
    await m.rerender({ icon: ICONS.x, color: "#52697b" });
    settleAll();
    expect(m.d()).toBe(ICONS.x);
    expect(m.paint("fill")).toBe("none");
    expect(m.paint("stroke")).toBe("#52697b");
    await m.rerender({ icon: ICONS.x, color: "#52697b", size: 32 });
    expect(m.paint("fill")).toBe("none");
    expect(m.paint("stroke")).toBe("#52697b");
  });

  test("the first commit already declares a fill icon's paint (react-native-web SSR)", () => {
    const html = renderToString(<MorphIcon icon={FILL_DISC} color="#52697b" />);
    expect(html).toMatch(/<path[^>]* fill="#52697b"/);
    expect(html).toMatch(/<path[^>]* stroke="none"/);
  });

  test("stroke-only use never declares paint (the path inherits the Svg)", async () => {
    const m = await mountIcon({ icon: ICONS.menu, color: "#52697b" });
    await m.rerender({ icon: ICONS.x, color: "#52697b" });
    settleAll();
    await m.rerender({ icon: ICONS.x, color: "#14854f" });
    expect(m.paint("fill")).toBeNull();
    expect(m.paint("stroke")).toBeNull();
  });
});
