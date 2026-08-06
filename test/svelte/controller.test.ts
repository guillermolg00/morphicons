/* The controller half of the Svelte binding, tested WITHOUT any DOM: a fake
   PathEl and a hand-pumped rAF, exactly like test/dom.test.ts. The mount
   suite pins the rune wiring; this one pins the logic that lives in
   shared.ts (lazy driver, controlled-wins precedence, pair invalidation). */

import { afterEach, describe, expect, test } from "bun:test";
import { createController } from "../../src/svelte/shared";
import { ICONS } from "../helpers";

type Cb = (ts: number) => void;

const pending = new Map<number, Cb>();
let now = 0;
let nextId = 1;

const G = globalThis as unknown as Record<string, unknown>;
G.requestAnimationFrame = (cb: Cb): number => {
  const id = nextId++;
  pending.set(id, cb);
  return id;
};
G.cancelAnimationFrame = (id: number): void => {
  pending.delete(id);
};

const settleAll = (maxFrames = 2000): void => {
  let n = 0;
  while (pending.size > 0 && n < maxFrames) {
    now += 16;
    const cbs = [...pending.values()];
    pending.clear();
    for (const cb of cbs) cb(now);
    n++;
  }
};

const fakePath = () => {
  const log: string[] = [];
  return {
    log,
    get d(): string {
      return log[log.length - 1] ?? "";
    },
    el: {
      setAttribute(name: string, value: string): void {
        if (name === "d") log.push(value);
      },
    },
  };
};

afterEach(() => {
  settleAll(5000);
});

describe("createController", () => {
  test("#1 lazy driver: iconless mount, born on the first imperative call", () => {
    const p = fakePath();
    const ctrl = createController({});
    ctrl.mount(p.el, {});
    expect(p.d).toBe(""); // no driver yet — nothing painted
    ctrl.set(ICONS.menu);
    expect(p.d).toBe(ICONS.menu);
    expect(pending.size).toBe(0);
    ctrl.destroy();
  });

  test("#1 lazy driver: born on a late icon via watch, without flight", () => {
    const p = fakePath();
    const ctrl = createController({});
    ctrl.mount(p.el, {});
    ctrl.watch({ icon: ICONS.menu });
    expect(p.d).toBe(ICONS.menu);
    expect(pending.size).toBe(0);
    ctrl.watch({ icon: ICONS.x });
    settleAll();
    expect(p.d).toBe(ICONS.x); // and it animates from then on
    ctrl.destroy();
  });

  test("#3 controlled wins: watch ignores icon while the pair is active", () => {
    const p = fakePath();
    const props = { from: ICONS.menu, to: ICONS.x, progress: 0.5 };
    const ctrl = createController(props);
    ctrl.mount(p.el, props);
    const frozen = p.d;
    ctrl.watch({ ...props, icon: ICONS.check });
    expect(p.d).toBe(frozen);
    expect(pending.size).toBe(0);
    ctrl.destroy();
  });

  test("#2 imperative set invalidates the pair: re-base on return", () => {
    const clean = fakePath();
    const ref = createController({ from: ICONS.menu, to: ICONS.x, progress: 0.25 });
    ref.mount(clean.el, { from: ICONS.menu, to: ICONS.x, progress: 0.25 });
    const reference = clean.d;
    ref.destroy();

    const p = fakePath();
    const props = { from: ICONS.menu, to: ICONS.x, progress: 0.5 };
    const ctrl = createController(props);
    ctrl.mount(p.el, props);
    ctrl.set(ICONS.check);
    expect(p.d).toBe(ICONS.check);
    ctrl.watch({ from: ICONS.menu, to: ICONS.x, progress: 0.25 });
    expect(p.d).toBe(reference);
    ctrl.destroy();
  });

  test("destroy turns every entry point into a no-op (no lazy resurrection)", () => {
    const p = fakePath();
    const ctrl = createController({});
    ctrl.mount(p.el, {});
    ctrl.destroy();
    ctrl.set(ICONS.menu);
    ctrl.morphTo(ICONS.x);
    ctrl.watch({ icon: ICONS.check });
    expect(p.d).toBe("");
    expect(pending.size).toBe(0);
  });

  test("reducedMotion seeds the driver at birth ('always' jumps from the start)", () => {
    const p = fakePath();
    const props = { icon: ICONS.menu, reducedMotion: "always" as const };
    const ctrl = createController(props);
    ctrl.mount(p.el, props);
    ctrl.watch({ ...props, icon: ICONS.x });
    expect(p.d).toBe(ICONS.x);
    expect(pending.size).toBe(0);
    ctrl.destroy();
  });

  test("reducedMotion is live and applies BEFORE the mode logic of the same run", () => {
    const p = fakePath();
    const props = { icon: ICONS.menu };
    const ctrl = createController(props);
    ctrl.mount(p.el, props);
    // Policy and icon change in the SAME watch run: the new policy governs it.
    ctrl.watch({ icon: ICONS.x, reducedMotion: "always" });
    expect(p.d).toBe(ICONS.x);
    expect(pending.size).toBe(0);
    // Dropping the prop falls back to "never": the next change flies.
    ctrl.watch({ icon: ICONS.check });
    expect(pending.size).toBe(1);
    settleAll();
    expect(p.d).toBe(ICONS.check);
    ctrl.destroy();
  });
});
