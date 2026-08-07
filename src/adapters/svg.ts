/* Input format adapter: SVG markup → the core's input contract (IconInput).
   Turns an Iconify body, a full `<svg>…</svg>` or a copy-pasted `<path>` into
   something the pipeline can lower — parsed, scanned for morphability and
   re-gridded onto 24 via its viewBox, all inside the one call:

     import { svgToIcon } from "morphicons/adapters";
     const MENU = svgToIcon(menuBody); // parse ONCE, at module scope — reuse
     const X = svgToIcon(xBody);       // the reference so the plan cache holds

   Pure and DOM-free. Lives in the adapters entry so the core never pays for
   it (see README "Format adapters"); independent of every other adapter so
   `import { svgToIcon }` tree-shakes to just this module. */

import { fitIcon } from "../core/normalize";
import type { IconInput, IconNodeAttrs } from "../core/types";

// Non-rendered containers whose children must NOT be hoisted as geometry.
const SVG_CONTAINER = /<(defs|mask|clipPath|symbol)\b[^>]*>[\s\S]*?<\/\1>/gi;
const SVG_ELEMENT = /<([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)\/?>/g;
const SVG_ATTR = /([\w:-]+)\s*=\s*"([^"]*)"|([\w:-]+)\s*=\s*'([^']*)'/g;
const SVG_VIEWBOX = /<svg\b[^>]*\bviewBox\s*=\s*["']([^"']+)["']/i;
// Elements the pipeline can lower; wrappers to skip; everything else throws.
const SVG_GEOMETRY = new Set([
  "path",
  "line",
  "circle",
  "ellipse",
  "rect",
  "polyline",
  "polygon",
]);
// Containers appear here too: a PAIRED one was already stripped with its
// children by SVG_CONTAINER; a stray or self-closed `<defs/>` should be
// skipped, not rejected as an unsupported element.
const SVG_SKIP = new Set([
  "svg",
  "g",
  "title",
  "desc",
  "defs",
  "mask",
  "clippath",
  "symbol",
]);

function readSvgAttrs(raw: string): IconNodeAttrs {
  const attrs: IconNodeAttrs = {};
  SVG_ATTR.lastIndex = 0;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex drain.
  while ((m = SVG_ATTR.exec(raw)) !== null) {
    const name = m[1] ?? m[3];
    if (name) attrs[name] = m[2] ?? m[4] ?? "";
  }
  return attrs;
}

/** SVG markup → an IconInput the pipeline can lower. Strips non-rendered
 *  containers, rejects what can't be honestly morphed (a fill-drawn icon with
 *  no stroke, a transform, an unsupported element), and re-grids onto 24 via
 *  the viewBox when one is present — so an off-grid collection lands on the
 *  shared grid automatically. Returns a `d` (when a viewBox forced a fit) or
 *  an IconNode. */
export function svgToIcon(markup: string): IconInput {
  if (markup.trimStart().charCodeAt(0) !== 60 /* "<" */)
    throw new Error(
      "morphicons: svgToIcon expects SVG markup — a d string or IconNode is already an IconInput",
    );
  const body = markup.replace(SVG_CONTAINER, "");
  // morphicons morphs stroke centerlines only. A stroke icon declares a stroke
  // (Lucide: stroke="currentColor") or fill="none"; a fill-drawn icon
  // (Material Symbols) declares neither → its silhouette can't read as a stroke.
  const hasStroke = /stroke\s*=\s*["'](?!\s*none\s*["'])/i.test(body);
  const fillNone = /fill\s*=\s*["']\s*none\s*["']/i.test(body);
  if (!hasStroke && !fillNone)
    throw new Error(
      "morphicons: SVG looks fill-drawn (no stroke) — only stroke-centerline icons morph",
    );
  const node: Array<readonly [string, IconNodeAttrs]> = [];
  SVG_ELEMENT.lastIndex = 0;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex drain.
  while ((m = SVG_ELEMENT.exec(body)) !== null) {
    const tag = m[1].toLowerCase();
    if (SVG_SKIP.has(tag)) continue;
    if (!SVG_GEOMETRY.has(tag))
      throw new Error(`morphicons: unsupported SVG element <${tag}>`);
    const attrs = readSvgAttrs(m[2]);
    if ("transform" in attrs)
      throw new Error(`morphicons: <${tag}> has a transform (unsupported)`);
    node.push([tag, attrs]);
  }
  if (node.length === 0) throw new Error("morphicons: no morphable geometry in SVG");
  const vb = SVG_VIEWBOX.exec(markup);
  return vb ? fitIcon(node, vb[1]) : node;
}
