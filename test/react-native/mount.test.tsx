/* React Native binding, lifecycle half: real React mounting on happy-dom
   with react-native-svg/react-native mocked (see mocks.tsx — the Path mock
   honors the setNativeProps contract the binding writes through). Pins the
   lifecycle contract shared by the four bindings: lazy driver on iconless
   mounts, controlled-wins precedence and pair invalidation when leaving
   controlled mode. Mirror of test/react/mount.test.tsx (and the vue/svelte
   ones). */

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

/** Reference d of a clean controlled mount at `progress` (deterministic). */
async function controlledD(progress: number): Promise<string> {
  const m = await mountIcon({ from: ICONS.menu, to: ICONS.x, progress });
  const d = m.d();
  await m.unmount();
  return d;
}

afterEach(async () => {
  settleAll(5000);
  for (const dispose of cleanups.splice(0)) await dispose();
});

describe("MorphIcon (React Native client)", () => {
  test("mount paints the canonical d and prop changes fly to the target", async () => {
    const m = await mountIcon({ icon: ICONS.menu });
    expect(m.d()).toBe(ICONS.menu);
    await m.rerender({ icon: ICONS.x });
    frame(16);
    frame(16);
    const mid = m.d();
    expect(mid.startsWith("M")).toBe(true);
    expect(mid).toContain("L");
    expect(mid).not.toBe(ICONS.menu);
    settleAll();
    expect(m.d()).toBe(ICONS.x);
    expect(pendingFrames()).toBe(0);
  });

  test("#1 lazy driver: iconless mount + imperative set", async () => {
    const m = await mountIcon({});
    expect(m.d()).toBe("");
    await act(async () => {
      m.ref.current?.set(ICONS.menu);
    });
    expect(m.d()).toBe(ICONS.menu);
    expect(pendingFrames()).toBe(0);
  });

  test("#1 lazy driver: iconless mount + imperative morphTo behaves as set", async () => {
    const m = await mountIcon({});
    await act(async () => {
      m.ref.current?.morphTo(ICONS.x);
    });
    expect(m.d()).toBe(ICONS.x);
    expect(pendingFrames()).toBe(0);
  });

  test("#1 lazy driver: an icon arriving late paints without animating", async () => {
    const m = await mountIcon({});
    await m.rerender({ icon: ICONS.menu });
    expect(m.d()).toBe(ICONS.menu);
    expect(pendingFrames()).toBe(0);
    // and the driver is live from then on
    await m.rerender({ icon: ICONS.x });
    settleAll();
    expect(m.d()).toBe(ICONS.x);
  });

  test("#1 lazy driver: a controlled pair arriving late seeks like a clean mount", async () => {
    const reference = await controlledD(0.5);
    const m = await mountIcon({});
    await m.rerender({ from: ICONS.menu, to: ICONS.x, progress: 0.5 });
    expect(m.d()).toBe(reference);
    expect(pendingFrames()).toBe(0);
  });

  test("#2 leaving controlled mode invalidates the pair (re-base on return)", async () => {
    const reference = await controlledD(0.25);
    const m = await mountIcon({ from: ICONS.menu, to: ICONS.x, progress: 0.5 });
    await act(async () => {
      m.ref.current?.set(ICONS.check);
    });
    expect(m.d()).toBe(ICONS.check);
    await m.rerender({ from: ICONS.menu, to: ICONS.x, progress: 0.25 });
    expect(m.d()).toBe(reference);
  });

  test("#3 controlled wins: icon changes are ignored while the pair is active", async () => {
    const m = await mountIcon({
      icon: ICONS.menu,
      from: ICONS.menu,
      to: ICONS.x,
      progress: 0.5,
    });
    const frozen = m.d();
    await m.rerender({ icon: ICONS.check, from: ICONS.menu, to: ICONS.x, progress: 0.5 });
    expect(m.d()).toBe(frozen);
    expect(pendingFrames()).toBe(0);
  });

  test("mode transition: dropping the pair hands the path back to icon", async () => {
    const m = await mountIcon({ from: ICONS.menu, to: ICONS.x, progress: 0.5 });
    await m.rerender({ icon: ICONS.check });
    settleAll();
    expect(m.d()).toBe(ICONS.check);
  });

  test("mode transition: adding a pair takes over from icon", async () => {
    const reference = await controlledD(0.5);
    const m = await mountIcon({ icon: ICONS.menu });
    await m.rerender({ from: ICONS.menu, to: ICONS.x, progress: 0.5 });
    expect(m.d()).toBe(reference);
    expect(pendingFrames()).toBe(0);
  });

  test("unmount mid-flight destroys the driver and stops the scheduler", async () => {
    const m = await mountIcon({ icon: ICONS.menu });
    await m.rerender({ icon: ICONS.x });
    frame(16);
    await m.unmount();
    expect(pendingFrames()).toBe(0);
  });
});
