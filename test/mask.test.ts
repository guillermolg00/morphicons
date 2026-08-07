/* createMorph auto-detects the write strategy from the element's tagName:
   a <path> (or a tagName-less fake / RN shim) gets the `d` attribute; any
   other element is driven as a CSS mask-image (the UnoCSS/Iconify usage).
   Same hand-pumped rAF fake as dom.test.ts — the element is a plain object,
   never a real node. */

import { afterEach, describe, expect, test } from "bun:test";
import { canonicalD, createMorph, type MaskStyle } from "../src/dom/index";
import type { IconNode } from "../src/index";

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

const settleAll = (maxFrames = 2000): number => {
  let n = 0;
  while (pending.size > 0 && n < maxFrames) {
    now += 16;
    const cbs = [...pending.values()];
    pending.clear();
    for (const cb of cbs) cb(now);
    n++;
  }
  return n;
};

/** A mask-styled element (e.g. a <span>): tagName + a style bag that records
 *  writes. `setAttribute` is spied — it must NEVER be called with `d`. */
const maskEl = (tagName = "SPAN") => {
  const raw: Record<string, string> = {};
  const attrs: string[] = [];
  return {
    raw,
    attrs,
    el: {
      tagName,
      style: raw as unknown as MaskStyle,
      setAttribute(name: string, _v: string): void {
        attrs.push(name);
      },
    },
  };
};

/** A path-mode element: records `d` writes via setAttribute. */
const pathEl = (tagName?: string) => {
  const log: string[] = [];
  return {
    log,
    get d(): string {
      return log[log.length - 1] ?? "";
    },
    el: {
      tagName,
      setAttribute(name: string, value: string): void {
        if (name === "d") log.push(value);
      },
    },
  };
};

const dOf = (raw: Record<string, string>): string => {
  const url = raw.maskImage ?? "";
  return /<path d="([^"]*)"\/>/.exec(decodeURIComponent(url))?.[1] ?? "";
};

const MENU: IconNode = [["path", { d: "M4 5h16M4 12h16M4 19h16" }]];
const X: IconNode = [["path", { d: "M18 6L6 18M6 6l12 12" }]];

afterEach(() => {
  pending.clear();
  now = 0;
});

describe("write-strategy detection", () => {
  test("a non-<path> element is driven as a CSS mask-image", () => {
    const { el, raw, attrs } = maskEl("SPAN");
    createMorph(el, MENU);
    expect(dOf(raw)).toBe(canonicalD(MENU));
    expect(raw.maskRepeat).toBe("no-repeat");
    expect(raw.backgroundColor).toBe("currentColor");
    expect(raw.maskImage).toBe(raw.webkitMaskImage);
    // The `d` attribute is never written on a mask element.
    expect(attrs).not.toContain("d");
  });

  test("a real <path> gets the d attribute, not a mask", () => {
    const p = pathEl("path");
    createMorph(p.el, MENU);
    expect(p.d).toBe(canonicalD(MENU));
  });

  test("a tagName-less fake (RN shim) stays in path mode", () => {
    const p = pathEl(undefined);
    createMorph(p.el, MENU);
    expect(p.d).toBe(canonicalD(MENU));
  });

  test("strokeWidth flows into the rasterized mask svg", () => {
    const { el, raw } = maskEl();
    createMorph(el, MENU, { strokeWidth: 1.5 });
    expect(decodeURIComponent(raw.maskImage)).toContain('stroke-width="1.5"');
  });
});

describe("mask morph animates and settles", () => {
  test("morphTo drives the mask and snaps to the target at rest", () => {
    const { el, raw } = maskEl();
    const m = createMorph(el, MENU);
    m.morphTo(X, "snappy");
    const frames = settleAll();
    expect(frames).toBeGreaterThan(1);
    expect(raw.maskImage).not.toContain("NaN");
    expect(dOf(raw)).toBe(canonicalD(X));
    expect(m.progress).toBe(1);
    expect(pending.size).toBe(0); // scheduler idle — no leak
  });
});
