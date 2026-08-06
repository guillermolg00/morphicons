/* Compile-time pins for the React MorphIconProps (no runtime — `bun run
   typecheck` is the test runner): the props extend React's SVGProps, so SVG
   attrs, events and ARIA are typed and a typo fails the build. data-* attrs
   are exercised in the SSR suite via JSX (TS only exempts hyphenated names
   from excess-property checks there). Mirror of test/svelte/props-types.ts. */

import type { MorphIconProps } from "../../src/react/index";

export const valid: MorphIconProps = {
  icon: "M4 6h16M4 12h16M4 18h16",
  from: "M4 6h16",
  to: [["circle", { cx: 12, cy: 12, r: 10 }]],
  progress: 0.5,
  spring: "snappy",
  reducedMotion: "user",
  size: 32,
  color: "#e6a83c",
  strokeWidth: 1.5,
  absoluteStrokeWidth: true,
  label: "Menu",
  // …and the SVG surface from React's SVGProps:
  className: "my-icon",
  style: { opacity: 0.5 },
  strokeLinecap: "round",
  "aria-busy": true,
  role: "img",
  onClick: () => {},
};

// @ts-expect-error a typo in a presentation prop must not compile
export const propTypo: MorphIconProps = { icon: "M4 6h16", strokWidth: 2 };

// @ts-expect-error event handlers are typed too
export const eventTypo: MorphIconProps = { icon: "M4 6h16", onClik: () => {} };

export const wrongType: MorphIconProps = {
  from: "M4 6h16",
  to: "M18 6 6 18",
  // @ts-expect-error progress is a number, not a string
  progress: "half",
};

export const rmValue: MorphIconProps = {
  icon: "M4 6h16",
  // @ts-expect-error reducedMotion is a closed union: never | user | always
  reducedMotion: "sometimes",
};
