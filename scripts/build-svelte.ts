/* Generates the svelte half of dist/ after tsdown (which owns everything
   else, svelte-shared.js included). A .svelte component ships as SOURCE —
   the consumer's bundler compiles it via the `svelte` exports condition —
   so "building" it means: copy it next to the compiled chunks with its
   relative import rewritten, plus the tiny entry re-export and its types. */

const SRC = new URL("../src/svelte/", import.meta.url);
const DIST = new URL("../dist/", import.meta.url);

const component = await Bun.file(new URL("MorphIcon.svelte", SRC)).text();
const rewritten = component.replace('from "./shared"', 'from "./svelte-shared.js"');
if (rewritten === component) {
  throw new Error("build-svelte: expected MorphIcon.svelte to import from ./shared");
}

const entryJs = `export { default as MorphIcon } from "./MorphIcon.svelte";\n`;

const entryDts = `import type { Component } from "svelte";
import type { MorphHandle, MorphIconProps } from "./svelte-shared.js";
export declare const MorphIcon: Component<MorphIconProps, MorphHandle>;
export type { MorphHandle, MorphIconProps };
export type {
  IconInput,
  IconNode,
  Morph,
  MorphOptions,
  PathEl,
  Sampled,
  SpringPreset,
} from "./svelte-shared.js";
`;

await Bun.write(new URL("MorphIcon.svelte", DIST), rewritten);
await Bun.write(new URL("svelte.js", DIST), entryJs);
await Bun.write(new URL("svelte.d.ts", DIST), entryDts);

console.log("build-svelte: dist/MorphIcon.svelte + dist/svelte.{js,d.ts}");
