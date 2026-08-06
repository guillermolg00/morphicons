/* React Native binding: MorphIcon over react-native-svg with the three
   modes — uncontrolled (change the `icon` prop and morphicons animates),
   controlled (`from`/`to`/`progress`, no spring) and imperative (ref →
   { morphTo, set }) — and the same lifecycle contract as the web bindings.

   The dom driver is reused verbatim as the engine: RN has a global
   requestAnimationFrame, PathEl is structural, and createMorph only ever
   writes the `d` attribute — so the whole platform difference is a shim
   that forwards that write to Path.setNativeProps({ d }), outside the vdom
   exactly like the web mutation. The initial `d` is computed ONCE with the
   pure core and React never rewrites it. No matchMedia in RN: with
   reducedMotion="user" the OS setting comes from AccessibilityInfo, cached
   best-effort (the query is async) and kept fresh via the
   reduceMotionChanged event; the default "never" policy never touches the
   accessibility bridge. */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { AccessibilityInfo } from "react-native";
import Svg, { Path, type SvgProps } from "react-native-svg";
import { allocOutputs, interpPolar } from "../core/interpolate";
import { buildPlan } from "../core/plan";
import { resampleIcon } from "../core/resample";
import { serialize } from "../core/serialize";
import type { SpringPreset } from "../core/spring";
import type { IconInput } from "../core/types";
import {
  canonicalD,
  createMorph,
  type Morph,
  type MorphOptions,
  type ReducedMotionMode,
} from "../dom/index";

/** Imperative surface exposed via ref. */
export interface MorphHandle {
  morphTo(icon: IconInput, spring?: SpringPreset | MorphOptions): void;
  set(icon: IconInput): void;
}

export interface MorphIconProps extends Omit<SvgProps, "from" | "to"> {
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
  /** Reduced-motion policy: "never" (default) animates regardless of the OS
   *  setting, "user" honors AccessibilityInfo's reduce motion (morphs degrade
   *  to an instant swap while it is on; best-effort, the query is async),
   *  "always" always jumps. */
  reducedMotion?: ReducedMotionMode;
  size?: number | string;
  color?: string;
  strokeWidth?: number | string;
  /** Like lucide: stroke width does not scale with `size`. */
  absoluteStrokeWidth?: boolean;
  /** Accessibility: with label → role="img" + aria-label; without → aria-hidden. */
  label?: string;
}

// react-native-web SSR runs no effects; on the client we want layout (sync
// before first paint). The shim avoids the useLayoutEffect warning there.
const useIsoLayoutEffect = typeof document === "undefined" ? useEffect : useLayoutEffect;

// Reduced motion, module-level: ONE AccessibilityInfo query + subscription
// for all instances, armed lazily by the FIRST instance that opts into the
// "user" policy ("never"/"always" never touch the bridge). Best-effort by
// nature — the query is async, so the first frames of an immediate morph
// may animate before the answer lands; the subscription keeps it exact from
// then on.
let reduced = false;
let rmInit = false;

function initReducedMotion(): void {
  if (rmInit) return;
  rmInit = true;
  try {
    AccessibilityInfo.isReduceMotionEnabled().then(
      (value) => {
        reduced = value;
      },
      () => {},
    );
    AccessibilityInfo.addEventListener("reduceMotionChanged", (value) => {
      reduced = value;
    });
  } catch {
    // No accessibility bridge (exotic hosts): animations stay on.
  }
}

/** Frozen shape of the from→to pair at t, using the pure core. At exact
 *  endpoints returns the canonical `d` (real curves, not polyline). */
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

