/* Compile-time pins for the Vue MorphIcon props (no runtime — `bun run
   typecheck` is the test runner): the DECLARED props (icon, from, to,
   progress, spring, size…) are typed through defineComponent, so a wrong
   type fails the build. Unknown keys do NOT fail: Vue routes them through
   attrs fallthrough, which is untyped by design — the ecosystem standard,
   same surface as lucide-vue-next (typo detection for fallthrough attrs
   needs vue-tsc strictTemplates on the consumer side, not the library).
   Mirror of test/react/props-types.ts and test/svelte/props-types.ts. */

import { h } from "vue";
import { MorphIcon } from "../../src/vue/index";

export const valid = h(MorphIcon, {
  icon: "M4 6h16M4 12h16M4 18h16",
  progress: 0.5,
  spring: "snappy",
  size: 32,
  color: "#e6a83c",
  strokeWidth: 1.5,
  absoluteStrokeWidth: true,
  label: "Menu",
  class: "my-icon",
  "data-testid": "morph",
});

// @ts-expect-error progress is a number, not a string
export const wrongType = h(MorphIcon, { icon: "M4 6h16", progress: "half" });

// NOT an error on purpose: unknown keys are Vue attrs fallthrough (untyped
// by Vue's design). If this ever starts failing, Vue grew stricter typing —
// revisit the pin and celebrate.
export const fallthroughTypo = h(MorphIcon, { icon: "M4 6h16", strokWidth: 2 });
