/* DOM driver: createMorph over a <path> element — the vanilla instance the
   bindings wrap. Writes the `d` attribute per frame and all instances share
   ONE rAF (singleton scheduler). Compiles without `lib: DOM` (repo rule):
   browser globals are declared ambient and resolved at runtime; nothing
   touches window at import time. */

import { allocOutputs, interpPolar } from "../core/interpolate";
import { iconToCubics, isSvgMarkup } from "../core/normalize";
import { buildPlan, type MorphPlan } from "../core/plan";
import { resampleIcon } from "../core/resample";
import { cubicsToPathD, serialize } from "../core/serialize";
import { SPRING_PRESETS, Spring, type SpringPreset } from "../core/spring";
import type { IconInput, IconNode, Sampled } from "../core/types";

declare function requestAnimationFrame(cb: (ts: number) => void): number;
declare function cancelAnimationFrame(id: number): void;
declare const matchMedia: ((query: string) => { matches: boolean }) | undefined;

/** The subset of an element's inline style the mask writer touches —
 *  structural so the driver still compiles without `lib: DOM` (a real
 *  HTMLElement's `.style` satisfies it). */
export interface MaskStyle {
  maskImage: string;
  webkitMaskImage: string;
  maskRepeat: string;
  webkitMaskRepeat: string;
  maskSize: string;
  webkitMaskSize: string;
  maskPosition: string;
  webkitMaskPosition: string;
  backgroundColor: string;
}

/** Target element, structurally typed: any object with setAttribute works
 *  (a real SVGPathElement, or a fake in tests). `createMorph` picks its write
 *  strategy from `tagName`: a `<path>` — or an object without a tagName (a
 *  test fake, the React Native shim) — gets the `d` attribute; any other
 *  element (a `<span>`/`<div>` styled the UnoCSS/Iconify way) is driven as a
 *  CSS `mask-image` and needs `style`. */
export interface PathEl {
  setAttribute(name: string, value: string): void;
  readonly tagName?: string;
  style?: MaskStyle;
}

/** Morph physics: named preset or custom spring. */
export interface MorphOptions {
  stiffness?: number;
  damping?: number;
}

/** Reduced-motion policy. `"never"` (default): morphs always animate,
 *  ignoring the OS setting. `"user"`: while the OS reduce-motion setting is
 *  on, `morphTo` degrades to an instant `set`. `"always"`: every `morphTo`
 *  jumps (tests, screenshots). */
export type ReducedMotionMode = "never" | "user" | "always";

export interface CreateMorphOptions {
  /** Reduced-motion policy; also live via the `reducedMotion` property. */
  reducedMotion?: ReducedMotionMode;
  /** Mask-driven targets only (a non-`<path>` element): stroke width of the
   *  rasterized mask SVG. Default 2 (Lucide). Ignored for `<path>` targets. */
  strokeWidth?: number;
}

export interface Morph {
  /** Animates toward the icon with spring physics. Interruptible: mid-flight
   *  it re-plans from the intermediate shape while preserving velocity. */
  morphTo(icon: IconInput, spring?: SpringPreset | MorphOptions): void;
  /** Jumps to the icon without animating (canonical d, no frames). */
  set(icon: IconInput): void;
  /** Renders the morph toward `icon` frozen at t (no spring) — the
   *  controlled-mode primitive: scrubbing, gestures, scroll. A later
   *  morphTo takes off from that intermediate shape. */
  seek(icon: IconInput, t: number): void;
  /** Current progress (t of the last frame; 1 at rest). Assigning it is
   *  equivalent to seek(target, t) on the active target. */
  progress: number;
  /** Reduced-motion policy, live: assigning it applies to the next morphTo. */
  reducedMotion: ReducedMotionMode;
  /** Unregisters the instance; later calls are no-ops. */
  destroy(): void;
}

// ---------------------------------------------------------------------------
// Singleton scheduler: a Set of tickers and a single live rAF while any
// exist. dt in seconds clamped to 0.1 (backgrounded tab); the first frame
// after starting receives dt = 0 (paints the current state, no jump).

type Ticker = (dt: number) => void;

const tickers = new Set<Ticker>();
let rafId = 0;
let last = -1;

