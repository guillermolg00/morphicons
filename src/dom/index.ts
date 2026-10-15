/* DOM driver: createMorph over a <path> element — the vanilla instance the
   bindings wrap. Writes the `d` attribute per frame and all instances share
   ONE rAF (singleton scheduler). Compiles without `lib: DOM` (repo rule):
   browser globals are declared ambient and resolved at runtime; nothing
   touches window at import time. */

import { allocOutputs, interpPolar } from "../core/interpolate";
import { iconToCubics } from "../core/normalize";
import {
  buildPlan,
  centroid,
  type MorphPlan,
  type PlanItem,
  reversePts,
} from "../core/plan";
import { inside, type Paint, painted, paintOf, signedArea, solid } from "../core/region";
import { resampleIcon, resamplePath } from "../core/resample";
import { cubicsToPathD, serialize } from "../core/serialize";
import { SPRING_PRESETS, Spring, type SpringPreset } from "../core/spring";
import type { CubicPath, IconInput, IconNode, Sampled } from "../core/types";

declare function requestAnimationFrame(cb: (ts: number) => void): number;
declare function cancelAnimationFrame(id: number): void;
declare function setTimeout(cb: () => void, ms: number): unknown;
declare function clearTimeout(id: unknown): void;
declare const matchMedia: ((query: string) => { matches: boolean }) | undefined;
declare const requestIdleCallback:
  | ((cb: () => void, o: { timeout: number }) => void)
  | undefined;
declare const navigator: { connection?: { saveData?: boolean } } | undefined;
interface ScriptEl {
  type: string;
  src: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  remove(): void;
}
declare const document:
  | { createElement(tag: "script"): ScriptEl; head: { append(el: ScriptEl): void } }
  | undefined;

/** Target element, structurally typed: any object with setAttribute works
 *  (a real SVGPathElement, or a fake in tests). */
