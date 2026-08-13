/* Generates the astro half of dist/ after tsdown (which owns element.js).
   A .astro component ships as SOURCE — the consumer's Astro compiles it —
   so "building" it means: copy it next to the compiled chunks with its
   relative imports rewritten onto the element chunk, plus the entry types
   (the Astro language server reads Props from the .astro source itself;
   the .d.ts serves plain TS imports of the entry). */

const SRC = new URL("../src/astro/", import.meta.url);
const DIST = new URL("../dist/", import.meta.url);

const component = await Bun.file(new URL("MorphIcon.astro", SRC)).text();
const rewritten = component.replaceAll('"../element/index"', '"./element.js"');
if (rewritten === component) {
  throw new Error(
    "build-astro: expected MorphIcon.astro to import from ../element/index",
  );
}

const entryDts = `import type {
  IconInput,
  MorphOptions,
  ReducedMotionMode,
  SpringPreset,
} from "./element.js";

export interface MorphIconAstroProps {
  icon?: IconInput;
  from?: IconInput;
  to?: IconInput;
  progress?: number;
  spring?: SpringPreset | MorphOptions;
  reducedMotion?: ReducedMotionMode;
  size?: number | string;
  color?: string;
  strokeWidth?: number | string;
  absoluteStrokeWidth?: boolean;
  label?: string;
  [attr: string]: unknown;
}

/** Astro component: SSR shell over the <morph-icon> custom element. */
declare const MorphIcon: (props: MorphIconAstroProps) => unknown;
export default MorphIcon;
export type {
  IconInput,
  IconNode,
  MorphOptions,
  ReducedMotionMode,
  SpringPreset,
} from "./element.js";
`;

await Bun.write(new URL("MorphIcon.astro", DIST), rewritten);
await Bun.write(new URL("astro.d.ts", DIST), entryDts);

console.log("build-astro: dist/MorphIcon.astro + dist/astro.d.ts");
