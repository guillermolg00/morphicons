/* React binding: MorphIcon with the three modes — uncontrolled (change the
   `icon` prop and morphicons animates), controlled (`from`/`to`/`progress`,
   no spring) and imperative (ref → { morphTo, set }).

   Clean SSR by construction: the initial `d` is computed ONCE with the pure
   core (useState initializer) and React never rewrites that attribute — the
   morph mutates it externally via createMorph. The server emits the exact
   static SVG (zero flash, zero layout shift); the runtime is born on
   hydration. Drop-in with lucide-react: same presentation props. */

import {
  forwardRef,
  type SVGProps,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { allocOutputs, interpPolar } from "../core/interpolate";
import { buildPlan } from "../core/plan";
import { resampleIcon } from "../core/resample";
import { serialize } from "../core/serialize";
import type { SpringPreset } from "../core/spring";
import type { IconInput } from "../core/types";
import { canonicalD, createMorph, type Morph, type MorphOptions } from "../dom/index";

/** Imperative surface exposed via ref. */
export interface MorphHandle {
  morphTo(icon: IconInput, spring?: SpringPreset | MorphOptions): void;
  set(icon: IconInput): void;
}

export interface MorphIconProps
  extends Omit<SVGProps<SVGSVGElement>, "from" | "to" | "ref"> {
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
  /** Like lucide-react: stroke width does not scale with `size`. */
  absoluteStrokeWidth?: boolean;
  /** Accessibility: with label → role="img" + <title>; without → aria-hidden. */
  label?: string;
}

// renderToString runs no effects; on the client we want layout (sync before
// first paint). The shim avoids the useLayoutEffect warning in SSR.
const useIsoLayoutEffect = typeof document === "undefined" ? useEffect : useLayoutEffect;

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

export const MorphIcon = forwardRef<MorphHandle, MorphIconProps>(
  function MorphIcon(props, ref) {
    const {
      icon,
      from,
      to,
      progress,
      spring,
      size = 24,
      color = "currentColor",
      strokeWidth = 2,
      absoluteStrokeWidth,
      label,
      ...rest
    } = props;

    const controlled = from !== undefined && to !== undefined;
    const initialIcon = icon ?? from ?? to;

    // The initial d is constant for React: computed once (server and client
    // produce the same string → hydration without mismatch) and from then on
    // only the driver mutates it outside the vdom.
    const [initialD] = useState(() => {
      if (controlled) return frozenD(from, to, progress ?? 0);
      return initialIcon !== undefined ? canonicalD(initialIcon) : "";
    });

    const pathRef = useRef<SVGPathElement>(null);
    const morphRef = useRef<Morph | null>(null);
    const springRef = useRef(spring);
    springRef.current = spring;
    const firstIcon = useRef(true);
    // true when the instance has an active seek plan based on the current
    // controlled pair (enables incremental seek without re-basing on `from`).
    const based = useRef(false);
    const pair = useRef<readonly [IconInput, IconInput] | null>(null);

    useIsoLayoutEffect(() => {
      const el = pathRef.current;
      if (!el || initialIcon === undefined) return;
      const m = createMorph(el, controlled ? from : initialIcon);
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
      return () => {
        m.destroy();
        morphRef.current = null;
        based.current = false;
        pair.current = null;
      };
      // Mount only: later changes are handled by the per-mode effects.
    }, []);

    // Uncontrolled mode: animate when `icon` changes (first render doesn't).
    useEffect(() => {
      if (icon === undefined) return;
      if (firstIcon.current) {
        firstIcon.current = false;
        return;
      }
      morphRef.current?.morphTo(icon, springRef.current);
    }, [icon]);

    // Controlled mode: freeze the pair at `progress` via seek (no spring).
    useEffect(() => {
      const m = morphRef.current;
      if (!m || !controlled) return;
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
    }, [controlled, from, to, progress]);

    useImperativeHandle(
      ref,
      (): MorphHandle => ({
        morphTo: (i, s) => morphRef.current?.morphTo(i, s ?? springRef.current),
        set: (i) => morphRef.current?.set(i),
      }),
      [],
    );

    const sw = absoluteStrokeWidth
      ? (Number(strokeWidth) * 24) / Number(size)
      : strokeWidth;

    return (
      // biome-ignore lint/a11y/noSvgWithoutTitle: alt text is conditional — label → role="img" + <title>, no label → aria-hidden
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
        role={label ? "img" : undefined}
        aria-hidden={label ? undefined : true}
        {...rest}
      >
        {label ? <title>{label}</title> : null}
        <path ref={pathRef} d={initialD} />
      </svg>
    );
  },
);

export type { IconInput, IconNode, Sampled } from "../core/types";
export type { Morph, MorphOptions, PathEl } from "../dom/index";
export type { SpringPreset };
