import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    dom: "src/dom/index.ts",
    react: "src/react/index.tsx",
    vue: "src/vue/index.ts",
  },
  format: "esm",
  platform: "neutral",
  target: "es2022",
  // Build/dts only (jsx + lib DOM for the binding). The rule "core and
  // driver compile without DOM" is still enforced by `bun run typecheck`.
  tsconfig: "tsconfig.build.json",
  dts: true,
  clean: true,
});
