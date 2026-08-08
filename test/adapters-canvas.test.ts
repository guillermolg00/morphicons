/* canvasTarget (morphicons/adapters): adapts a 2D canvas — the element, an
   OffscreenCanvas, or a bare context — into the driver's write contract.
   Every `d` write becomes `new Path2D(d)` + `stroke()`: the platform parses
   the path string natively, so the adapter is pure state setup around one
   call. The suite runs on structural fakes only (a call-recording ctx and a
   global FakePath2D that just keeps its `d`) — no real canvas anywhere, same
   spirit as the style bag in adapters-mask.test.ts. The morph tests drive the
   real dom driver with the same hand-pumped rAF fake as dom.test.ts. */

import { describe, expect, test } from "bun:test";
import {
  type Canvas2DContext,
  type CanvasSurface,
  canvasTarget,
} from "../src/adapters/index";
import { canonicalD, createMorph } from "../src/dom/index";
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

/** Deterministic stand-in for the platform's path parser: keeps the `d`. */
class FakePath2D {
  d: string | undefined;
  constructor(d?: string) {
    this.d = d;
  }
}
G.Path2D = FakePath2D;

type Call = { fn: string; args: unknown[] };

/** A call-recording 2D context over a plain {width, height} canvas bag. */
const fakeCtx = (canvas: {
  width: number;
  height: number;
}): { ctx: Canvas2DContext; calls: Call[] } => {
  const calls: Call[] = [];
  const ctx: Canvas2DContext = {
    canvas,
    lineWidth: 0,
    lineCap: "",
    lineJoin: "",
    strokeStyle: "OWNER",
    setTransform: (...args: number[]): void => {
      calls.push({ fn: "setTransform", args });
    },
    clearRect: (...args: number[]): void => {
      calls.push({ fn: "clearRect", args });
    },
    stroke: (path: object): void => {
      calls.push({ fn: "stroke", args: [(path as FakePath2D).d] });
    },
  };
  return { ctx, calls };
};

/** A canvas-shaped fake: `getContext("2d")` hands out its recording ctx. */
const fakeCanvas = (
  w = 48,
  h = 48,
  opts: { style?: boolean; no2d?: boolean } = {},
): { canvas: CanvasSurface; ctx: Canvas2DContext; calls: Call[] } => {
  const canvas: Record<string, unknown> = { width: w, height: h };
  if (opts.style) canvas.style = {};
  const { ctx, calls } = fakeCtx(canvas as { width: number; height: number });
  canvas.getContext = (id: string): Canvas2DContext | null =>
    !opts.no2d && id === "2d" ? ctx : null;
  return { canvas: canvas as unknown as CanvasSurface, ctx, calls };
};

const strokes = (calls: Call[]): unknown[] =>
  calls.filter((c) => c.fn === "stroke").map((c) => c.args[0]);
const lastD = (calls: Call[]): unknown => strokes(calls).at(-1);

const MENU: IconNode = [["path", { d: "M4 5h16M4 12h16M4 19h16" }]];
const X: IconNode = [["path", { d: "M18 6L6 18M6 6l12 12" }]];

