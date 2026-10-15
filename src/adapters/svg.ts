/* Input format adapter: SVG markup → the core's input contract (IconInput).
   Turns an Iconify body, a full `<svg>…</svg>` or a copy-pasted `<path>` into
   something the pipeline can lower — parsed, paint-resolved and re-gridded
   onto 24 via its viewBox, all inside the one call:

     import { svgToIcon } from "morphicons/adapters";
     const MENU = svgToIcon(menuBody); // parse ONCE, at module scope — reuse
     const X = svgToIcon(xBody);       // the reference so the plan cache holds

   Stroke icons come out exactly as before (centerlines, attrs verbatim).
   Fill-drawn icons (Material Symbols, Heroicons solid, Phosphor…) are
   accepted too: every element gets its inherited paint stamped on it
   (fill, stroke, stroke-width, fill-rule — from <svg>, <g> and `style`), so
   the region normalizer can rebuild the visible surface. Transforms are
   baked into the coordinates.

   Pure and DOM-free. Lives in the adapters entry so the core never pays for
   it (see README "Format adapters"); independent of every other adapter so
   `import { svgToIcon }` tree-shakes to just this module. */

import { fitIcon, iconToCubics } from "../core/normalize";
import { cubicsToPathD } from "../core/serialize";
import type { IconInput, IconNodeAttrs } from "../core/types";

// Non-rendered containers whose children must NOT be hoisted as geometry.
const SVG_CONTAINER = /<(defs|mask|clipPath|symbol)\b[^>]*>[\s\S]*?<\/\1>/gi;
const SVG_TAG = /<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
const SVG_ATTR = /([\w:-]+)\s*=\s*"([^"]*)"|([\w:-]+)\s*=\s*'([^']*)'/g;
const SVG_VIEWBOX = /<svg\b[^>]*\bviewBox\s*=\s*["']([^"']+)["']/i;
// Elements the pipeline can lower; wrappers that pass paint down; skipped.
const SVG_GEOMETRY = new Set([
  "path",
  "line",
  "circle",
  "ellipse",
  "rect",
  "polyline",
  "polygon",
]);
const SVG_GROUP = new Set(["svg", "g", "a"]);
// Containers appear here too: a PAIRED one was already stripped with its
// children by SVG_CONTAINER; a stray or self-closed `<defs/>` should be
// skipped, not rejected as an unsupported element.
const SVG_SKIP = new Set(["title", "desc", "defs", "mask", "clippath", "symbol"]);
// Paint that inherits down the tree and decides the visible surface
// (display only ever propagates its `none`, see svgToIcon).
const PAINT = [
  "fill",
  "stroke",
  "stroke-width",
  "fill-rule",
  "opacity",
  "fill-opacity",
  "visibility",
  "display",
];

type Mat = [number, number, number, number, number, number]; // a b c d e f

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

// Inherited paint of an element: parent's, then attributes, then `style`
// declarations (CSS wins over presentation attributes).
function paintOf(
  parent: Record<string, string>,
  attrs: IconNodeAttrs,
): Record<string, string> {
  const out = { ...parent };
  for (const k of PAINT) if (attrs[k] !== undefined) out[k] = String(attrs[k]);
  for (const decl of String(attrs.style ?? "").split(";")) {
    const i = decl.indexOf(":");
    const k = decl.slice(0, i).trim().toLowerCase();
    if (i > 0 && PAINT.includes(k)) out[k] = decl.slice(i + 1).trim();
  }
  return out;
}

const mul = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

// SVG transform list → one matrix (left to right, as the spec composes).
function parseTransform(v: unknown): Mat | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  let m: Mat = [1, 0, 0, 1, 0, 0];
  for (const [, fn, args] of s.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const a = args
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    const rad = ((a[0] ?? 0) * Math.PI) / 180;
    let t: Mat;
    switch (fn) {
      case "matrix":
        t = [a[0], a[1], a[2], a[3], a[4], a[5]];
        break;
      case "translate":
        t = [1, 0, 0, 1, a[0], a[1] ?? 0];
        break;
      case "scale":
        t = [a[0], 0, 0, a[1] ?? a[0], 0, 0];
        break;
      case "rotate": {
        const c = Math.cos(rad);
        const n = Math.sin(rad);
        const [cx = 0, cy = 0] = [a[1], a[2]];
        t = [c, n, -n, c, cx - c * cx + n * cy, cy - n * cx - c * cy];
        break;
      }
      case "skewX":
        t = [1, 0, Math.tan(rad), 1, 0, 0];
        break;
      case "skewY":
        t = [1, Math.tan(rad), 0, 1, 0, 0];
        break;
      default:
        throw new Error(`morphicons: unsupported transform "${fn}"`);
    }
    if (t.some((x) => !Number.isFinite(x)))
      throw new Error(`morphicons: invalid transform "${s}"`);
    m = mul(m, t);
  }
  return m;
}

// Element geometry → a `path` with the matrix baked into its coordinates.
function bake(tag: string, attrs: IconNodeAttrs, m: Mat): string {
  const paths = iconToCubics([[tag, attrs]]);
  for (const { pts } of paths) {
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i];
      const y = pts[i + 1];
      pts[i] = m[0] * x + m[2] * y + m[4];
      pts[i + 1] = m[1] * x + m[3] * y + m[5];
    }
  }
  return cubicsToPathD(paths);
}

