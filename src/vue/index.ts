/* Vue 3 binding: MorphIcon with the three modes — uncontrolled (change the
   `icon` prop and morphicons animates), controlled (`from`/`to`/`progress`,
   no spring) and imperative (template ref → { morphTo, set }).

   Clean SSR by construction: the initial `d` is computed ONCE with the pure
   core at setup (server and client produce the same string → hydration
   without mismatch) and stays constant in the vnode, so Vue's patch never
   rewrites the attribute — the morph mutates it externally via createMorph.
   Plain render function with `h`: no SFC and no JSX, the build needs no Vue
   compiler. Drop-in with lucide-vue-next: same presentation props. */

import {
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  type PropType,
  shallowRef,
  watch,
} from "vue";
import { allocOutputs, interpPolar } from "../core/interpolate";
import { buildPlan } from "../core/plan";
import { resampleIcon } from "../core/resample";
import { serialize } from "../core/serialize";
import type { SpringPreset } from "../core/spring";
import type { IconInput } from "../core/types";
import { canonicalD, createMorph, type Morph, type MorphOptions } from "../dom/index";

/** Imperative surface exposed on the component instance (template ref). */
export interface MorphHandle {
  morphTo(icon: IconInput, spring?: SpringPreset | MorphOptions): void;
  set(icon: IconInput): void;
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

export const MorphIcon = defineComponent({
  name: "MorphIcon",
  props: {
    /** Uncontrolled mode: the current icon; changing the prop animates. */
    icon: { type: [String, Array] as PropType<IconInput>, default: undefined },
    /** Controlled mode: source endpoint of the pair. */
    from: { type: [String, Array] as PropType<IconInput>, default: undefined },
    /** Controlled mode: target endpoint of the pair. */
    to: { type: [String, Array] as PropType<IconInput>, default: undefined },
    /** Controlled mode: 0..1 progress of the frozen morph (no spring). */
    progress: { type: Number, default: undefined },
    /** Physics for uncontrolled/imperative mode: preset or custom spring. */
    spring: {
      type: [String, Object] as PropType<SpringPreset | MorphOptions>,
      default: undefined,
    },
    size: { type: [Number, String], default: 24 },
    color: { type: String, default: "currentColor" },
    strokeWidth: { type: [Number, String], default: 2 },
    /** Like lucide: stroke width does not scale with `size`. */
    absoluteStrokeWidth: { type: Boolean, default: false },
    /** Accessibility: with label → role="img" + <title>; without → aria-hidden. */
    label: { type: String, default: undefined },
  },
  setup(props, { expose }) {
    // The initial d is constant for Vue: computed once from the mount-time
    // props (server and client produce the same string → hydration without
    // mismatch) and from then on only the driver mutates it outside the vdom.
    const initialD = (() => {
      const { icon, from, to, progress } = props;
      if (from !== undefined && to !== undefined) return frozenD(from, to, progress ?? 0);
      const first = icon ?? from ?? to;
      return first !== undefined ? canonicalD(first) : "";
    })();

    const pathEl = shallowRef<SVGPathElement | null>(null);
    let morph: Morph | null = null;
    // true when the instance has an active seek plan based on the current
    // controlled pair (enables incremental seek without re-basing on `from`).
    let based = false;
    let pair: readonly [IconInput, IconInput] | null = null;

    onMounted(() => {
      const el = pathEl.value;
      const { icon, from, to, progress } = props;
      const controlled = from !== undefined && to !== undefined;
      const initialIcon = icon ?? from ?? to;
      if (!el || initialIcon === undefined) return;
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
    });

    onBeforeUnmount(() => {
      morph?.destroy();
      morph = null;
      based = false;
      pair = null;
    });

    // Uncontrolled mode: animate when `icon` changes (mount doesn't fire).
    watch(
      () => props.icon,
      (icon) => {
        if (icon !== undefined) morph?.morphTo(icon, props.spring);
      },
    );

    // Controlled mode: freeze the pair at `progress` via seek (no spring).
    watch(
      () => [props.from, props.to, props.progress] as const,
      () => {
        const m = morph;
        const { from, to, progress } = props;
        if (!m || from === undefined || to === undefined) return;
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
      },
    );

    expose({
      morphTo: (i: IconInput, s?: SpringPreset | MorphOptions) =>
        morph?.morphTo(i, s ?? props.spring),
      set: (i: IconInput) => morph?.set(i),
    } satisfies MorphHandle);

    return () => {
      const sw = props.absoluteStrokeWidth
        ? (Number(props.strokeWidth) * 24) / Number(props.size)
        : props.strokeWidth;
      return h(
        "svg",
        {
          xmlns: "http://www.w3.org/2000/svg",
          width: props.size,
          height: props.size,
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: props.color,
          "stroke-width": sw,
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          role: props.label ? "img" : undefined,
          "aria-hidden": props.label ? undefined : "true",
        },
        [
          props.label ? h("title", props.label) : null,
          h("path", { ref: pathEl, d: initialD }),
        ],
      );
    };
  },
});

export type { IconInput, IconNode, Sampled } from "../core/types";
export type { Morph, MorphOptions, PathEl } from "../dom/index";
export type { SpringPreset };
