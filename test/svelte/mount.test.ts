/* Svelte binding, client half: the SAME MorphIcon.svelte compiled as client
   (loader.ts, ?client suffix) mounted for real on happy-dom via the harness.
   Pins the lifecycle contract shared by the three bindings: lazy driver on
   iconless mounts, controlled-wins precedence and pair invalidation when
   leaving controlled mode. Mirror of test/react/mount.test.tsx and
   test/vue/mount.test.ts. */

import { afterEach, describe, expect, test } from "bun:test";
import type { MorphIconProps } from "../../src/svelte/shared";
import { frame, pendingFrames, registerDom, settleAll } from "../client-dom";
import { ICONS } from "../helpers";

registerDom();
const { flushSync, mount, unmount } = await import("svelte?client");
const { default: Harness } = await import("./harness.svelte?client");

const cleanups: Array<() => void> = [];

function mountIcon(initial: MorphIconProps) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const instance = mount(Harness, { target: container, props: { initial } });
  flushSync();
  let alive = true;
  const api = {
    d: (): string => container.querySelector("path")?.getAttribute("d") ?? "",
    update: (next: MorphIconProps): void => {
      instance.update(next);
      flushSync();
    },
    handle: () => instance.getHandle(),
    unmount: (): void => {
      if (!alive) return;
      alive = false;
      unmount(instance);
    },
  };
  cleanups.push(api.unmount);
  return api;
}

/** Reference d of a clean controlled mount at `progress` (deterministic). */
function controlledD(progress: number): string {
  const m = mountIcon({ from: ICONS.menu, to: ICONS.x, progress });
  const d = m.d();
  m.unmount();
  return d;
}

afterEach(() => {
  settleAll(5000);
  for (const dispose of cleanups.splice(0)) dispose();
});

describe("MorphIcon (Svelte client)", () => {
  test("mount paints the canonical d and prop changes fly to the target", () => {
    const m = mountIcon({ icon: ICONS.menu });
    expect(m.d()).toBe(ICONS.menu);
    m.update({ icon: ICONS.x });
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

  test("#1 lazy driver: iconless mount + imperative set", () => {
    const m = mountIcon({});
    expect(m.d()).toBe("");
    m.handle()?.set(ICONS.menu);
    expect(m.d()).toBe(ICONS.menu);
    expect(pendingFrames()).toBe(0);
  });

  test("#1 lazy driver: iconless mount + imperative morphTo behaves as set", () => {
    const m = mountIcon({});
    m.handle()?.morphTo(ICONS.x);
    expect(m.d()).toBe(ICONS.x);
    expect(pendingFrames()).toBe(0);
  });

  test("#1 lazy driver: an icon arriving late paints without animating", () => {
    const m = mountIcon({});
    m.update({ icon: ICONS.menu });
    expect(m.d()).toBe(ICONS.menu);
    expect(pendingFrames()).toBe(0);
    // and the driver is live from then on
    m.update({ icon: ICONS.x });
    settleAll();
    expect(m.d()).toBe(ICONS.x);
  });

  test("#1 lazy driver: a controlled pair arriving late seeks like a clean mount", () => {
    const reference = controlledD(0.5);
    const m = mountIcon({});
    m.update({ from: ICONS.menu, to: ICONS.x, progress: 0.5 });
    expect(m.d()).toBe(reference);
    expect(pendingFrames()).toBe(0);
  });

  test("#2 leaving controlled mode invalidates the pair (re-base on return)", () => {
    const reference = controlledD(0.25);
    const m = mountIcon({ from: ICONS.menu, to: ICONS.x, progress: 0.5 });
    m.handle()?.set(ICONS.check);
    expect(m.d()).toBe(ICONS.check);
    m.update({ from: ICONS.menu, to: ICONS.x, progress: 0.25 });
    expect(m.d()).toBe(reference);
  });

  test("#3 controlled wins: icon changes are ignored while the pair is active", () => {
    const m = mountIcon({
      icon: ICONS.menu,
      from: ICONS.menu,
      to: ICONS.x,
      progress: 0.5,
    });
    const frozen = m.d();
    m.update({ icon: ICONS.check, from: ICONS.menu, to: ICONS.x, progress: 0.5 });
    expect(m.d()).toBe(frozen);
    expect(pendingFrames()).toBe(0);
  });

  test("mode transition: dropping the pair hands the path back to icon", () => {
    const m = mountIcon({ from: ICONS.menu, to: ICONS.x, progress: 0.5 });
    m.update({ icon: ICONS.check });
    settleAll();
    expect(m.d()).toBe(ICONS.check);
  });

  test("mode transition: adding a pair takes over from icon", () => {
    const reference = controlledD(0.5);
    const m = mountIcon({ icon: ICONS.menu });
    m.update({ from: ICONS.menu, to: ICONS.x, progress: 0.5 });
    expect(m.d()).toBe(reference);
    expect(pendingFrames()).toBe(0);
  });

  test("unmount mid-flight destroys the driver and stops the scheduler", () => {
    const m = mountIcon({ icon: ICONS.menu });
    m.update({ icon: ICONS.x });
    frame(16);
    m.unmount();
    expect(pendingFrames()).toBe(0);
  });
});