function loop(ts: number): void {
  const dt = last < 0 ? 0 : Math.min(Math.max((ts - last) / 1000, 0), 0.1);
  last = ts;
  for (const tick of [...tickers]) tick(dt);
  if (tickers.size > 0) {
    rafId = requestAnimationFrame(loop);
  } else {
    rafId = 0;
    last = -1;
  }
}

function addTicker(tick: Ticker): void {
  tickers.add(tick);
  if (rafId === 0) {
    last = -1;
    rafId = requestAnimationFrame(loop);
  }
}

function removeTicker(tick: Ticker): void {
  tickers.delete(tick);
  if (tickers.size === 0 && rafId !== 0) {
    cancelAnimationFrame(rafId);
    rafId = 0;
    last = -1;
  }
}

// ---------------------------------------------------------------------------
// Caches by reference. Only IconNode is cacheable (WeakMap requires an
// object); strings are re-derived — plan() is sub-ms, retaining isn't worth it.

const samples = new WeakMap<IconNode, Sampled[]>();
const canon = new WeakMap<IconNode, string>();
const plans = new WeakMap<IconNode, WeakMap<IconNode, MorphPlan>>();

function sampledOf(icon: IconInput): Sampled[] {
  if (typeof icon === "string") return resampleIcon(icon);
  let s = samples.get(icon);
  if (!s) {
    s = resampleIcon(icon);
    samples.set(icon, s);
  }
  return s;
}

/** Canonical `d` of an icon: the input string verbatim, or the real cubics
 *  quantized to 4 decimals (the at-rest snap; engine-stable bytes so SSR
 *  hydration matches, see fmtCanon in core/serialize). Exported because it
 *  is what a binding renders at SSR/rest before any runtime exists. */
export function canonicalD(icon: IconInput): string {
  if (typeof icon === "string")
    return isSvgMarkup(icon) ? cubicsToPathD(iconToCubics(icon)) : icon;
  let d = canon.get(icon);
  if (!d) {
    d = cubicsToPathD(iconToCubics(icon));
    canon.set(icon, d);
  }
  return d;
}

// Rest→target plan, cached when both endpoints have stable identity.
// Plans from intermediate shapes (interruptions) are never cached.
function planBetween(src: IconInput, dst: IconInput): MorphPlan {
  if (typeof src === "string" || typeof dst === "string")
    return buildPlan(sampledOf(src), sampledOf(dst));
  let inner = plans.get(src);
  if (!inner) {
    inner = new WeakMap();
    plans.set(src, inner);
  }
  let p = inner.get(dst);
  if (!p) {
    p = buildPlan(sampledOf(src), sampledOf(dst));
    inner.set(dst, p);
  }
  return p;
}

