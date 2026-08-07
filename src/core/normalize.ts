/* Normalization: any SVG primitive → cubic Bézier segments.
   Line → collinear controls at ⅓ and ⅔. Quadratic → exact degree elevation.
   Arc → center parametrization (SVG spec F.6), slices ≤ 90°, α = 4/3·tan(Δθ/4).
   circle/ellipse/rect/polyline/polygon → lines and quarter ellipses. */

import { parsePath, type RawSubpath } from "./parse";
import { cubicsToPathD } from "./serialize";
import type { CubicPath, IconInput, IconNodeAttrs } from "./types";

/** Control-point offset for a quarter circle: (4/3)·tan(π/8) ≈ 0.5523. */
export const KAPPA = (4 / 3) * Math.tan(Math.PI / 8);

const TAU = 2 * Math.PI;

/** Operations of a cubic accumulator, as a tuple — destructuring them yields
 *  local names the minifier can rename (a class method cannot be). */
type BuilderOps = readonly [
  cubic: (x1: number, y1: number, x2: number, y2: number, x: number, y: number) => void,
  line: (x: number, y: number) => void,
  quad: (x1: number, y1: number, x: number, y: number) => void,
  arc: (
    rx: number,
    ry: number,
    rotDeg: number,
    large: 0 | 1,
    sweep: 0 | 1,
    x: number,
    y: number,
  ) => void,
  finish: (closed: boolean) => CubicPath | null,
];

function builder(x0: number, y0: number): BuilderOps {
  const pts: number[] = [x0, y0];
  let cx = x0; // current point
  let cy = y0;

  const cubic = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x: number,
    y: number,
  ): void => {
    pts.push(x1, y1, x2, y2, x, y);
    cx = x;
    cy = y;
  };

  const line = (x: number, y: number): void => {
    if (Math.abs(x - cx) < 1e-12 && Math.abs(y - cy) < 1e-12) return; // degenerate
    cubic(
      cx + (x - cx) / 3,
      cy + (y - cy) / 3,
      cx + (2 * (x - cx)) / 3,
      cy + (2 * (y - cy)) / 3,
      x,
      y,
    );
  };

  const quad = (x1: number, y1: number, x: number, y: number): void => {
    cubic(
      cx + (2 / 3) * (x1 - cx),
      cy + (2 / 3) * (y1 - cy),
      x + (2 / 3) * (x1 - x),
      y + (2 / 3) * (y1 - y),
      x,
      y,
    );
  };

  // Elliptical arc → cubics. Endpoint → center per SVG spec, appendix F.6.
  const arc = (
    rx0: number,
    ry0: number,
    rotDeg: number,
    large: 0 | 1,
    sweep: 0 | 1,
    x: number,
    y: number,
  ): void => {
    const x1 = cx;
    const y1 = cy;
    if (Math.abs(x - x1) < 1e-12 && Math.abs(y - y1) < 1e-12) return; // F.6.2
    let rx = Math.abs(rx0);
    let ry = Math.abs(ry0);
    if (rx < 1e-12 || ry < 1e-12) {
      line(x, y); // F.6.6: zero radius → line
      return;
    }
    const phi = (rotDeg * Math.PI) / 180;
    const cosP = Math.cos(phi);
    const sinP = Math.sin(phi);
    const hx = (x1 - x) / 2;
    const hy = (y1 - y) / 2;
    const x1p = cosP * hx + sinP * hy;
    const y1p = -sinP * hx + cosP * hy;
    // F.6.6: scale up insufficient radii
    const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
    if (lam > 1) {
      const s = Math.sqrt(lam);
      rx *= s;
      ry *= s;
    }
    // F.6.5: center
    const rx2 = rx * rx;
    const ry2 = ry * ry;
    const xp2 = x1p * x1p;
    const yp2 = y1p * y1p;
    let rad = (rx2 * ry2 - rx2 * yp2 - ry2 * xp2) / (rx2 * yp2 + ry2 * xp2);
    if (rad < 0) rad = 0;
    const co = (large === sweep ? -1 : 1) * Math.sqrt(rad);
    const cxp = (co * rx * y1p) / ry;
    const cyp = (-co * ry * x1p) / rx;
    const ccx = cosP * cxp - sinP * cyp + (x1 + x) / 2;
    const ccy = sinP * cxp + cosP * cyp + (y1 + y) / 2;
    const th1 = Math.atan2((y1p - cyp) / ry, (x1p - cxp) / rx);
    let dth = Math.atan2((-y1p - cyp) / ry, (-x1p - cxp) / rx) - th1;
    if (sweep === 0 && dth > 0) dth -= TAU;
    else if (sweep === 1 && dth < 0) dth += TAU;
    // Slice into arcs ≤ 90°, each slice to a cubic with α = 4/3·tan(δ/4)
    const slices = Math.max(1, Math.ceil(Math.abs(dth) / (Math.PI / 2) - 1e-9));
    const delta = dth / slices;
    const alpha = (4 / 3) * Math.tan(delta / 4);
    const ex = (t: number) => ccx + rx * Math.cos(t) * cosP - ry * Math.sin(t) * sinP;
    const ey = (t: number) => ccy + rx * Math.cos(t) * sinP + ry * Math.sin(t) * cosP;
    const dx = (t: number) => -rx * Math.sin(t) * cosP - ry * Math.cos(t) * sinP;
    const dy = (t: number) => -rx * Math.sin(t) * sinP + ry * Math.cos(t) * cosP;
    let t0 = th1;
    let p0x = x1;
    let p0y = y1;
    for (let s = 1; s <= slices; s++) {
      const t1 = th1 + delta * s;
      const p1x = s === slices ? x : ex(t1); // exact final endpoint, no fp drift
      const p1y = s === slices ? y : ey(t1);
      cubic(
        p0x + alpha * dx(t0),
        p0y + alpha * dy(t0),
        p1x - alpha * dx(t1),
        p1y - alpha * dy(t1),
        p1x,
        p1y,
      );
      t0 = t1;
      p0x = p1x;
      p0y = p1y;
    }
  };

  const finish = (closed: boolean): CubicPath | null => {
    if (closed) line(pts[0], pts[1]); // explicit closing segment if needed
    if (pts.length < 8) return null; // no real segments
    return { pts: Float64Array.from(pts), closed };
  };

  return [cubic, line, quad, arc, finish];
}

