/* Preview server for the regions playground (dev only, never published).
   Bundles playground/regions.html with code splitting — so the region
   normalizer ships as a real lazy chunk, exactly like an app build — and
   serves it on the tailnet address only (not on the LAN or 0.0.0.0).

   Lazy chunks obey the `net` cookie the page's network bar writes, to
   reproduce real failure modes against the real dynamic import:
     slow:<ms>  delay       fail   500       stale  404 (deleted hashed chunk)
     hang       holds the request (captive portal / dead connection)
   Everything is served no-store so "reload cold" really is cold; text is
   gzip/brotli-compressed as a CDN would. Rebuilds on any change in src/ or
   playground/.

     bun scripts/serve-regions.ts            # HOST=100.x.y.z PORT=4173 (your tailnet IP) */

import { watch } from "node:fs";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const HOST = process.env.HOST ?? "127.0.0.1";
const PORT = Number(process.env.PORT ?? 4173);
const ROOT = new URL("..", import.meta.url).pathname;

interface File {
  path: string;
  body: Uint8Array;
  gz: Uint8Array;
  br: Uint8Array;
  type: string;
  kind: "html" | "entry" | "lazy" | "asset";
}

let files = new Map<string, File>();
let building: Promise<void> | null = null;

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  map: "application/json; charset=utf-8",
};

async function build(): Promise<void> {
  const t0 = performance.now();
  const r = await Bun.build({
    entrypoints: [`${ROOT}playground/regions.html`],
    splitting: true,
    minify: true,
    sourcemap: "linked",
    target: "browser",
  });
  if (!r.success) {
    for (const l of r.logs) console.error(l);
    return;
  }
  const next = new Map<string, File>();
  const js: Array<[string, string]> = [];
  for (const o of r.outputs) {
    const path = o.path.replace(/^\.\//, "");
    const body = new Uint8Array(await o.arrayBuffer());
    const ext = path.split(".").pop() ?? "";
    if (ext === "js") js.push([path, new TextDecoder().decode(body)]);
    next.set(`/${path}`, {
      path,
      body,
      gz: gzipSync(body),
      br: brotliCompressSync(body, {
        params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
      }),
      type: TYPES[ext] ?? "application/octet-stream",
      kind: ext === "html" ? "html" : ext === "js" ? "entry" : "asset",
    });
  }
  // A chunk is lazy when some output reaches it only via import("./…").
  for (const [, src] of js)
    for (const m of src.matchAll(/import\(\s*["']\.\/([^"']+)["']\s*\)/g)) {
      const f = next.get(`/${m[1]}`);
      if (f) f.kind = "lazy";
    }
  files = next;
  const lazy = [...next.values()].filter((f) => f.kind === "lazy");
  console.log(
    `[build] ${next.size} files in ${(performance.now() - t0).toFixed(0)} ms · lazy: ${lazy
      .map((f) => `${f.path} (${(f.gz.length / 1024).toFixed(2)} KB gz)`)
      .join(", ")}`,
  );
}

const rebuild = () => {
  building ??= build()
    .catch((e) => console.error("[build] failed", e))
    .finally(() => {
      building = null;
    });
  return building;
};

let timer: ReturnType<typeof setTimeout> | undefined;
for (const dir of ["src", "playground"])
  watch(`${ROOT}${dir}`, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(rebuild, 150);
  });

await rebuild();

const cookie = (req: Request, name: string): string | undefined =>
  new RegExp(`(?:^|; )${name}=([^;]*)`).exec(req.headers.get("cookie") ?? "")?.[1];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const server = Bun.serve({
  hostname: HOST,
  port: PORT,
  idleTimeout: 255,
  async fetch(req) {
    if (building) await building;
    const url = new URL(req.url);
    const p = url.pathname === "/" ? "/regions.html" : url.pathname;
    const noStore = { "cache-control": "no-store" };
    if (p === "/__manifest.json")
      return Response.json(
        {
          files: [...files.values()].map((f) => ({
            path: f.path,
            kind: f.kind,
            raw: f.body.length,
            gzip: f.gz.length,
            br: f.br.length,
          })),
        },
        { headers: noStore },
      );
    const f = files.get(p);
    if (!f) return new Response("not found", { status: 404, headers: noStore });

    if (f.kind === "lazy") {
      const net = decodeURIComponent(cookie(req, "net") ?? "ok");
      console.log(`[chunk] ${f.path}${url.search} · net=${net}`);
      if (net.startsWith("slow:")) await sleep(Number(net.slice(5)) || 0);
      else if (net === "fail")
        return new Response("upstream error", { status: 500, headers: noStore });
      else if (net === "stale")
        return new Response("not found (stale deploy)", {
          status: 404,
          headers: noStore,
        });
      else if (net === "hang") {
        await sleep(240_000);
        return new Response("timeout", { status: 504, headers: noStore });
      }
    }

    const accept = req.headers.get("accept-encoding") ?? "";
    const [body, enc] = accept.includes("br")
      ? [f.br, "br"]
      : accept.includes("gzip")
        ? [f.gz, "gzip"]
        : [f.body, ""];
    const headers: Record<string, string> = {
      ...noStore,
      "content-type": f.type,
      vary: "accept-encoding",
      "timing-allow-origin": "*",
    };
    if (enc) headers["content-encoding"] = enc;
    return new Response(body, { headers });
  },
});

console.log(`[serve] http://${server.hostname}:${server.port}/`);
