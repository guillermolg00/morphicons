/* Svelte binding, TS half: everything that can live outside the component so
   MorphIcon.svelte stays a thin compiled shell. Fully typechecked by
   `tsc -p tsconfig.svelte.json` (the .svelte file itself is only compiled,
   never typechecked — keep it logic-free). */

import type { SVGAttributes } from "svelte/elements";
import { allocOutputs, interpPolar } from "../core/interpolate";
import { buildPlan } from "../core/plan";
import { resampleIcon } from "../core/resample";
import { serialize } from "../core/serialize";
import type { SpringPreset } from "../core/spring";
import type { IconInput } from "../core/types";
import type { Morph } from "../dom/index";
import { canonicalD, createMorph, type MorphOptions, type PathEl } from "../dom/index";

/** Imperative surface exposed on the component instance (`bind:this`). */
export interface MorphHandle {
  morphTo(icon: IconInput, spring?: SpringPreset | MorphOptions): void;
  set(icon: IconInput): void;
}

/** Rest props fall through to the `<svg>` fully typed (class, style, data-*,
 *  events, ARIA…) via svelte/elements, like lucide-svelte — typos in an SVG
 *  attr fail the build. `from`/`to` are omitted because the SMIL animation
 *  attributes of the same name collide with the controlled-mode pair. */
export interface MorphIconProps
  extends Omit<SVGAttributes<SVGSVGElement>, "from" | "to"> {
  /** Uncontrolled mode: the current icon; changing the prop animates. */
  icon?: IconInput;
  /** Controlled mode: source endpoint of the pair. */
  from?: IconInput;
  /** Controlled mode: target endpoint of the pair. */
  to?: IconInput;
  /** Controlled mode: 0..1 progress of the frozen morph (no spring). */
  progress?: number;
  /** Physics for uncontrolled/imperative mode: preset or custom spring. */
  spring?: SpringPreset | MorphOptions;
  size?: number | string;
  color?: string;
  strokeWidth?: number | string;
  /** Like lucide-svelte: stroke width does not scale with `size`. */
  absoluteStrokeWidth?: boolean;
  /** Accessibility: with label → role="img" + <title>; without → aria-hidden. */
  label?: string;
}

/** Frozen shape of the from→to pair at t, using the pure core (SSR-safe).
 *  At exact endpoints returns the canonical `d` (real curves, not polyline). */
function frozenD(from: IconInput, to: IconInput, t: number): string {
  if (t <= 0) return canonicalD(from);
  if (t >= 1) return canonicalD(to);
  const plan = buildPlan(resampleIcon(from), resampleIcon(to));
  const out = allocOutputs(plan);
  interpPolar(plan, t, out);
  return serialize(
    out,
    plan.items.map((it) => it.closed),
  );
}

type ModeProps = Pick<MorphIconProps, "icon" | "from" | "to" | "progress">;
type WatchProps = ModeProps & { spring?: SpringPreset | MorphOptions };

/** The initial d is constant for Svelte: computed once from the mount-time
 *  props (server and client produce the same string → hydration without
 *  mismatch) and from then on only the driver mutates it outside the template. */
export function computeInitialD({ icon, from, to, progress }: ModeProps): string {
  if (from !== undefined && to !== undefined) return frozenD(from, to, progress ?? 0);
  const first = icon ?? from ?? to;
  return first !== undefined ? canonicalD(first) : "";
}

/** Per-instance driver state — the exact logic of the React/Vue bindings
 *  (mount, mode watch, controlled seek with re-basing, imperative). Takes the
 *  init-time props: they seed the watch baselines so the first `$effect` run
 *  (which fires on mount in Svelte, unlike Vue's `watch`) is a no-op. All
 *  change detection lives HERE, under tsc — the .svelte shell only wires
 *  runes to these methods.
 *
 *  Lifecycle contract (shared verbatim by the three bindings):
 *  - Lazy driver: an iconless mount keeps the element and births the driver
 *    on the FIRST icon that shows up (prop or imperative). `morphTo` with no
 *    driver behaves as `set` — there is nothing to fly from.
 *  - Controlled wins: while `from` and `to` are both present the pair owns
 *    the path and `icon` changes are ignored; dropping the pair hands the
 *    path back to `icon`.
 *  - Every exit from controlled mode (imperative call or icon takeover)
 *    invalidates the frozen pair, so returning to it re-bases on `from`. */
