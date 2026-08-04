/* Compile-time pins for the Svelte MorphIconProps (no runtime — `bun run
   typecheck` is the test runner): the props derive from svelte/elements'
   SVGAttributes, so real SVG attrs, events and ARIA are typed and a typo
   fails the build, like lucide-svelte. Mirror of test/react/props-types.ts. */

import type { MorphIconProps } from "../../src/svelte/shared";

export const valid: MorphIconProps = {
  icon: "M4 6h16M4 12h16M4 18h16",
  from: "M4 6h16",
  to: [["circle", { cx: 12, cy: 12, r: 10 }]],
  progress: 0.5,
  spring: "snappy",
  size: 32,
  color: "#e6a83c",
  strokeWidth: 1.5,
  absoluteStrokeWidth: true,
  label: "Menu",
  // …and the SVG surface from svelte/elements:
  class: "my-icon",
  style: "opacity: 0.5",
  "stroke-linecap": "round",
  "data-testid": "morph",
  "aria-busy": true,
  role: "img",
  onclick: () => {},
};

// @ts-expect-error a typo in a presentation prop must not compile
export const propTypo: MorphIconProps = { icon: "M4 6h16", strokWidth: 2 };

// @ts-expect-error event handlers are typed too
export const eventTypo: MorphIconProps = { icon: "M4 6h16", onclik: () => {} };

export const wrongType: MorphIconProps = {
  from: "M4 6h16",
  to: "M18 6 6 18",
  // @ts-expect-error progress is a number, not a string
  progress: "half",
};