function resolveSpring(s?: SpringPreset | MorphOptions): { k: number; c: number } {
  if (typeof s === "string") return SPRING_PRESETS[s];
  const d = SPRING_PRESETS.snappy;
  return { k: s?.stiffness ?? d.k, c: s?.damping ?? d.c };
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** The per-frame writer for `el`. A `<path>` — or an object without a tagName
 *  (a test fake, the RN shim) — receives the `d` attribute, the cheap path.
 *  Any other element is rendered as a CSS `mask-image` data URI (the
 *  UnoCSS/Iconify usage: no `<path>` in the DOM). The static mask props are
 *  set once on first paint; the geometry is always on the 24 grid (input is
 *  auto-fit), so the mask viewBox is fixed.
 *
 *  Cost: a fresh data URI each frame is re-parsed and re-rasterized by the
 *  browser and is not GPU-composited — fine for the odd toggle, not a long
 *  list. See README "Icon library compatibility". */
function makePaint(el: PathEl, strokeWidth: number): (d: string) => void {
  const tag = el.tagName?.toLowerCase();
  if (!tag || tag === "path") return (d) => el.setAttribute("d", d);
  const head =
    `<svg xmlns="${SVG_NS}" viewBox="0 0 24 24" fill="none" stroke="#000"` +
    ` stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">`;
  let init = false;
  return (d) => {
    const s = el.style;
    if (!s) return;
    if (!init) {
      init = true;
      s.maskRepeat = s.webkitMaskRepeat = "no-repeat";
      s.maskSize = s.webkitMaskSize = "100% 100%";
      s.maskPosition = s.webkitMaskPosition = "center";
      s.backgroundColor = "currentColor";
    }
    const url = `url("data:image/svg+xml,${encodeURIComponent(`${head}<path d="${d}"/></svg>`)}")`;
    s.maskImage = s.webkitMaskImage = url;
  };
}

// ---------------------------------------------------------------------------

/** Creates the morph instance over a `<path>` (or a CSS-mask element) and
 *  paints the initial icon. */
export function createMorph(
  el: PathEl,
  icon: IconInput,
  options?: CreateMorphOptions,
): Morph {
  const spring = new Spring();
  let reducedMotion: ReducedMotionMode = options?.reducedMotion ?? "never";
  const paint = makePaint(el, options?.strokeWidth ?? 2);
  let target = icon;
  let rest = true; // the element's d is target's canonical one
  let plan: MorphPlan | null = null;
  let out: Float64Array[] | null = null;
  let closed: boolean[] | null = null;
  let t = 1;
  let flying = false; // ticker registered (spring running)
  let dead = false;

  paint(canonicalD(icon));

  const render = (tt: number): void => {
    const p = plan;
    const o = out;
    const cl = closed;
    if (!p || !o || !cl) return;
    t = tt;
    interpPolar(p, tt, o);
    paint(serialize(o, cl));
  };

  const stop = (): void => {
    if (!flying) return;
    flying = false;
    removeTicker(tick);
  };

  const tick: Ticker = (dt) => {
    const settled = spring.step(dt);
    render(spring.x);
    if (settled) {
      stop();
      settle();
    }
  };

  const settle = (): void => {
    rest = true;
    plan = null;
    out = null;
    closed = null;
    t = 1;
    spring.x = 1;
    spring.v = 0;
    paint(canonicalD(target));
  };

  /** The current shape as plan source: the at-rest icon, or the rendered
   *  buffers (already N points per subpath). */
  const snapshot = (): Sampled[] => {
    const p = plan;
    const o = out;
    if (rest || !p || !o) return sampledOf(target);
    return o.map((buf, k) => ({
      pts: Float64Array.from(buf),
      closed: p.items[k].closed,
    }));
  };

  const retarget = (icon: IconInput): void => {
    plan = rest ? planBetween(target, icon) : buildPlan(snapshot(), sampledOf(icon));
    out = allocOutputs(plan);
    closed = plan.items.map((it) => it.closed);
    target = icon;
    rest = false;
  };

  const setNow = (icon: IconInput): void => {
    stop();
    target = icon;
    settle();
  };

  /** True when the policy says this morphTo must jump instead of flying. */
  const motionOff = (): boolean => {
    if (reducedMotion === "always") return true;
    if (reducedMotion !== "user") return false;
    if (typeof matchMedia === "undefined") return false;
    const mm = matchMedia;
    return mm?.("(prefers-reduced-motion: reduce)").matches ?? false;
  };

  const seek = (icon: IconInput, tt: number): void => {
    if (dead) return;
    const reuse = !rest && plan !== null && icon === target;
    stop();
    spring.v = 0; // controlled mode: no inherited velocity
    if (!reuse) retarget(icon);
    render(tt);
  };

  return {
    morphTo(icon, sp) {
      if (dead) return;
      if (icon === target && (rest || flying)) return; // already there / en route
      if (motionOff()) {
        setNow(icon);
        return;
      }
      const { k, c } = resolveSpring(sp);
      spring.config(k, c);
      retarget(icon);
      spring.start();
      if (!flying) {
        flying = true;
        addTicker(tick);
      }
    },
    set(icon) {
      if (dead) return;
      setNow(icon);
    },
    seek,
    get progress() {
      return rest ? 1 : t;
    },
    set progress(v: number) {
      if (!dead) seek(target, v);
    },
    get reducedMotion() {
      return reducedMotion;
    },
    set reducedMotion(v: ReducedMotionMode) {
      reducedMotion = v;
    },
    destroy() {
      stop();
      dead = true;
      plan = null;
      out = null;
      closed = null;
    },
  };
}