export function createController({ icon, from, to, progress }: ModeProps) {
  let el: PathEl | null = null;
  let dead = false;
  let morph: Morph | null = null;
  // true when the instance has an active seek plan based on the current
  // controlled pair (enables incremental seek without re-basing on `from`).
  let based = false;
  let pair: readonly [IconInput, IconInput] | null = null;
  // Watch baselines (change detection mirrors Vue's watch semantics).
  let prevIcon = icon;
  let prevControlled = from !== undefined && to !== undefined;
  let prevFrom = from;
  let prevTo = to;
  let prevProgress = progress;

  /** Driver birth, lazy included: the first icon to show up creates it. */
  const ensure = (birth: IconInput): Morph | null => {
    if (morph) return morph;
    if (dead || !el) return null;
    morph = createMorph(el, birth);
    return morph;
  };

  /** Controlled mode: freeze the pair at `progress` via seek (no spring). */
  const applyPair = (
    from: IconInput,
    to: IconInput,
    progress: number | undefined,
  ): void => {
    const m = morph;
    if (!m) return;
    const t = progress ?? 0;
    const changed = !pair || pair[0] !== from || pair[1] !== to;
    if (changed) {
      pair = [from, to];
      based = false;
    }
    if (t <= 0) {
      m.set(from);
      based = false;
    } else if (t >= 1) {
      m.set(to);
      based = false;
    } else {
      if (!based) {
        m.set(from); // re-base the plan on the pair's origin
        based = true;
      }
      m.seek(to, t);
    }
  };

  return {
    mount(mountEl: PathEl, { icon, from, to, progress }: ModeProps): void {
      el = mountEl;
      const controlled = from !== undefined && to !== undefined;
      const initialIcon = icon ?? from ?? to;
      if (initialIcon === undefined) return; // lazy: the driver waits for an icon
      const m = createMorph(el, controlled ? from : initialIcon);
      morph = m;
      if (controlled) {
        pair = [from, to];
        const t = progress ?? 0;
        if (t <= 0) m.set(from);
        else if (t >= 1) m.set(to);
        else {
          m.seek(to, t);
          based = true;
        }
      }
    },

    destroy(): void {
      dead = true;
      el = null;
      morph?.destroy();
      morph = null;
      based = false;
      pair = null;
    },

    /** Prop watcher: ONE owner decides per run — the controlled pair while it
     *  is fully present, `icon` otherwise (mount doesn't fire thanks to the
     *  init-time baselines). */
    watch({ icon, from, to, progress, spring }: WatchProps): void {
      const controlled = from !== undefined && to !== undefined;
      const left = prevControlled && !controlled;
      const iconChanged = icon !== prevIcon;
      const pairChanged = from !== prevFrom || to !== prevTo || progress !== prevProgress;
      prevControlled = controlled;
      prevIcon = icon;
      prevFrom = from;
      prevTo = to;
      prevProgress = progress;
      if (controlled) {
        if (!pairChanged) return;
        if (!(morph ?? ensure(from))) return;
        applyPair(from, to, progress);
        return;
      }
      if (icon === undefined || (!iconChanged && !left)) return;
      pair = null; // leaving controlled mode invalidates the frozen pair
      based = false;
      if (morph) morph.morphTo(icon, spring);
      else ensure(icon); // late first icon: born already showing it, no flight
    },

    morphTo(icon: IconInput, spring?: SpringPreset | MorphOptions): void {
      pair = null;
      based = false;
      if (morph) morph.morphTo(icon, spring);
      else ensure(icon); // no driver yet: nothing to fly from — same as set
    },

    set(icon: IconInput): void {
      pair = null;
      based = false;
      if (morph) morph.set(icon);
      else ensure(icon);
    },
  };
}

export type { IconInput, IconNode, Sampled } from "../core/types";
export type { Morph, MorphOptions, PathEl } from "../dom/index";
export type { SpringPreset };
