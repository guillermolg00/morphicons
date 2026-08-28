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
import "./mocks";
import type { MorphHandle, MorphIconProps } from "../../src/react-native/index";
import { frame, pendingFrames, registerDom, settleAll } from "../client-dom";
import { ICONS } from "../helpers";

const { MorphIcon } = await import("../../src/react-native/index");

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
