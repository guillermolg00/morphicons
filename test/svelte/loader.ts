/* Bun test loader: compile .svelte files with the real Svelte compiler.
   Default: server variant (the SSR suite). With the `?client` suffix
   (import "…/MorphIcon.svelte?client") the SAME file compiles as client so
   the mount suite can run it against happy-dom — Bun keeps the query in the
   resolved path, which gives the two variants distinct module-cache entries.

   Two Bun quirks this loader absorbs:
   - Bun does not apply the package.json "browser" condition, so a bare
     `import "svelte"` always lands on index-server.js and `mount()` throws.
     Every svelte import inside a ?client module is therefore anchored to the
     client runtime, and "svelte?client" serves a shim that re-exports it.
   - Bare svelte specifiers can resolve to DIFFERENT physical copies (bun's
     install cache vs node_modules) depending on the importer, which would
     load two client runtimes side by side (reactivity contexts don't mix).
     Anchoring every specifier from ONE base pins a single canonical copy. */

import { plugin } from "bun";
import { compile } from "svelte/compiler";

const serverEntry = Bun.resolveSync("svelte", import.meta.dir);
const CLIENT_ENTRY = serverEntry.replace(/index-server\.js$/, "index-client.js");
if (CLIENT_ENTRY === serverEntry || !(await Bun.file(CLIENT_ENTRY).exists())) {
  throw new Error(
    `svelte package layout changed: cannot derive the client entry from ${serverEntry} — update test/svelte/loader.ts`,
  );
}

const resolveSvelte = (spec: string): string =>
  spec === "svelte" ? CLIENT_ENTRY : Bun.resolveSync(spec, import.meta.dir);

/** Rewrites every `import … "svelte[/…]"` in compiled client code to the
 *  canonical absolute path (see header). */
const anchorSvelteImports = (code: string): string =>
  code.replace(
    /(import\s*(?:[^"']*?from\s*)?)(["'])(svelte(?:\/[^"']+)?)\2/g,
    (_m, pre: string, q: string, spec: string) => `${pre}${q}${resolveSvelte(spec)}${q}`,
  );

plugin({
  name: "svelte-loader",
  setup(build) {
    // import "svelte?client" → the client runtime (bun pre-resolves the bare
    // specifier to …/index-server.js?client, keeping the query).
    build.onLoad({ filter: /index-server\.js\?client$/ }, () => ({
      contents: `export * from ${JSON.stringify(CLIENT_ENTRY)};`,
      loader: "js",
    }));
    build.onLoad({ filter: /\.svelte\?client$/ }, async ({ path }) => {
      const real = path.replace(/^file:\/*/, "/").slice(0, -"?client".length);
      const source = await Bun.file(real).text();
      const { js } = compile(source, { generate: "client", filename: real });
      return { contents: anchorSvelteImports(js.code), loader: "js" };
    });
    build.onLoad({ filter: /\.svelte$/ }, async ({ path }) => {
      const source = await Bun.file(path).text();
      const { js } = compile(source, { generate: "server", filename: path });
      return { contents: js.code, loader: "js" };
    });
  },
});
