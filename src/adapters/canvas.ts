/* Output format adapter: a 2D canvas → the driver's write contract (PathEl).
   The platform gift is `Path2D`: it parses `d` strings natively, so every
   frame is one `stroke(new Path2D(d))` and the adapter is pure state setup
   around that call. The icon stops being a document node and becomes pixels
   you own — a live texture for WebGL (`texImage2D(..., canvas)`), a sprite
   for `toBlob()`, a video track via `captureStream()`, a favicon, an
   OffscreenCanvas in a worker. Compose it with the plain driver:

     import { createMorph } from "morphicons/dom";
     import { canvasTarget } from "morphicons/adapters";
     const m = createMorph(canvasTarget(canvas), MENU);
     m.morphTo(X, "snappy");     // full Morph handle

   Accepts the canvas OR an existing 2D context (structural union): a canvas
   is asked for its "2d" context, a bare context is used as-is — which is what
   a worker or a host that already owns the context has in hand.

   Geometry: the target maps the icon grid onto whatever backing store it
   finds, per write — min-side scale, centered (the canvas equivalent of
   preserveAspectRatio="xMidYMid meet"), so non-square canvases letterbox and
   devicePixelRatio is absorbed by whatever size the OWNER gave the backing
   store. The clear pass runs on the whole device box in identity space: the
   spring overshoots the viewBox transiently, so clearing only the grid rect
   would leave residue in the letterbox bands.

   Color: `color` option > the canvas' computed CSS color (the moral
   equivalent of currentColor, read lazily once at the first frame — canvas
   has no currentColor of its own) > leave `strokeStyle` alone, which is the
   idiomatic canvas contract: where CSS can't reach (OffscreenCanvas,
   workers), whatever the context's owner set stands.

   Hosts that redraw their own frame every tick (Konva, Chart.js, games)
   should NOT hand their main context to a morph — the driver writes on its
   own rAF and the two clocks fight. Give the icon a small dedicated canvas
   and composite it (drawImage / Konva.Image / texture upload), using
   `onWrite` as the dirty signal. `clear: false` exists for the other camp:
   manual compositing and trails. */

import type { PathEl } from "../dom/index";

/* Ambient, structural platform surface — this module compiles without
   `lib: DOM` (same technique as src/adapters/mask.ts). `Path2D` exists in
   both window and worker scopes; `getComputedStyle` only in window, hence
   optional. Neither leaks into the exported types. */
declare class Path2D {
  constructor(d?: string);
}
declare const getComputedStyle: ((el: object) => { color: string }) | undefined;

/** The 2D context surface the target drives — structural, so a real
 *  CanvasRenderingContext2D, an OffscreenCanvasRenderingContext2D or a test
 *  fake all satisfy it. Only what canvasTarget actually touches. */
export interface Canvas2DContext {
  canvas: { width: number; height: number };
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  strokeStyle: string | object;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  stroke(path: object): void;
}

/** Anything that can hand out a 2D context (an HTMLCanvasElement, an
 *  OffscreenCanvas, or a fake in tests). */
export interface CanvasSurface {
  getContext(contextId: "2d"): Canvas2DContext | null;
}

export interface CanvasTargetOptions {
  /** Grid the icon's coordinates live on (Lucide/Iconify default: "0 0 24 24").
   *  Used to map the geometry onto the backing store. */
  viewBox?: string;
  /** Stroke width in grid units (Lucide's default is 2). */
  strokeWidth?: number;
  /** Stroke color. Defaults to the canvas' computed CSS color when it is a
   *  styled element; otherwise the context's current `strokeStyle` stands. */
  color?: string;
  /** Clear the canvas before each frame. Turn off for manual compositing or
   *  trails — every frame then draws on top of the last. Default true. */
  clear?: boolean;
  /** Called after every drawn frame — the texture consumer's dirty signal
   *  (e.g. re-upload the canvas with `texImage2D`, or blit it into a scene). */
  onWrite?: () => void;
}

/** Adapts a canvas (or its 2D context) into a `PathEl` whose writes stroke
 *  the morph's geometry onto the canvas, so
 *  `createMorph(canvasTarget(canvas), icon)` animates pixels instead of an
 *  inline `<svg><path>`. */
export function canvasTarget(
  surface: CanvasSurface | Canvas2DContext,
  opts: CanvasTargetOptions = {},
): PathEl {
  if (typeof Path2D === "undefined")
    throw new Error("morphicons: canvasTarget needs Path2D (browser or worker)");
  const ctx = "getContext" in surface ? surface.getContext("2d") : surface;
  if (!ctx) throw new Error("morphicons: canvasTarget needs a 2D context");
  const vb = (opts.viewBox ?? "0 0 24 24")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const [mx, my, vw, vh] = [vb[0] || 0, vb[1] || 0, vb[2] || 24, vb[3] || vb[2] || 24];
  const stroke = opts.strokeWidth ?? 2;
  const clear = opts.clear !== false;
  let color = opts.color;
  let cssPending = color === undefined && "style" in ctx.canvas;

  return {
    setAttribute(name: string, value: string): void {
      if (name !== "d") return;
      if (cssPending) {
        cssPending = false;
        color = getComputedStyle?.(ctx.canvas).color || undefined;
      }
      const c = ctx.canvas;
      const s = Math.min(c.width / vw, c.height / vh);
      if (clear) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, c.width, c.height);
      }
      ctx.setTransform(
        s,
        0,
        0,
        s,
        (c.width - vw * s) / 2 - mx * s,
        (c.height - vh * s) / 2 - my * s,
      );
      ctx.lineWidth = stroke;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (color !== undefined) ctx.strokeStyle = color;
      ctx.stroke(new Path2D(value));
      opts.onWrite?.();
    },
  };
}
