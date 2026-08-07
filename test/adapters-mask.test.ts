/* maskTarget (morphicons/adapters): adapts a CSS-mask element (the
   UnoCSS/Iconify usage — no <path> in the DOM) into the driver's write
   contract via a hidden referenced <svg><mask><path>: the element's mask
   points at `url(#id)` and every frame only the live path's `d` changes (a
   data-URI-per-frame mask never decodes in time in Chromium and renders
   blank in flight — that mechanism is deliberately gone). The element's
   style is a plain bag; the hidden mask lives in the happy-dom document the
   whole suite preloads. Same hand-pumped rAF fake as dom.test.ts. */

import { afterEach, describe, expect, test } from "bun:test";
import { type MaskEl, type MaskStyle, maskTarget } from "../src/adapters/index";
import { canonicalD, createMorph } from "../src/dom/index";
import type { IconNode } from "../src/index";

/* Ambient: the suite runs on happy-dom (preloaded for the whole run), but
   this file typechecks in the root project WITHOUT lib DOM — declare just
   the read surface it touches (same technique as src/adapters/mask.ts). */
interface TestNode {
  getAttribute(name: string): string | null;
  querySelector(selector: string): TestNode | null;
}
declare const document: {
  getElementById(id: string): TestNode | null;
};

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

/** A stand-in element: a style bag that records every write. */
const fakeEl = (): MaskEl & { raw: Record<string, string> } => {
  const raw: Record<string, string> = {};
  return { style: raw as unknown as MaskStyle, raw };
};

/** The hidden mask node the target created for `el`, plus its live path. */
const maskOf = (el: { raw: Record<string, string> }) => {
  const id = /url\(#([^)]+)\)/.exec(el.raw.maskImage ?? "")?.[1] ?? "";
  const mask = document.getElementById(id);
  return { id, mask, path: mask?.querySelector("path") ?? null };
};

const MENU: IconNode = [["path", { d: "M4 5h16M4 12h16M4 19h16" }]];
const X: IconNode = [["path", { d: "M18 6L6 18M6 6l12 12" }]];

afterEach(() => {
  pending.clear();
  now = 0;
});

describe("maskTarget", () => {
  test("points the element at a hidden referenced mask and paints currentColor", () => {
    const el = fakeEl();
    const t = maskTarget(el);
    const { id, mask, path } = maskOf(el);
    expect(id.startsWith("morphicons-mask-")).toBe(true);
    expect(el.raw.maskImage).toBe(`url(#${id})`);
    expect(el.raw.webkitMaskImage).toBe(el.raw.maskImage);
    expect(el.raw.backgroundColor).toBe("currentColor");
    expect(mask?.getAttribute("maskContentUnits")).toBe("objectBoundingBox");
    expect(path?.getAttribute("stroke")).toBe("#fff");
    expect(path?.getAttribute("fill")).toBe("none");
    t.dispose();
  });

  test("d writes land on the live path; non-d attributes are ignored", () => {
    const el = fakeEl();
    const t = maskTarget(el);
    t.setAttribute("d", "M0 0h4");
    const { path } = maskOf(el);
    expect(path?.getAttribute("d")).toBe("M0 0h4");
    t.setAttribute("viewBox", "0 0 24 24");
    expect(path?.getAttribute("viewBox")).toBeNull();
    t.dispose();
  });

  test("double-buffers: every d write flips the referenced mask (WebKit repaint)", () => {
    const el = fakeEl();
    const t = maskTarget(el);
    t.setAttribute("d", "M0 0h1");
    const first = maskOf(el);
    t.setAttribute("d", "M0 0h2");
    const second = maskOf(el);
    expect(second.id).not.toBe(first.id);
    expect(second.path?.getAttribute("d")).toBe("M0 0h2");
    expect(el.raw.webkitMaskImage).toBe(el.raw.maskImage); // prefixed alias flips too
    t.setAttribute("d", "M0 0h3");
    const third = maskOf(el);
    expect(third.id).toBe(first.id); // back to the A buffer
    expect(third.path?.getAttribute("d")).toBe("M0 0h3");
    t.dispose();
  });

  test("each target gets its own masks; dispose removes both buffers", () => {
    const a = fakeEl();
    const b = fakeEl();
    const ta = maskTarget(a);
    const tb = maskTarget(b);
    ta.setAttribute("d", "M0 0h1");
    const aBack = maskOf(a); // flipped buffer
    ta.setAttribute("d", "M0 0h1");
    const aFront = maskOf(a); // the other one
    const mb = maskOf(b);
    expect(aBack.id).not.toBe(mb.id);
    ta.dispose();
    expect(document.getElementById(aBack.id)).toBeNull();
    expect(document.getElementById(aFront.id)).toBeNull();
    expect(document.getElementById(mb.id)).not.toBeNull();
    tb.dispose();
  });

  test("strokeWidth flows into the mask path", () => {
    const el = fakeEl();
    const t = maskTarget(el, { strokeWidth: 1.5 });
    expect(maskOf(el).path?.getAttribute("stroke-width")).toBe("1.5");
    t.dispose();
  });

  test("paint:false leaves background-color untouched", () => {
    const el = fakeEl();
    const t = maskTarget(el, { paint: false });
    expect(el.raw.backgroundColor).toBeUndefined();
    expect(el.raw.maskImage).toContain("url(#");
    t.dispose();
  });

  test("the grid maps onto the box: default 24 scale, custom viewBox honored", () => {
    const el = fakeEl();
    const t = maskTarget(el);
    const g = maskOf(el).mask?.querySelector("g");
    expect(g?.getAttribute("transform")).toBe(
      `scale(${1 / 24} ${1 / 24}) translate(0 0)`,
    );
    t.dispose();
    const el2 = fakeEl();
    const t2 = maskTarget(el2, { viewBox: "0 0 48 48" });
    expect(maskOf(el2).mask?.querySelector("g")?.getAttribute("transform")).toBe(
      `scale(${1 / 48} ${1 / 48}) translate(0 0)`,
    );
    t2.dispose();
    const el3 = fakeEl();
    const t3 = maskTarget(el3, { viewBox: "4 4 40 40" });
    expect(maskOf(el3).mask?.querySelector("g")?.getAttribute("transform")).toBe(
      `scale(${1 / 40} ${1 / 40}) translate(-4 -4)`,
    );
    t3.dispose();
  });
});

describe("createMorph over a mask target", () => {
  test("paints the initial icon at rest (canonical d on the live path)", () => {
    const el = fakeEl();
    const t = maskTarget(el);
    createMorph(t, MENU);
    expect(maskOf(el).path?.getAttribute("d")).toBe(canonicalD(MENU));
    t.dispose();
  });

  test("morphTo drives the mask path and snaps to the target at rest", () => {
    const el = fakeEl();
    const t = maskTarget(el);
    const m = createMorph(t, MENU);
    let sawNaN = false;
    m.morphTo(X, "snappy");
    let frames = 0;
    while (pending.size > 0 && frames < 2000) {
      now += 16;
      const cbs = [...pending.values()];
      pending.clear();
      for (const cb of cbs) cb(now);
      // Re-resolve every frame: the front buffer alternates by design.
      if (maskOf(el).path?.getAttribute("d")?.includes("NaN")) sawNaN = true;
      frames++;
    }
    expect(frames).toBeGreaterThan(1);
    expect(sawNaN).toBe(false);
    expect(maskOf(el).path?.getAttribute("d")).toBe(canonicalD(X));
    expect(m.progress).toBe(1);
    expect(pending.size).toBe(0); // scheduler idle — no leak
    t.dispose();
  });
});
