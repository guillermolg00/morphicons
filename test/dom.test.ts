/* DOM driver without jsdom: the element is an object with setAttribute and
   the rAF is a fake installed on globalThis, pumped by hand (the driver
   reads globals at runtime, never at import time — that working here is
   exactly what this proves). Each frame() advances the clock and fires the
   pending callbacks, as the browser would. */

import { afterEach, describe, expect, test } from "bun:test";
import { createMorph } from "../src/dom/index";
import {
  cubicsToPathD,
  type IconNode,
  iconToCubics,
  resampleIcon,
  serialize,
} from "../src/index";
import { ICONS } from "./helpers";

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

/** Advances the clock by `ms` and fires the pending frames. */
const frame = (ms: number): void => {
  now += ms;
  const cbs = [...pending.values()];
  pending.clear();
  for (const cb of cbs) cb(now);
};

/** Pumps 16 ms frames until the scheduler stops. Returns how many. */
const settleAll = (maxFrames = 2000): number => {
  let n = 0;
  while (pending.size > 0 && n < maxFrames) {
    frame(16);
    n++;
  }
  return n;
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

const SQUARE: IconNode = [["rect", { x: 2, y: 2, width: 20, height: 20 }]];
const CIRCLE: IconNode = [["circle", { cx: 12, cy: 12, r: 10 }]];

afterEach(() => {
  // No test may leave the singleton scheduler with live frames.
  settleAll(5000);
});

describe("createMorph", () => {
  test("paints the initial canonical d: string verbatim, IconNode to cubics", () => {
    const p = fakePath();
    const m = createMorph(p.el, ICONS.menu);
    expect(p.d).toBe(ICONS.menu);
    m.destroy();

    const q = fakePath();
    const m2 = createMorph(q.el, SQUARE);
    expect(q.d).toBe(cubicsToPathD(iconToCubics(SQUARE)));
    m2.destroy();
  });

  test("morphTo flies as NaN-free polylines and settles with canonical snap", () => {
    const p = fakePath();
    const m = createMorph(p.el, ICONS.menu);
    m.morphTo(ICONS.x);
    expect(pending.size).toBe(1);
    frame(16); // dt 0: paints the departure state
    frame(16);
    expect(p.d.startsWith("M")).toBe(true);
    expect(p.d).toContain("L");
    expect(m.progress).toBeGreaterThan(0);
    const frames = settleAll();
    expect(frames).toBeGreaterThan(5);
    expect(frames).toBeLessThan(400);
    expect(p.d).toBe(ICONS.x); // snap: the input string, verbatim
    expect(m.progress).toBe(1);
    expect(pending.size).toBe(0); // scheduler stopped
    for (const d of p.log) expect(d).not.toContain("NaN");
    m.destroy();
  });

  test("interruption: re-plans from the exact intermediate shape", () => {
    const p = fakePath();
    const m = createMorph(p.el, ICONS.menu);
    m.morphTo(ICONS.x);
    for (let i = 0; i < 8; i++) frame(16);
    const mid = p.d;
    expect(mid).not.toBe(ICONS.menu);
    m.morphTo(ICONS.check);
    // dt = 0 → the spring doesn't advance: first frame paints the exact snapshot
    frame(0);
    expect(p.d).toBe(mid);
    settleAll();
    expect(p.d).toBe(ICONS.check);
    for (const d of p.log) expect(d).not.toContain("NaN");
    m.destroy();
  });

  test("seek renders frozen t, no scheduler, deterministic", () => {
    const p = fakePath();
    const m = createMorph(p.el, ICONS.menu);

    // t = 0 is the exact source: the departure icon's polyline
    m.seek(ICONS.x, 0);
    const subs = resampleIcon(ICONS.menu);
    expect(p.d).toBe(
      serialize(
        subs.map((s) => s.pts),
        subs.map((s) => s.closed),
      ),
    );
    expect(pending.size).toBe(0);

    m.seek(ICONS.x, 0.5);
    expect(m.progress).toBe(0.5);
    const d1 = p.d;
    m.seek(ICONS.x, 0.25);
    m.seek(ICONS.x, 0.5);
    expect(p.d).toBe(d1); // same plan reused → same frame

    // morphTo takes off from the seek shape (the dt 0 frame preserves it)
    m.morphTo(ICONS.x);
    frame(0);
    expect(p.d).toBe(d1);
    settleAll();
    expect(p.d).toBe(ICONS.x);
    m.destroy();
  });

  test("progress setter = seek on the active target (cancels the flight)", () => {
    const p = fakePath();
    const m = createMorph(p.el, ICONS.menu);
    m.morphTo(ICONS.x);
    frame(16);
    frame(16);
    m.progress = 0.25;
    expect(pending.size).toBe(0);
    expect(m.progress).toBe(0.25);
    m.morphTo(ICONS.x); // "release the gesture": finish the flight from there
    settleAll();
    expect(p.d).toBe(ICONS.x);
    m.destroy();
  });

  test("prefers-reduced-motion degrades morphTo to set", () => {
    G.matchMedia = () => ({ matches: true });
    const p = fakePath();
    const m = createMorph(p.el, ICONS.menu);
    m.morphTo(ICONS.x);
    expect(pending.size).toBe(0);
    expect(p.d).toBe(ICONS.x);
    G.matchMedia = undefined;
    m.destroy();
  });

  test("set jumps without animating and cancels the flight", () => {
    const p = fakePath();
    const m = createMorph(p.el, ICONS.menu);
    m.morphTo(ICONS.x);
    frame(16);
    frame(16);
    m.set(ICONS.check);
    expect(p.d).toBe(ICONS.check);
    expect(pending.size).toBe(0);
    expect(m.progress).toBe(1);
    m.destroy();
  });

  test("destroy stops the flight and turns the instance into a no-op", () => {
    const p = fakePath();
    const m = createMorph(p.el, ICONS.menu);
    m.morphTo(ICONS.x);
    frame(16);
    m.destroy();
    expect(pending.size).toBe(0);
    const before = p.d;
    m.morphTo(ICONS.check);
    m.set(ICONS.plus);
    m.seek(ICONS.x, 0.5);
    m.progress = 0.2;
    frame(16);
    expect(p.d).toBe(before);
  });

  test("singleton scheduler: several instances share a single rAF", () => {
    const a = fakePath();
    const b = fakePath();
    const ma = createMorph(a.el, ICONS.menu);
    const mb = createMorph(b.el, ICONS.plus);
    ma.morphTo(ICONS.x);
    mb.morphTo(ICONS.x, "bouncy");
    expect(pending.size).toBe(1);
    frame(16);
    frame(16);
    expect(pending.size).toBe(1);
    expect(a.d).toContain("L");
    expect(b.d).toContain("L");
    settleAll();
    expect(a.d).toBe(ICONS.x);
    expect(b.d).toBe(ICONS.x);
    ma.destroy();
    mb.destroy();
  });

  test("closed paths: flight with Z and canonical IconNode snap", () => {
    const p = fakePath();
    const m = createMorph(p.el, SQUARE);
    m.morphTo(CIRCLE, "smooth");
    frame(16);
    frame(16);
    frame(16);
    expect(p.d).toContain("Z");
    settleAll();
    expect(p.d).toBe(cubicsToPathD(iconToCubics(CIRCLE)));
    for (const d of p.log) expect(d).not.toContain("NaN");
    m.destroy();
  });

  test("custom spring (stiffness/damping) also settles", () => {
    const p = fakePath();
    const m = createMorph(p.el, ICONS.menu);
    m.morphTo(ICONS.x, { stiffness: 80, damping: 40 });
    const frames = settleAll();
    expect(frames).toBeGreaterThan(10);
    expect(p.d).toBe(ICONS.x);
    m.destroy();
  });

  test("the plan cache does not alter the result (identical runs)", () => {
    const run = (): string => {
      const p = fakePath();
      const m = createMorph(p.el, SQUARE);
      m.morphTo(CIRCLE);
      settleAll();
      m.set(SQUARE);
      m.morphTo(CIRCLE);
      settleAll();
      m.destroy();
      return p.log.join("|");
    };
    expect(run()).toBe(run());
  });
});