// Comments go first, like a parser: to a fixpoint (a comment can leave a
// `<!--` behind), and an unterminated one runs to the end of the document.
function stripComments(markup: string): string {
  let out = markup;
  let prev: string;
  do {
    prev = out;
    out = out.replace(/<!--[\s\S]*?-->/g, "");
  } while (out !== prev);
  const open = out.indexOf("<!--");
  return open === -1 ? out : out.slice(0, open);
}

const painted = (v: string | undefined): boolean =>
  v !== undefined && v.trim().toLowerCase() !== "none";

interface Found {
  tag: string;
  attrs: IconNodeAttrs;
  paint: Record<string, string>;
  m: Mat | null;
}

/** SVG markup → an IconInput the pipeline can lower. Strips non-rendered
 *  containers, rejects what it can't read (an unsupported element, empty
 *  geometry) and re-grids onto 24 via the viewBox when one is present.
 *  Stroke icons return a `d` (when a viewBox forced a fit) or an IconNode,
 *  exactly as before; fill-drawn icons return an IconNode whose elements
 *  carry their resolved paint (fill/stroke/stroke-width/fill-rule), which
 *  is what makes the morph fly as a region. */
export function svgToIcon(markup: string): IconInput {
  if (markup.trimStart().charCodeAt(0) !== 60 /* "<" */)
    throw new Error(
      "morphicons: svgToIcon expects SVG markup — a d string or IconNode is already an IconInput",
    );
  const clean = stripComments(markup);
  // CSS paints by selector, which a scanner can't resolve: refuse instead of
  // guessing (an Illustrator "Internal CSS" export would read as filled).
  if (/<style\b/i.test(clean))
    throw new Error("morphicons: unsupported SVG element <style>");
  const body = clean.replace(SVG_CONTAINER, "");
  const found: Found[] = [];
  const stack: Array<{ paint: Record<string, string>; m: Mat | null }> = [
    { paint: {}, m: null },
  ];
  SVG_TAG.lastIndex = 0;
  let mt: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex drain.
  while ((mt = SVG_TAG.exec(body)) !== null) {
    const tag = mt[2].toLowerCase();
    const top = stack[stack.length - 1];
    if (mt[1]) {
      if (SVG_GROUP.has(tag) && stack.length > 1) stack.pop();
      continue;
    }
    if (SVG_SKIP.has(tag)) continue;
    const attrs = readSvgAttrs(mt[3]);
    const own = parseTransform(attrs.transform);
    const m = own ? (top.m ? mul(top.m, own) : own) : top.m;
    const paint = paintOf(top.paint, attrs);
    if (top.paint.display === "none") paint.display = "none"; // a hidden group hides all
    if (SVG_GROUP.has(tag)) {
      if (!mt[4]) stack.push({ paint, m });
      continue;
    }
    if (!SVG_GEOMETRY.has(tag))
      throw new Error(`morphicons: unsupported SVG element <${tag}>`);
    if (paint.display === "none" || /^(hidden|collapse)$/.test(paint.visibility ?? ""))
      continue; // not rendered
    found.push({ tag, attrs, paint, m });
  }
  if (found.length === 0) throw new Error("morphicons: no morphable geometry in SVG");

  // An element is filled when its (inherited) fill says so; with no fill
  // declared anywhere it is filled only if it isn't stroked — the SVG
  // default is a black fill, but a bare `stroke="currentColor"` path is a
  // stroke icon in every library that omits fill="none" on the element.
  const fills = found.map(({ paint }) =>
    paint.fill !== undefined ? painted(paint.fill) : !painted(paint.stroke),
  );
  const vb = SVG_VIEWBOX.exec(clean);

  if (!fills.some(Boolean)) {
    // Stroke icon: the historical output (attrs verbatim), transforms baked.
    const node: Array<readonly [string, IconNodeAttrs]> = found.map(
      ({ tag, attrs, m }) => {
        if (!m) return [tag, attrs] as const;
        // a path reads only `d`: the element's own geometry attrs go inert
        const { transform: _, ...rest } = attrs;
        return ["path", { ...rest, d: bake(tag, attrs, m) }] as const;
      },
    );
    return vb ? fitIcon(node, vb[1]) : node;
  }

  // Fill icon: one path per element, geometry baked + fitted, paint stamped.
  let scale = 1;
  if (vb) {
    const [, , w, h] = vb[1]
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    scale = Math.min(24 / w, 24 / h);
  }
  return found.map(({ tag, attrs, paint, m }, i) => {
    const d = m
      ? bake(tag, attrs, m)
      : tag === "path"
        ? String(attrs.d ?? "")
        : bake(tag, attrs, [1, 0, 0, 1, 0, 0]);
    const out: IconNodeAttrs = {
      d: vb ? fitIcon(d, vb[1]) : d,
      fill: fills[i] ? "currentColor" : "none",
      stroke: painted(paint.stroke) ? "currentColor" : "none",
    };
    if (painted(paint.stroke))
      out["stroke-width"] = String(
        Number.parseFloat(paint["stroke-width"] ?? "1") * scale,
      );
    if (paint["fill-rule"]) out["fill-rule"] = paint["fill-rule"];
    if (paint.opacity) out.opacity = paint.opacity;
    if (paint["fill-opacity"]) out["fill-opacity"] = paint["fill-opacity"];
    return ["path", out] as const;
  });
}