export const MorphIcon = forwardRef<MorphHandle, MorphIconProps>(
  function MorphIcon(props, ref) {
    const {
      icon,
      from,
      to,
      progress,
      spring,
      reducedMotion,
      size = 24,
      color = "currentColor",
      strokeWidth = 2,
      absoluteStrokeWidth,
      label,
      ...rest
    } = props;

    const controlled = from !== undefined && to !== undefined;
    const initialIcon = icon ?? from ?? to;

    // Constant for React: computed once and from then on only the driver
    // mutates the native prop outside the vdom (setNativeProps).
    const [initialD] = useState(() => {
      if (controlled) return frozenD(from, to, progress ?? 0);
      return initialIcon !== undefined ? canonicalD(initialIcon) : "";
    });

    const pathRef = useRef<Path>(null);
    const morphRef = useRef<Morph | null>(null);
    const springRef = useRef(spring);
    springRef.current = spring;
    const rmRef = useRef(reducedMotion);
    rmRef.current = reducedMotion;
    // Watch baselines (mount doesn't fire the mode effect thanks to these).
    const prevIcon = useRef(icon);
    const prevControlled = useRef(controlled);
    const dead = useRef(false);
    // true when the instance has an active seek plan based on the current
    // controlled pair (enables incremental seek without re-basing on `from`).
    const based = useRef(false);
    const pair = useRef<readonly [IconInput, IconInput] | null>(null);

    /** The PathEl shim: createMorph only ever writes `d`, and Path forwards
     *  it to the native view without re-rendering. Stable identity. */
    const el = useRef<{ setAttribute(name: string, value: string): void }>({
      setAttribute: (name, value) => {
        if (name === "d") pathRef.current?.setNativeProps({ d: value });
      },
    });

    /** morphTo that applies the reduced-motion policy ("user" reads the OS
     *  setting via AccessibilityInfo, best-effort). */
    const fly = (m: Morph, i: IconInput, s?: SpringPreset | MorphOptions): void => {
      const mode = rmRef.current ?? "never";
      if (mode === "user") initReducedMotion(); // late opt-in: arm the bridge
      if (mode === "always" || (mode === "user" && reduced)) m.set(i);
      else m.morphTo(i, s);
    };
    const flyRef = useRef(fly);
    flyRef.current = fly;

    /** Driver birth, lazy included (#1 of the lifecycle contract): an
     *  iconless mount keeps the element and the FIRST icon to show up (prop
     *  or imperative) creates the driver, already showing it — no flight.
     *  Stable across renders: closes over refs only. */
    const ensure = useCallback((birth: IconInput): Morph | null => {
      if (morphRef.current) return morphRef.current;
      if (dead.current || !pathRef.current) return null;
      morphRef.current = createMorph(el.current, birth);
      return morphRef.current;
    }, []);

    useIsoLayoutEffect(() => {
      dead.current = false;
      if (pathRef.current && initialIcon !== undefined) {
        const m = createMorph(el.current, controlled ? from : initialIcon);
        morphRef.current = m;
        if (controlled) {
          pair.current = [from, to];
          const t = progress ?? 0;
          if (t <= 0) m.set(from);
          else if (t >= 1) m.set(to);
          else {
            m.seek(to, t);
            based.current = true;
          }
        }
      }
      return () => {
        dead.current = true;
        morphRef.current?.destroy();
        morphRef.current = null;
        based.current = false;
        pair.current = null;
      };
      // Mount only: later changes are handled by the per-mode effects.
    }, []);

    // "user" arms the OS listener the moment it is requested (mount included):
    // the query is async, so arming early keeps the best-effort window small.
    // fly() also arms it as a catch-all for imperative calls.
    useEffect(() => {
      if (reducedMotion === "user") initReducedMotion();
    }, [reducedMotion]);

    // Uncontrolled mode: animate when `icon` changes. Controlled wins while
    // a full pair is present; dropping the pair hands the path back to
    // `icon` and invalidates the frozen pair (see the lifecycle contract in
    // the README — shared verbatim by the four bindings).
    useEffect(() => {
      const left = prevControlled.current && !controlled;
      prevControlled.current = controlled;
      const changed = icon !== prevIcon.current;
      prevIcon.current = icon;
      if (controlled) return;
      if (icon === undefined || (!changed && !left)) return;
      pair.current = null;
      based.current = false;
      const m = morphRef.current;
      if (m) flyRef.current(m, icon, springRef.current);
      else ensure(icon); // late first icon: born already showing it
    }, [icon, controlled, ensure]);

    // Controlled mode: freeze the pair at `progress` via seek (no spring).
    // The driver may be born here too (a pair arriving after an iconless
    // mount seeks exactly like a clean mount).
    useEffect(() => {
      if (!controlled) return;
      const m = morphRef.current ?? ensure(from);
      if (!m) return;
      const t = progress ?? 0;
      const changed = !pair.current || pair.current[0] !== from || pair.current[1] !== to;
      if (changed) {
        pair.current = [from, to];
        based.current = false;
      }
      if (t <= 0) {
        m.set(from);
        based.current = false;
      } else if (t >= 1) {
        m.set(to);
        based.current = false;
      } else {
        if (!based.current) {
          m.set(from); // re-base the plan on the pair's origin
          based.current = true;
        }
        m.seek(to, t);
      }
    }, [controlled, from, to, progress, ensure]);

    useImperativeHandle(
      ref,
      (): MorphHandle => ({
        morphTo: (i, s) => {
          pair.current = null; // imperative exit from controlled mode
          based.current = false;
          const m = morphRef.current;
          if (m) flyRef.current(m, i, s ?? springRef.current);
          else ensure(i); // no driver yet: nothing to fly from — same as set
        },
        set: (i) => {
          pair.current = null;
          based.current = false;
          const m = morphRef.current;
          if (m) m.set(i);
          else ensure(i);
        },
      }),
      [ensure],
    );

    const sw = absoluteStrokeWidth
      ? (Number(strokeWidth) * 24) / Number(size)
      : strokeWidth;

    return (
      <Svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
        role={label ? "img" : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : true}
        {...rest}
      >
        <Path ref={pathRef} d={initialD} />
      </Svg>
    );
  },
);

export type { IconInput, IconNode, Sampled } from "../core/types";
export type { Morph, MorphOptions, PathEl, ReducedMotionMode } from "../dom/index";
export type { SpringPreset };