function lowerSubpath(raw: RawSubpath): CubicPath | null {
  const [cubic, line, quad, arc, finish] = builder(raw.x0, raw.y0);
  for (const s of raw.segs) {
    switch (s[0]) {
      case "L":
        line(s[1], s[2]);
        break;
      case "C":
        cubic(s[1], s[2], s[3], s[4], s[5], s[6]);
        break;
      case "Q":
        quad(s[1], s[2], s[3], s[4]);
        break;
      case "A":
        arc(s[1], s[2], s[3], s[4], s[5], s[6], s[7]);
        break;
    }
  }
  return finish(raw.closed);
}

function attrNum(attrs: IconNodeAttrs, key: string, fallback = 0): number {
  const v = attrs[key];
  if (v === undefined) return fallback;
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function parsePoints(v: string | number | undefined): number[] {
  const s = String(v ?? "").trim();
  if (!s) return [];
  const nums = s.split(/[\s,]+/).map(Number);
  if (nums.some((x) => !Number.isFinite(x)))
    throw new Error(`morphicons: invalid points: "${s}"`);
  return nums;
}

function polyPath(nums: number[], closed: boolean): CubicPath | null {
  if (nums.length < 4) return null;
  const [, line, , , finish] = builder(nums[0], nums[1]);
  for (let i = 2; i + 1 < nums.length; i += 2) line(nums[i], nums[i + 1]);
  return finish(closed);
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number): CubicPath | null {
  if (rx < 1e-12 || ry < 1e-12) return null;
  const kx = KAPPA * rx;
  const ky = KAPPA * ry;
  const e = cx + rx; // east
  const w = cx - rx; // west
  const s = cy + ry; // south
  const n = cy - ry; // north
  const [cubic, , , , finish] = builder(e, cy);
  cubic(e, cy + ky, cx + kx, s, cx, s);
  cubic(cx - kx, s, w, cy + ky, w, cy);
  cubic(w, cy - ky, cx - kx, n, cx, n);
  cubic(cx + kx, n, e, cy - ky, e, cy);
  return finish(true);
}

function rectPath(attrs: IconNodeAttrs): CubicPath | null {
  const x = attrNum(attrs, "x");
  const y = attrNum(attrs, "y");
  const w = attrNum(attrs, "width");
  const h = attrNum(attrs, "height");
  if (w < 1e-12 || h < 1e-12) return null;
  // SVG rules: rx/ry copy each other when only one is given; clamp to half the side.
  let rx = attrNum(attrs, "rx", Number.NaN);
  let ry = attrNum(attrs, "ry", Number.NaN);
  if (Number.isNaN(rx)) rx = Number.isNaN(ry) ? 0 : ry;
  if (Number.isNaN(ry)) ry = rx;
  rx = Math.min(Math.max(rx, 0), w / 2);
  ry = Math.min(Math.max(ry, 0), h / 2);
  if (rx < 1e-12 || ry < 1e-12) {
    return polyPath([x, y, x + w, y, x + w, y + h, x, y + h], true);
  }
  // Coordinates of the straight↔arc joints of each rounded corner.
  const xa = x + rx;
  const xb = x + w - rx;
  const xr = x + w;
  const ya = y + ry;
  const yb = y + h - ry;
  const yd = y + h;
  const kx = KAPPA * rx;
  const ky = KAPPA * ry;
  const [cubic, line, , , finish] = builder(xa, y);
  line(xb, y);
  cubic(xb + kx, y, xr, ya - ky, xr, ya);
  line(xr, yb);
  cubic(xr, yb + ky, xb + kx, yd, xb, yd);
  line(xa, yd);
  cubic(xa - kx, yd, x, yb + ky, x, yb);
  line(x, ya);
  cubic(x, ya - ky, xa - kx, y, xa, y);
  return finish(true);
}

/** Icon (IconNode or `d` string) → list of cubic subpaths. */
export function iconToCubics(input: IconInput): CubicPath[] {
  const out: CubicPath[] = [];
  const push = (p: CubicPath | null) => {
    if (p) out.push(p);
  };
  if (typeof input === "string") {
    for (const s of parsePath(input)) push(lowerSubpath(s));
    return out;
  }
  for (const [tag, attrs] of input) {
    switch (tag) {
      case "path":
        for (const s of parsePath(String(attrs.d ?? ""))) push(lowerSubpath(s));
        break;
      case "line": {
        const [, line, , , finish] = builder(attrNum(attrs, "x1"), attrNum(attrs, "y1"));
        line(attrNum(attrs, "x2"), attrNum(attrs, "y2"));
        push(finish(false));
        break;
      }
      case "circle": {
        const r = attrNum(attrs, "r");
        push(ellipsePath(attrNum(attrs, "cx"), attrNum(attrs, "cy"), r, r));
        break;
      }
      case "ellipse":
        push(
          ellipsePath(
            attrNum(attrs, "cx"),
            attrNum(attrs, "cy"),
            attrNum(attrs, "rx"),
            attrNum(attrs, "ry"),
          ),
        );
        break;
      case "rect":
        push(rectPath(attrs));
        break;
      case "polyline":
        push(polyPath(parsePoints(attrs.points), false));
        break;
      case "polygon":
        push(polyPath(parsePoints(attrs.points), true));
        break;
      default:
        throw new Error(`morphicons: unsupported tag <${tag}>`);
    }
  }
  return out;
}

/** A source viewBox: `24`, `"0 0 20 20"` or `[minX, minY, w, h]`. */
export type ViewBox = number | string | readonly [number, number, number, number];

function parseViewBox(vb: ViewBox): [number, number, number, number] {
  const v =
    typeof vb === "number"
      ? [0, 0, vb, vb]
      : typeof vb === "string"
        ? vb
            .trim()
            .split(/[\s,]+/)
            .map(Number)
        : vb;
  const [minX, minY, w, h] = v as number[];
  if (
    v.length !== 4 ||
    !(w > 0) ||
    !(h > 0) ||
    !Number.isFinite(minX) ||
    !Number.isFinite(minY)
  )
    throw new Error(`morphicons: invalid viewBox "${String(vb)}"`);
  return [minX, minY, w, h];
}

/** Re-grids an icon drawn on `viewBox` onto the shared `grid` (24 by default),
 *  centred and preserving aspect ratio — the SVG `xMidYMid meet` rule.
 *
 *  Both endpoints of a morph must live on the same coordinate space. Lucide and
 *  Tabler already draw on 24×24; packs on 20 (Heroicons solid) or 32 (Carbon)
 *  do not, and mixing them unfitted makes Procrustes read the scale/offset gap
 *  as rotation. Apply once at module scope (not per render) and pass the
 *  resulting `d` anywhere an icon is accepted. */
export function fitIcon(input: IconInput, viewBox: ViewBox, grid = 24): string {
  const [minX, minY, w, h] = parseViewBox(viewBox);
  const s = Math.min(grid / w, grid / h);
  const tx = (grid - w * s) / 2 - minX * s;
  const ty = (grid - h * s) / 2 - minY * s;
  const paths = iconToCubics(input);
  for (const { pts } of paths) {
    for (let i = 0; i < pts.length; i += 2) {
      pts[i] = pts[i] * s + tx;
      pts[i + 1] = pts[i + 1] * s + ty;
    }
  }
  return cubicsToPathD(paths);
}
