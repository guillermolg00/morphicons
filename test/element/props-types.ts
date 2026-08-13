/* Compile-time pins for the <morph-icon> property surface (no runtime —
   `bun run typecheck` is the test runner): the reactive properties accept
   the full IconInput surface (IconNode included, which attributes can't
   carry), the element satisfies MorphHandle, and the HTMLElementTagNameMap
   augmentation types document.createElement("morph-icon"). Mirror of
   test/react/props-types.ts and the other bindings' pins. */

import type { MorphHandle } from "../../src/dom/controller";
import type { MorphIconElement } from "../../src/element/index";

declare const el: MorphIconElement;

el.icon = "M4 6h16M4 12h16M4 18h16";
el.from = "M4 6h16";
el.to = [["circle", { cx: 12, cy: 12, r: 10 }]];
el.progress = 0.5;
el.spring = "snappy";
el.spring = { stiffness: 300, damping: 26 };
el.reducedMotion = "user";
el.morphTo([["path", { d: "M5 12h14" }]], "snappy");
el.set("M4 6h16");

// The element IS the imperative handle (ref/bind:this elsewhere).
const handle: MorphHandle = el;
void handle;

// The tag map augmentation types createElement without a cast.
const created = document.createElement("morph-icon");
created.icon = [["circle", { cx: 12, cy: 12, r: 10 }]];

// @ts-expect-error a typo in the policy must not compile
el.reducedMotion = "sometimes";

// @ts-expect-error progress is a number, not a string
el.progress = "0.5";

// @ts-expect-error a typo in a spring preset must not compile
el.spring = "snapy";
