/* Output format adapter: a CSS-mask element → the driver's write contract
   (PathEl). The shape UnoCSS `presetIcons` / Iconify render (`i-lucide-*`,
   `icon-[lucide-x]`, …) is a `<span>`/`<div>` whose icon is a `mask-image`
   data URI — no `<path>` in the DOM. `maskTarget` creates a hidden inline
   `<svg>` with a PAIR of `<mask><path>` buffers, points the element's mask at
   them, and returns a PathEl whose `d` writes land on real SVG geometry
   (flipping buffers per write — see the function doc for why). The same
   "shim, not a port" trick as the React Native binding. Compose it with the
   plain driver:

     import { createMorph } from "morphicons/dom";
     import { maskTarget } from "morphicons/adapters";
     const target = maskTarget(spanEl);    // spanEl: class="size-5"
     const m = createMorph(target, MENU);
     m.morphTo(X, "snappy");               // full Morph handle
     // on unmount: m.destroy(); target.dispose();

   Why not a data-URI mask per frame: CSS image loads — data URIs included —
   are asynchronous in Chromium. Swapping the URI every frame replaces the
   image before it ever decodes, so the element renders BLANK for the whole
   flight and the icon pops in only at rest (verified by eye; the endpoints
   always looked fine because at rest the last URI gets time to decode). A
   referenced mask has no image load in the loop at all, and also skips the
   per-frame XML parse and URI allocation.

   Cost: still cheaper than it sounds but not free — the browser re-rasterizes
   the mask and repaints the masked element every frame (main thread, no
   compositor-only path). Fine for toggles and short lists; an inline-SVG
   binding remains the leanest option for icon-heavy views. See README
   "Format adapters". */

import type { PathEl } from "../dom/index";

/* Ambient, structural DOM surface — this module compiles without `lib: DOM`
   (same technique as src/dom). Only what maskTarget actually touches. */
interface MaskSvgNode {
  setAttribute(name: string, value: string): void;
  appendChild(child: MaskSvgNode): void;
  remove(): void;
}
declare const document:
  | {
      createElementNS(ns: string, tag: string): MaskSvgNode;
      body: { appendChild(child: MaskSvgNode): void };
    }
  | undefined;

/** The subset of an element's inline style the mask target writes — structural
 *  so a real HTMLElement's `.style` satisfies it (and a test fake supplies
 *  just these). */
export interface MaskStyle {
  maskImage: string;
  webkitMaskImage: string;
  backgroundColor: string;
}

/** An element the mask target can drive (an HTMLElement, or a fake in tests). */
export interface MaskEl {
  style: MaskStyle;
}

export interface MaskTargetOptions {
  /** Stroke width of the mask geometry (Lucide's default is 2). */
  strokeWidth?: number;
  /** Grid the icon's coordinates live on (Lucide/Iconify default: "0 0 24 24").
   *  Used to map the geometry onto the element's box. */
  viewBox?: string;
  /** Set `background-color: currentColor` on first setup so the element shows
   *  through the mask in the current text color, standalone (no icon class).
   *  Turn off to keep an existing paint (e.g. a `bg-*` utility). Default true. */
  paint?: boolean;
}

/** What `maskTarget` returns: the driver's write contract plus a `dispose`
 *  that removes the hidden mask node (call it after `morph.destroy()` when
 *  the element unmounts). */
export interface MaskPathEl extends PathEl {
  dispose(): void;
}

const SVG_NS = "http://www.w3.org/2000/svg";

let seq = 0;
let host: MaskSvgNode | null = null;

/** Adapts an element into a `PathEl` whose writes drive a referenced SVG
 *  mask, so `createMorph(maskTarget(el), icon)` animates a mask-styled
 *  element instead of an inline `<svg><path>`.
 *
 *  DOUBLE BUFFER, on purpose: WebKit does not reliably repaint a masked
 *  element when the CONTENT of its referenced `<mask>` mutates — a lone mask
 *  whose inner path `d` changes per frame renders frozen in Safari until the
 *  flight ends. So the target keeps TWO masks and every `d` write lands on
 *  the back buffer and re-points `mask-image` at it: the property VALUE flips
 *  (`url(#a)` ↔ `url(#b)`) each frame, which forces reference re-resolution
 *  in every engine. Chromium/Gecko pay nothing extra for it. */
export function maskTarget(el: MaskEl, opts: MaskTargetOptions = {}): MaskPathEl {
  if (typeof document === "undefined")
    throw new Error("morphicons: maskTarget needs a DOM (client-side only)");
  const doc = document;
  if (!host) {
    host = doc.createElementNS(SVG_NS, "svg");
    host.setAttribute("width", "0");
    host.setAttribute("height", "0");
    host.setAttribute("aria-hidden", "true");
    host.setAttribute("style", "position:absolute");
    doc.body.appendChild(host);
  }
  // Map the icon grid onto the element box: objectBoundingBox is 0..1, so
  // translate the viewBox origin away and scale by 1/size.
  const vb = (opts.viewBox ?? "0 0 24 24")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const [mx, my, w, h] = [vb[0] || 0, vb[1] || 0, vb[2] || 24, vb[3] || vb[2] || 24];

  const makeLayer = (): { url: string; mask: MaskSvgNode; path: MaskSvgNode } => {
    const id = `morphicons-mask-${++seq}`;
    const mask = doc.createElementNS(SVG_NS, "mask");
    mask.setAttribute("id", id);
    mask.setAttribute("maskContentUnits", "objectBoundingBox");
    const g = doc.createElementNS(SVG_NS, "g");
    g.setAttribute("transform", `scale(${1 / w} ${1 / h}) translate(${-mx} ${-my})`);
    const path = doc.createElementNS(SVG_NS, "path");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#fff");
    path.setAttribute("stroke-width", String(opts.strokeWidth ?? 2));
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    g.appendChild(path);
    mask.appendChild(g);
    if (host) host.appendChild(mask);
    return { url: `url(#${id})`, mask, path };
  };

  const layers = [makeLayer(), makeLayer()];
  let front = 0;
  const s = el.style;
  s.maskImage = s.webkitMaskImage = layers[0].url;
  if (opts.paint !== false) s.backgroundColor = "currentColor";

  return {
    setAttribute(name, d): void {
      if (name !== "d") return;
      front = 1 - front;
      const layer = layers[front];
      layer.path.setAttribute("d", d);
      s.maskImage = s.webkitMaskImage = layer.url;
    },
    dispose(): void {
      layers[0].mask.remove();
      layers[1].mask.remove();
    },
  };
}