export interface PathEl {
  setAttribute(name: string, value: string): void;
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
  /** Stroke width the element draws with (24-unit grid). Only used to
   *  outline stroke icons when they morph with a fill icon, so the region
   *  in flight matches the stroke at rest. Default 2; live via the
   *  `strokeWidth` property. */
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
  /** Stroke width used to outline stroke icons in stroke↔fill morphs. */
  strokeWidth: number;
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

// The cubics of an icon. A fill icon's are wound so that ONE path under
// nonzero paints every element its own way: each evenodd element's
// subpaths by nesting depth (outers +, holes −), each nonzero element
// turned positive as a whole. Overlapping elements then add up (evenodd
// would cut one out of the other) and translucent layers stay out.
function cubicsOf(icon: IconInput): CubicPath[] {
  if (typeof icon === "string" || paintOf(icon) === "stroke") return iconToCubics(icon);
  return (solid(icon) as IconNode).flatMap((el) => {
    const ps = iconToCubics([el]);
    const odd = String(el[1]["fill-rule"]).trim() === "evenodd";
    let sum = 0;
    for (const p of ps) sum += signedArea(p.pts);
    for (const p of ps) {
      let flip = sum < 0;
      if (odd) {
        let pos = true;
        for (const o of ps) if (o !== p && inside(p.pts[0], p.pts[1], o.pts)) pos = !pos;
        flip = signedArea(p.pts) > 0 !== pos;
      }
      if (flip) p.pts = reversePts(p.pts);
    }
    return ps;
  });
}

function sampledOf(icon: IconInput): Sampled[] {
  if (typeof icon === "string") return resampleIcon(icon);
  let s = samples.get(icon);
  if (!s) {
    s = cubicsOf(icon).map((p) => ({ pts: resamplePath(p, 64), closed: p.closed }));
    samples.set(icon, s);
  }
  return s;
}

/** Canonical `d` of an icon: the input string verbatim, or the real cubics
 *  quantized to 4 decimals (the at-rest snap; engine-stable bytes so SSR
 *  hydration matches, see fmtCanon in core/serialize). Exported because it
 *  is what a binding renders at SSR/rest before any runtime exists. A fill
 *  icon's translucent duotone layer is left out (one path can't paint it). */
export function canonicalD(icon: IconInput): string {
  if (typeof icon === "string") return icon;
  let d = canon.get(icon);
  if (!d) {
    d = cubicsToPathD(cubicsOf(icon));
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

// ---------------------------------------------------------------------------
// Regions (any pair with a fill icon). The normalizer is a separate chunk,
// loaded on first need: stroke-only apps never download it. Loads are
// shared, failures are not cached (the next need retries), and an app can
// swap the loader (static import, CDN, no code splitting) once at startup.

type RegionModule = typeof import("../region/index");
let regionMod: RegionModule | null = null;
let regionLoading: Promise<RegionModule> | null = null;
let regionSince = 0; // when the load in flight started
let regionFailed = false; // last attempt failed: prefetches wait for a need
// Chunk URL of a failed import(). Chromium ≤155 and Safari 26.2–27 keep
// that import failed for the document's life, so a retry that fails again
// re-runs the chunk under a fresh URL.
let regionUrl: string | undefined;
let regionGen = 0; // bumped by setRegionLoader: a load from an older loader is ignored
let regionLoader: () => Promise<RegionModule> = () => import("../region/index");

/** Replaces how the region normalizer is loaded (default: dynamic import of
 *  the bundled chunk). E.g. `setRegionLoader(async () => region)` after a
 *  static `import * as region from "morphicons/region"` to never touch the
 *  network mid-interaction. The next need loads through the new loader. */
export function setRegionLoader(loader: () => Promise<RegionModule>): void {
  regionLoader = loader;
  regionGen++;
  regionLoading = null;
  regionMod = null;
  regionFailed = false;
  regionUrl = undefined;
}

// The chunk as a module script under a fresh module-map key; it registers
// itself on this key (src/region/index.ts). A fragment is enough (verified
// on Chromium 152) and the server sees the same URL: CDN cache and signed
// URLs intact. Under a CSP or Trusted Types policy that blocks it, it
// fails like the import did (a throw in the executor rejects).
const reload = (url: string): Promise<RegionModule> =>
  new Promise((ok, ko) => {
    const s = (document as NonNullable<typeof document>).createElement("script");
    s.type = "module";
    s.onload = s.onerror = () => {
      s.remove();
      const m = (globalThis as Record<symbol, RegionModule | undefined>)[
        Symbol.for("morphicons.region")
      ];
      m ? ok(m) : ko(new Error(url));
    };
    s.src = `${url}#${Date.now()}`;
    (document as NonNullable<typeof document>).head.append(s);
  });

const fromSource = (): string | undefined => {
  const spec = /import\(\s*["'`]([^"'`]+)/.exec(String(regionLoader))?.[1];
  const here = /\w+:\/\/[^\s)]+?(?=:\d+:\d+)/.exec(String(new Error().stack))?.[0];
  try {
    return spec && new URL(spec, here).href;
  } catch {
    // relative, and no URL in the stack
  }
};

/** Starts (or joins) loading the region normalizer. Call it early — on
 *  idle, on hover — to keep the first stroke↔fill morph off the network. */
export function preloadRegion(): Promise<RegionModule> {
  if (regionMod) return Promise.resolve(regionMod);
  if (!regionLoading) {
    regionSince = Date.now();
    const url = regionUrl;
    const gen = regionGen;
    // a plain import() first: browsers that don't cache the failure fetch
    // again (Safari ≤26.1, Firefox 155+, Chrome 156+, webpack's loader)
    regionLoading = regionLoader()
      .catch((e: unknown) => (url ? reload(url) : Promise.reject(e)))
      .then(
        (m) => {
          if (gen === regionGen) regionMod = m;
          return m;
        },
        (e: unknown) => {
          if (gen !== regionGen) throw e;
          regionLoading = null; // not cached: a later need retries
          regionFailed = true;
          // Chromium/Firefox name the URL. Safari doesn't: it is read off the
          // loader's source (the bundler's chunk path), resolved against this
          // file's URL (a stack frame). No match (webpack): plain retries.
          regionUrl ??=
            /dynamically imported module:?\s*(\S+)/i.exec(
              String((e as Error | undefined)?.message),
            )?.[1] ?? fromSource();
          throw e;
        },
      );
  }
  return regionLoading;
}

// Prefetch when a fill icon mounts: on idle, off the critical path, and not
// at all under Save-Data (never settles: the first morph loads it). After a
// failure it waits for the next morph that NEEDS the chunk: a fallback
// caused by the failure must not fire a second request in the same instant.
const quietPreload = (): Promise<unknown> =>
  new Promise((ok, ko) => {
    if (typeof navigator === "undefined" ? false : navigator.connection?.saveData) return;
    const go = (): void => {
      regionFailed ? ko() : preloadRegion().then(ok, ko);
    };
    typeof requestIdleCallback === "function"
      ? requestIdleCallback(go, { timeout: 2000 })
      : setTimeout(go, 200);
  });

/** How long a morph waits for the region chunk before flying the fallback
 *  (RAIL's 100 ms response budget). A slow, failed or hanging load never
 *  leaves the icon stuck on the old shape; the load goes on in the
 *  background and the next morph flies. A load already older than the
 *  budget isn't waited for again. */
const REGION_WAIT_MS = 100;

// What the element paints: an icon's paint, or both (see restLook).
type Look = Paint | "both";

// Paint attributes per look: a stroke icon inherits the <svg>'s stroke.
// Fills are nonzero, always (cubicsOf winds the evenodd elements for it).
const paintAttrs = (p: Look): Record<string, string> =>
  p === "stroke"
    ? { fill: "none", stroke: "inherit" }
    : {
        fill: "currentColor",
        stroke: p === "fill" ? "none" : "inherit",
        "fill-rule": "nonzero",
      };

const looks = new WeakMap<IconNode, Look>();

// The look a fill icon rests on before the chunk is around: one path can't
// paint each element its own way. Filled elements only: fill. Filled AND
// stroked ones (Iconoir solid): both, the stroke fattens the fill. A
// stroke-only element: stroke (a line icon with filled dots: their outline
// covers them, and `both` would fill the rings), unless it encloses at most
// ~the filled area (an arrow on a filled envelope, an outline drawn over
// its own fill): both. 2,010 Iconify fill icons: bench/region-report.md.
function restLook(icon: IconInput): Look {
  if (typeof icon === "string" || paintOf(icon) === "stroke") return "stroke";
  let look = looks.get(icon);
  if (look) return look;
  let filled = 0;
  let enclosed = -1; // area inside stroke-only elements; −1: there are none
  look = "fill";
  for (const el of solid(icon) as IconNode) {
    const s = painted(el[1].stroke);
    const f = painted(el[1].fill) || (el[1].fill === undefined && !s);
    if (s) look = "both";
    let a = 0;
    for (const p of iconToCubics([el])) a += Math.abs(signedArea(p.pts));
    if (f) filled += a;
    else if (s) enclosed = Math.max(enclosed, 0) + a;
  }
  if (enclosed > 1.5 * filled) look = "stroke";
  looks.set(icon, look);
  return look;
}

/** The paint attributes a binding renders on the `<path>` with its first
 *  icon (SSR included), so a fill icon is filled before any script runs.
 *  None for a stroke icon: it inherits the `<svg>`'s stroke as always. */
export function restAttrs(icon?: IconInput): Record<string, string> | undefined {
  if (icon === undefined || paintOf(icon) === "stroke") return undefined;
  return paintAttrs(restLook(icon));
}

// The fallback flight when the region chunk isn't there: the old shape
// shrinks into its centroid on the first half, the new one grows out of its
// own on the second (items carry `half`, see core/interpolate). Only `d`
// and paint change, so every write contract draws it.
function popPlan(from: Sampled[], to: Sampled[]): MorphPlan {
  const n = 64; // sampledOf
  const item = ({ pts, closed }: Sampled, half: 0 | 1) => {
    // (a region flight may carry 128 points, see region/plan: every other)
    if (pts.length > 2 * n) pts = pts.filter((_, i) => i % 4 < 2);
    const c = centroid(pts);
    const p = pts.map((v, i) => v - c[i & 1]);
    const z = new Float64Array(2 * n);
    // (a / bO / res: unused by interpPolar)
    return {
      aC: half ? z : p,
      bT: half ? p : z,
      ca: c,
      cb: c,
      theta: 0,
      lnSigma: 0,
      closed,
      half,
      block: null,
    } as unknown as PlanItem;
  };
  return { n, items: [...from.map((s) => item(s, 0)), ...to.map((s) => item(s, 1))] };
}

function resolveSpring(s?: SpringPreset | MorphOptions): { k: number; c: number } {
  if (typeof s === "string") return SPRING_PRESETS[s];
  const d = SPRING_PRESETS.snappy;
  return { k: s?.stiffness ?? d.k, c: s?.damping ?? d.c };
}

// ---------------------------------------------------------------------------

/** Creates the morph instance over a `<path>` and paints the initial icon. */
export function createMorph(
  el: PathEl,
  icon: IconInput,
  options?: CreateMorphOptions,
): Morph {
  const spring = new Spring();
  let reducedMotion: ReducedMotionMode = options?.reducedMotion ?? "never";
  let strokeWidth = options?.strokeWidth ?? 2;
  let target = icon;
  let rest = true; // the element's d is target's canonical one
  let plan: MorphPlan | null = null;
  let out: Float64Array[] | null = null;
  let closed: boolean[] | null = null;
  let t = 1;
  let flying = false; // ticker registered (spring running)
  let dead = false;
  let regionFlight = false; // the active plan is a region plan
  let drawn = false; // the active plan's buffers hold a rendered frame
  let pending: object | null = null; // latest request waiting for the chunk
  let paint: Look = "stroke"; // what the element paints (markup default)
  // Fallback flight (popPlan): items [0, split) are the old shape, painted
  // `popFrom` on the first half; the rest the new one, painted as it rests.
  let split = 0;
  let popFrom: Look = "stroke";
  let popBase: IconInput | null = null; // the at-rest icon a fallback took off from

  // Paint attributes are written only on change, and never for stroke-only
  // use: the element keeps inheriting the <svg>'s stroke as it always did.
  const paintAs = (p: Look): void => {
    if (p === paint) return;
    for (const [k, v] of Object.entries(paintAttrs(p))) el.setAttribute(k, v);
    paint = p;
  };

  // The at-rest `d` + paint of an icon. A fill icon rests on its region
  // once the normalizer is around (exact union of its elements), else on
  // its own canonical d in the closest single look (restLook).
  const paintRest = (ic: IconInput): void => {
    const r =
      regionMod && paintOf(ic) === "fill" ? regionMod.regionOf(ic, strokeWidth) : ic;
    el.setAttribute("d", canonicalD(r));
    paintAs(restLook(r));
  };

  // A fill icon resting before the chunk: its exact region once `load`
  // brings the chunk, if it still rests on that icon.
  const upgrade = (load: Promise<unknown>): void => {
    const icon = target;
    load.then(
      () => {
        if (!dead && rest && target === icon && pending === null) paintRest(icon);
      },
      () => {},
    );
  };

  paintRest(icon);
  if (paintOf(icon) === "fill" && !regionMod) upgrade(quietPreload());

  // The slice of the plan on screen: all of it, or one side of a fallback.
  const shown = (tt: number): [number, number] =>
    !split
      ? [0, plan?.items.length ?? 0]
      : tt < 0.5
        ? [0, split]
        : [split, plan?.items.length ?? 0];

  const render = (tt: number): void => {
    const p = plan;
    const o = out;
    const cl = closed;
    if (!p || !o || !cl) return;
    t = tt;
    interpPolar(p, tt, o);
    drawn = true;
    const [lo, hi] = shown(tt);
    if (split) paintAs(tt < 0.5 ? popFrom : restLook(target));
    el.setAttribute("d", serialize(o.slice(lo, hi), cl.slice(lo, hi)));
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
    regionFlight = false;
    split = 0;
    paintRest(target);
    // (joins a load in flight; starts one unless the last attempt failed)
    if (paintOf(target) === "fill" && !regionMod && (regionLoading || !regionFailed))
      upgrade(preloadRegion());
  };

  /** The current shape as plan source: the at-rest icon, or the rendered
   *  buffers (already N points per subpath). */
  const snapshot = (): Sampled[] => {
    const p = plan;
    const o = out;
    if (rest || !p || !o) return sampledOf(target);
    const [lo, hi] = shown(t);
    return o.slice(lo, hi).map((buf, k) => ({
      pts: Float64Array.from(buf),
      closed: p.items[lo + k].closed,
      hole: p.items[lo + k].hole,
    }));
  };

  /** A morph from the current shape to `icon` needs regions when either
   *  side is filled, or when the shape in flight already is a region. */
  const needsRegion = (icon: IconInput): boolean =>
    (!rest && regionFlight) || paintOf(icon) === "fill" || paintOf(target) === "fill";

  const retarget = (icon: IconInput, pop: boolean): void => {
    // retargeted again before a frame: the buffers were never drawn, and
    // the screen still shows the plan's source (interp at 0 is exact)
    if (!rest && plan && out && !drawn) {
      t = 0;
      interpPolar(plan, 0, out);
    }
    if (pop || (!rest && split)) {
      // the fallback, or a fallback flight interrupted: from what is on screen
      const from = snapshot();
      popBase = rest ? target : null;
      popFrom = paint;
      plan = popPlan(from, sampledOf(icon));
      split = from.length;
      regionFlight = false;
    } else if (needsRegion(icon)) {
      // from rest (cached), or from the shape in flight: a region as it is,
      // centerlines (a stroke morph interrupted toward a fill icon) outlined
      const mod = regionMod as RegionModule;
      plan =
        rest || !out
          ? mod.regionPlan(target, icon, strokeWidth)
          : mod.regionPlanFrom(
              regionFlight ? snapshot() : serialize(out, closed ?? undefined),
              icon,
              strokeWidth,
            );
      regionFlight = true;
      split = 0;
      paintAs("fill");
    } else {
      plan = rest ? planBetween(target, icon) : buildPlan(snapshot(), sampledOf(icon));
      regionFlight = false;
    }
    out = allocOutputs(plan);
    drawn = false;
    closed = plan.items.map((it) => it.closed);
    target = icon;
    rest = false;
  };

  // Region chunk not loaded yet: remember the LATEST request and replay it
  // when the chunk arrives — if it arrives within REGION_WAIT_MS. Past that
  // budget (at once if the load in flight is already older), or on a failed
  // load, `fallback` flies instead: never a stuck icon, never a throw.
  // Superseded requests are dropped.
  const whenRegion = (
    icon: IconInput,
    run: () => void,
    fallback: () => void,
  ): boolean => {
    // (a fallback flight interrupted needs no chunk: it chains, see retarget)
    if (regionMod || (!rest && split) || !needsRegion(icon)) return false;
    const req = {};
    pending = req;
    const give = (): void => {
      if (dead || pending !== req) return;
      pending = null;
      fallback();
    };
    const load = preloadRegion();
    if (Date.now() - regionSince > REGION_WAIT_MS) {
      give();
      return true;
    }
    const timer = setTimeout(give, REGION_WAIT_MS - (Date.now() - regionSince));
    load.then(
      () => {
        clearTimeout(timer);
        if (dead || pending !== req) return;
        pending = null;
        run();
      },
      () => {
        clearTimeout(timer);
        give();
      },
    );
    return true;
  };

  const setNow = (icon: IconInput): void => {
    stop();
    pending = null;
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

  const seek = (icon: IconInput, tt: number, pop = false): void => {
    if (dead) return;
    // past the budget, a scrub runs the fallback flight
    if (
      !pop &&
      whenRegion(
        icon,
        () => seek(icon, tt),
        () => seek(icon, tt, true),
      )
    )
      return;
    pending = null;
    let reuse = !rest && plan !== null && icon === target;
    if (reuse && split && regionMod && popBase !== null) {
      // the chunk landed mid-scrub: from the fallback back to the region morph
      target = popBase;
      rest = true;
      reuse = false;
    }
    stop();
    spring.v = 0; // controlled mode: no inherited velocity
    if (!reuse) retarget(icon, pop);
    render(tt);
  };

  const fly = (
    icon: IconInput,
    sp: SpringPreset | MorphOptions | undefined,
    pop: boolean,
  ): void => {
    if (dead) return;
    if (icon === target && (rest || flying)) {
      pending = null; // already there / en route: a request waiting for the chunk is stale
      return;
    }
    if (motionOff()) {
      setNow(icon);
      return;
    }
    if (
      !pop &&
      whenRegion(
        icon,
        () => fly(icon, sp, false),
        () => fly(icon, sp, true),
      )
    )
      return;
    pending = null;
    const { k, c } = resolveSpring(sp);
    spring.config(k, c);
    retarget(icon, pop);
    spring.start();
    if (!flying) {
      flying = true;
      addTicker(tick);
    }
  };

  return {
    morphTo: (icon, sp) => fly(icon, sp, false),
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
    get strokeWidth() {
      return strokeWidth;
    },
    set strokeWidth(v: number) {
      strokeWidth = v;
    },
    destroy() {
      stop();
      dead = true;
      pending = null;
      plan = null;
      out = null;
      closed = null;
    },
  };
}
