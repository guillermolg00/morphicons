/* Vue binding, client half: real mounting on happy-dom. Pins the lifecycle
   contract shared by the three bindings: lazy driver on iconless mounts,
   controlled-wins precedence and pair invalidation when leaving controlled
   mode. Mirror of test/react/mount.test.tsx and test/svelte/mount.test.ts. */

import { afterEach, describe, expect, test } from "bun:test";
import { createApp, h, nextTick, reactive, shallowRef } from "vue";
import type { MorphHandle } from "../../src/vue/index";
import { MorphIcon } from "../../src/vue/index";
import { frame, pendingFrames, registerDom, settleAll } from "../client-dom";
import { ICONS } from "../helpers";

registerDom();

type Props = Record<string, unknown>;

const cleanups: Array<() => void> = [];

function mountIcon(initial: Props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const props = reactive<Props>({ ...initial });
  const handle = shallowRef<MorphHandle>();
  const app = createApp({
    render: () => h(MorphIcon, { ...props, ref: handle }),
  });
  app.config.warnHandler = () => {}; // non-emits ref warnings stay out of stderr
  app.mount(container);
  const instance = {
    d: (): string => container.querySelector("path")?.getAttribute("d") ?? "",
    update: async (next: Props): Promise<void> => {
      for (const key of Object.keys(props)) delete props[key];
      Object.assign(props, next);
      await nextTick();
    },
    handle: (): MorphHandle | undefined => handle.value,
    unmount: (): void => app.unmount(),
  };
  cleanups.push(instance.unmount);
  return instance;
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

describe("MorphIcon (Vue client)", () => {
  test("mount paints the canonical d and prop changes fly to the target", async () => {
    const m = mountIcon({ icon: ICONS.menu });
    expect(m.d()).toBe(ICONS.menu);
    await m.update({ icon: ICONS.x });
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

  test("#1 lazy driver: an icon arriving late paints without animating", async () => {
    const m = mountIcon({});
    await m.update({ icon: ICONS.menu });
    expect(m.d()).toBe(ICONS.menu);
    expect(pendingFrames()).toBe(0);
    // and the driver is live from then on
    await m.update({ icon: ICONS.x });
    settleAll();
    expect(m.d()).toBe(ICONS.x);
  });

  test("#1 lazy driver: a controlled pair arriving late seeks like a clean mount", async () => {
    const reference = controlledD(0.5);
    const m = mountIcon({});
    await m.update({ from: ICONS.menu, to: ICONS.x, progress: 0.5 });
    expect(m.d()).toBe(reference);
    expect(pendingFrames()).toBe(0);
  });

  test("#2 leaving controlled mode invalidates the pair (re-base on return)", async () => {
    const reference = controlledD(0.25);
    const m = mountIcon({ from: ICONS.menu, to: ICONS.x, progress: 0.5 });
    m.handle()?.set(ICONS.check);
    expect(m.d()).toBe(ICONS.check);
    await m.update({ from: ICONS.menu, to: ICONS.x, progress: 0.25 });
    expect(m.d()).toBe(reference);
  });

  test("#3 controlled wins: icon changes are ignored while the pair is active", async () => {
    const m = mountIcon({
      icon: ICONS.menu,
      from: ICONS.menu,
      to: ICONS.x,
      progress: 0.5,
    });
    const frozen = m.d();
    await m.update({ icon: ICONS.check, from: ICONS.menu, to: ICONS.x, progress: 0.5 });
    expect(m.d()).toBe(frozen);
    expect(pendingFrames()).toBe(0);
  });

  test("mode transition: dropping the pair hands the path back to icon", async () => {
    const m = mountIcon({ from: ICONS.menu, to: ICONS.x, progress: 0.5 });
    await m.update({ icon: ICONS.check });
    settleAll();
    expect(m.d()).toBe(ICONS.check);
  });

  test("mode transition: adding a pair takes over from icon", async () => {
    const reference = controlledD(0.5);
    const m = mountIcon({ icon: ICONS.menu });
    await m.update({ from: ICONS.menu, to: ICONS.x, progress: 0.5 });
    expect(m.d()).toBe(reference);
    expect(pendingFrames()).toBe(0);
  });

  test("unmount mid-flight destroys the driver and stops the scheduler", async () => {
    const m = mountIcon({ icon: ICONS.menu });
    await m.update({ icon: ICONS.x });
    frame(16);
    m.unmount();
    expect(pendingFrames()).toBe(0);
  });
});
