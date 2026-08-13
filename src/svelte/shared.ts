/* Svelte binding, TS half: everything that can live outside the component so
   MorphIcon.svelte stays a thin compiled shell. Fully typechecked by
   `tsc -p tsconfig.svelte.json` (the .svelte file itself is only compiled,
   never typechecked — keep it logic-free). The lifecycle logic itself lives
   in the shared controller (src/dom/controller.ts, one implementation for
   Svelte and the custom element); this module keeps the Svelte-typed prop
   surface and re-exports the controller so the shell has ONE import site. */

import type { SVGAttributes } from "svelte/elements";
import type { SpringPreset } from "../core/spring";
import type { IconInput } from "../core/types";
import type { MorphOptions, ReducedMotionMode } from "../dom/index";

export {
  computeInitialD,
  createController,
  type MorphHandle,
} from "../dom/controller";

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
  /** Reduced-motion policy: "never" (default) animates regardless of the OS
   *  setting, "user" honors prefers-reduced-motion (morphs degrade to an
   *  instant swap while it is on), "always" always jumps. */
  reducedMotion?: ReducedMotionMode;
  size?: number | string;
  color?: string;
  strokeWidth?: number | string;
  /** Like lucide-svelte: stroke width does not scale with `size`. */
  absoluteStrokeWidth?: boolean;
  /** Accessibility: with label → role="img" + <title>; without → aria-hidden. */
  label?: string;
}

export type { IconInput, IconNode, Sampled } from "../core/types";
export type { Morph, MorphOptions, PathEl, ReducedMotionMode } from "../dom/index";
export type { SpringPreset };