describe("canvasTarget", () => {
  test("accepts a canvas: asks it for the 2D context and strokes there", () => {
    const { canvas, calls } = fakeCanvas();
    const t = canvasTarget(canvas);
    t.setAttribute("d", "M0 0h4");
    expect(lastD(calls)).toBe("M0 0h4");
  });

  test("accepts a bare 2D context (worker/host that already owns one)", () => {
    const { ctx, calls } = fakeCtx({ width: 48, height: 48 });
    const t = canvasTarget(ctx);
    t.setAttribute("d", "M0 0h4");
    expect(lastD(calls)).toBe("M0 0h4");
  });

  test("throws when the canvas has no 2D context (already claimed by webgl)", () => {
    const { canvas } = fakeCanvas(48, 48, { no2d: true });
    expect(() => canvasTarget(canvas)).toThrow("2D context");
  });

  test("throws without Path2D (no browser, no worker)", () => {
    const saved = G.Path2D;
    delete G.Path2D;
    try {
      expect(() => canvasTarget(fakeCanvas().canvas)).toThrow("Path2D");
    } finally {
      G.Path2D = saved;
    }
  });

  test("non-d attributes are ignored: no draw, no onWrite", () => {
    let writes = 0;
    const { canvas, calls } = fakeCanvas();
    const t = canvasTarget(canvas, { onWrite: () => writes++ });
    t.setAttribute("viewBox", "0 0 24 24");
    t.setAttribute("fill", "none");
    expect(calls.length).toBe(0);
    expect(writes).toBe(0);
    t.setAttribute("d", "M0 0h4");
    expect(strokes(calls).length).toBe(1);
    expect(writes).toBe(1);
  });

  test("square canvas, default grid: scale w/24, clear the whole device box first", () => {
    const { canvas, calls } = fakeCanvas(48, 48);
    canvasTarget(canvas).setAttribute("d", "M0 0h4");
    expect(calls.map((c) => c.fn)).toEqual([
      "setTransform", // identity — clear happens in device coordinates
      "clearRect",
      "setTransform", // grid → backing store
      "stroke",
    ]);
    expect(calls[0].args).toEqual([1, 0, 0, 1, 0, 0]);
    expect(calls[1].args).toEqual([0, 0, 48, 48]);
    expect(calls[2].args).toEqual([2, 0, 0, 2, 0, 0]);
  });

  test("non-square canvas letterboxes: min-side scale, centered (xMidYMid meet)", () => {
    const { canvas, calls } = fakeCanvas(96, 48);
    canvasTarget(canvas).setAttribute("d", "M0 0h4");
    expect(calls[2].args).toEqual([2, 0, 0, 2, 24, 0]);
  });

  test("viewBox with a non-zero origin translates it away (mask parity)", () => {
    const { canvas, calls } = fakeCanvas(80, 80);
    canvasTarget(canvas, { viewBox: "4 4 40 40" }).setAttribute("d", "M0 0h4");
    expect(calls[2].args).toEqual([2, 0, 0, 2, -8, -8]);
  });

  test("garbage viewBox falls back to the 24 grid", () => {
    const { canvas, calls } = fakeCanvas(48, 48);
    canvasTarget(canvas, { viewBox: "banana" }).setAttribute("d", "M0 0h4");
    expect(calls[2].args).toEqual([2, 0, 0, 2, 0, 0]);
  });

  test("0×0 backing store (display:none, pre-layout): silent no-op frame, no crash", () => {
    const { canvas, calls } = fakeCanvas(0, 0);
    canvasTarget(canvas).setAttribute("d", "M0 0h4");
    // Degenerate transform: the stroke lands nowhere, and that is the point —
    // an unlaid-out canvas must not throw mid-flight.
    expect(calls[2].args).toEqual([0, 0, 0, 0, 0, 0]);
    expect(strokes(calls).length).toBe(1);
  });

  test("reads the backing store per write: owner resizes are picked up", () => {
    const { canvas, ctx, calls } = fakeCanvas(48, 48);
    const t = canvasTarget(canvas);
    t.setAttribute("d", "M0 0h1");
    ctx.canvas.width = 96;
    ctx.canvas.height = 96;
    t.setAttribute("d", "M0 0h2");
    const transforms = calls.filter((c) => c.fn === "setTransform");
    expect(transforms[1].args).toEqual([2, 0, 0, 2, 0, 0]);
    expect(transforms[3].args).toEqual([4, 0, 0, 4, 0, 0]);
  });

  test("clear:false never clears — frames stack (trails)", () => {
    const { canvas, calls } = fakeCanvas();
    const t = canvasTarget(canvas, { clear: false });
    t.setAttribute("d", "M0 0h1");
    t.setAttribute("d", "M0 0h2");
    expect(calls.filter((c) => c.fn === "clearRect").length).toBe(0);
    expect(calls.map((c) => c.fn)).toEqual([
      "setTransform",
      "stroke",
      "setTransform",
      "stroke",
    ]);
  });

  test("explicit color wins", () => {
    const { canvas, ctx } = fakeCanvas();
    canvasTarget(canvas, { color: "#f0f" }).setAttribute("d", "M0 0h4");
    expect(ctx.strokeStyle).toBe("#f0f");
  });

  test("no color + CSS-styled element: computed color, read lazily ONCE", () => {
    const savedGCS = G.getComputedStyle;
    let reads = 0;
    G.getComputedStyle = (): { color: string } => {
      reads++;
      return { color: "rgb(1, 2, 3)" };
    };
    try {
      const { canvas, ctx } = fakeCanvas(48, 48, { style: true });
      const t = canvasTarget(canvas);
      expect(reads).toBe(0); // lazy: nothing until the first frame
      t.setAttribute("d", "M0 0h1");
      t.setAttribute("d", "M0 0h2");
      expect(ctx.strokeStyle).toBe("rgb(1, 2, 3)");
      expect(reads).toBe(1);
    } finally {
      G.getComputedStyle = savedGCS;
    }
  });

  test("no color, no CSS (OffscreenCanvas/worker): the owner's strokeStyle is untouched", () => {
    const { canvas, ctx, calls } = fakeCanvas(); // no `style` — not an element
    canvasTarget(canvas).setAttribute("d", "M0 0h4");
    expect(ctx.strokeStyle).toBe("OWNER");
    expect(strokes(calls).length).toBe(1); // it still drew
  });

  test("stroke state per write: width 2 by default (grid units), round caps/joins", () => {
    const { canvas, ctx } = fakeCanvas();
    canvasTarget(canvas).setAttribute("d", "M0 0h4");
    expect(ctx.lineWidth).toBe(2);
    expect(ctx.lineCap).toBe("round");
    expect(ctx.lineJoin).toBe("round");
    const custom = fakeCanvas();
    canvasTarget(custom.canvas, { strokeWidth: 1.5 }).setAttribute("d", "M0 0h4");
    expect(custom.ctx.lineWidth).toBe(1.5);
  });

  test("onWrite fires after every drawn frame", () => {
    const order: string[] = [];
    const { canvas } = fakeCanvas();
    const t = canvasTarget(canvas, {
      onWrite: () => order.push("write"),
    });
    t.setAttribute("d", "M0 0h1");
    t.setAttribute("d", "M0 0h2");
    expect(order).toEqual(["write", "write"]);
  });
});

describe("createMorph over a canvas target", () => {
  test("paints the initial icon at rest (canonical d through Path2D)", () => {
    const { canvas, calls } = fakeCanvas();
    createMorph(canvasTarget(canvas), MENU);
    expect(lastD(calls)).toBe(canonicalD(MENU));
  });

  test("morphTo strokes every frame and snaps to the target at rest", () => {
    const { canvas, calls } = fakeCanvas();
    const m = createMorph(canvasTarget(canvas), MENU);
    m.morphTo(X, "snappy");
    let frames = 0;
    while (pending.size > 0 && frames < 2000) {
      now += 16;
      const cbs = [...pending.values()];
      pending.clear();
      for (const cb of cbs) cb(now);
      frames++;
    }
    expect(frames).toBeGreaterThan(1);
    const flown = strokes(calls) as string[];
    expect(flown.some((d) => d.includes("NaN"))).toBe(false);
    expect(flown.at(-1)).toBe(canonicalD(X));
    expect(m.progress).toBe(1);
    expect(pending.size).toBe(0); // scheduler idle — no leak
  });
});
