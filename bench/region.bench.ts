/* Region morphing benchmark (dev only). Prints markdown.

     bun bench/region.bench.ts [baselineDist]

   1. Weight — what an app ships: esbuild bundles each public entry of dist/
      (code splitting ON, minified) and splits the output into what loads
      eagerly (static import closure of the entry) and what loads lazily
      (reached only through import()). Same for the baseline dist (main),
      and a no-splitting build (bundlers that inline dynamic imports).
   2. Time — normalize (toRegion) per cell size, resample, plan, frame, for
      the 318 upstream icons of playground/vendor-regions.ts. JSC (bun) on
      this machine; the playground measures V8/JSC/Gecko on device.
   3. Accuracy — IoU of each cell size against a 1/64 reference grid,
      rasterized by scanline at 0.05 units.
   4. Memory — what the driver retains per icon (region + samples) and per
      plan. */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { build } from "esbuild";
import { CONCEPTS, SETS } from "../playground/vendor-regions";
import { svgToIcon } from "../src/adapters/index";
import { allocOutputs, interpPolar } from "../src/core/interpolate";
import { buildPlan, type MorphPlan } from "../src/core/plan";
import { paintOf } from "../src/core/region";
import { resampleIcon } from "../src/core/resample";
import { serialize } from "../src/core/serialize";
import type { IconInput } from "../src/core/types";
import {
  buildRegionPlan,
  regionContours,
  resampleRegion,
  toRegion,
} from "../src/region/index";

const ROOT = resolve(import.meta.dir, "..");
const BASE = resolve(process.argv[2] ?? "/tmp/morphicons-main/dist");
const DIST = join(ROOT, "dist");

const kb = (n: number) => (n / 1024).toFixed(2);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
};
const pct = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};
const gz = (b: Uint8Array) => gzipSync(b, { level: 9 }).length;
const br = (b: Uint8Array) =>
  brotliCompressSync(b, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;

// ---------------------------------------------------------------------------
// 1. Weight

interface Split {
  eager: { raw: number; gz: number; br: number };
  lazy: { raw: number; gz: number; br: number };
}

async function bundle(dist: string, code: string, splitting: boolean): Promise<Split> {
  const out = mkdtempSync(join(tmpdir(), "mi-size-"));
  try {
    const r = await build({
      stdin: { contents: code, resolveDir: dist, loader: "js" },
      bundle: true,
      splitting,
      format: "esm",
      minify: true,
      outdir: out,
      write: false,
      metafile: true,
      packages: "external",
      logLevel: "silent",
    });
    const files = new Map(r.outputFiles.map((f) => [f.path, f.contents]));
    const meta = r.metafile.outputs;
    const entry = Object.keys(meta).find((k) => meta[k].entryPoint);
    const eager = new Set<string>();
    const walk = (k: string) => {
      if (eager.has(k)) return;
      eager.add(k);
      for (const im of meta[k].imports)
        if (im.kind === "import-statement" && meta[im.path]) walk(im.path);
    };
    if (entry) walk(entry);
    const sum = (keys: string[]) => {
      const bufs = keys.map((k) => files.get(resolve(k)) ?? new Uint8Array());
      return {
        raw: bufs.reduce((a, b) => a + b.length, 0),
        gz: bufs.reduce((a, b) => a + gz(b), 0),
        br: bufs.reduce((a, b) => a + br(b), 0),
      };
    };
    const js = Object.keys(meta).filter((k) => k.endsWith(".js"));
    return {
      eager: sum(js.filter((k) => eager.has(k))),
      lazy: sum(js.filter((k) => !eager.has(k))),
    };
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

const ENTRIES: Array<[string, string]> = [
  ["core (index, everything)", `export * from "./index.js";`],
  ["dom: createMorph", `export { createMorph } from "./dom.js";`],
  ["react: MorphIcon", `export * from "./react.js";`],
  ["vue", `export * from "./vue.js";`],
  ["svelte-shared", `export * from "./svelte-shared.js";`],
  ["react-native", `export * from "./react-native.js";`],
  ["element (custom element)", `export * from "./element.js";`],
  ["adapters: svgToIcon", `export { svgToIcon } from "./adapters.js";`],
  ["adapters (all)", `export * from "./adapters.js";`],
  ["region (static import)", `export * from "./region.js";`],
];

async function weight(): Promise<string> {
  const rows: string[] = [
    "| entry | main eager gz | branch eager gz | Δ eager | branch lazy gz (region chunk) | branch lazy br | no-splitting bundler (all eager) gz |",
    "|---|---:|---:|---:|---:|---:|---:|",
  ];
  for (const [name, code] of ENTRIES) {
    const exists = async (d: string) => {
      try {
        return await bundle(d, code, true);
      } catch {
        return null;
      }
    };
    const a = await exists(BASE);
    const b = await exists(DIST);
    const flat = b ? await bundle(DIST, code, false) : null;
    if (!b) continue;
    const delta = a
      ? `${b.eager.gz - a.eager.gz >= 0 ? "+" : ""}${kb(b.eager.gz - a.eager.gz)}`
      : "new";
    rows.push(
      `| ${name} | ${a ? kb(a.eager.gz) : "—"} | ${kb(b.eager.gz)} | ${delta} | ${b.lazy.raw ? kb(b.lazy.gz) : "—"} | ${b.lazy.raw ? kb(b.lazy.br) : "—"} | ${flat ? kb(flat.eager.gz) : "—"} |`,
    );
  }
  return rows.join("\n");
}

// ---------------------------------------------------------------------------
// Icons

interface Ico {
  id: string;
  set: string;
  icon: IconInput;
  sw: number;
}
const icons: Ico[] = [];
for (const [key, s] of Object.entries(SETS))
  for (const c of CONCEPTS) {
    const e = s.icons[c];
    if (!e) continue;
    const sw = /stroke-width="([\d.]+)"/.exec(e.svg);
    const vb = /viewBox="([^"]+)"/.exec(e.svg);
    const w = vb ? Number(vb[1].trim().split(/[\s,]+/)[2]) : 24;
    icons.push({
      id: `${key}:${c}`,
      set: key,
      icon: svgToIcon(e.svg),
      sw: sw ? (Number(sw[1]) * 24) / w : 2,
    });
  }

const timeit = (fn: () => void, reps = 3): number => {
  let best = Number.POSITIVE_INFINITY;
  for (let r = 0; r < reps; r++) {
    const t0 = Bun.nanoseconds();
    fn();
    best = Math.min(best, (Bun.nanoseconds() - t0) / 1e6);
  }
  return best;
};

// ---------------------------------------------------------------------------
// 3. Accuracy: scanline raster of nonzero contours on [-1, 25]². Samples
// sit OFF the 0.05 lattice, with a different phase per axis: icon vertices
// live on that lattice, and with one shared phase a 45° edge through a
// vertex still crosses pixel centers exactly, so a 1e-15 difference flips a
// whole diagonal of pixels.

const PX = 0.618;
const PY = 0.3711;
const R = 520;
const LO = -1;
const SPAN = 26;
function raster(contours: Float64Array[]): Uint8Array {
  const bmp = new Uint8Array(R * R);
  const xs: number[] = [];
  const ds: number[] = [];
  for (let row = 0; row < R; row++) {
    const y = LO + ((row + PY) * SPAN) / R;
    xs.length = 0;
    ds.length = 0;
    for (const p of contours) {
      const n = p.length / 2;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const yi = p[2 * i + 1];
        const yj = p[2 * j + 1];
        if (yj <= y !== yi <= y) {
          xs.push(p[2 * j] + ((y - yj) * (p[2 * i] - p[2 * j])) / (yi - yj));
          ds.push(yi > yj ? 1 : -1);
        }
      }
    }
    const order = xs.map((_, k) => k).sort((a, b) => xs[a] - xs[b]);
    let w = 0;
    for (let k = 0; k < order.length - 1; k++) {
      w += ds[order[k]];
      if (w === 0) continue;
      const c0 = Math.max(0, Math.ceil(((xs[order[k]] - LO) * R) / SPAN - PX));
      const c1 = Math.min(R, Math.ceil(((xs[order[k + 1]] - LO) * R) / SPAN - PX));
      bmp.fill(1, row * R + c0, row * R + c1);
    }
  }
  return bmp;
}
const iou = (a: Uint8Array, b: Uint8Array) => {
  let i = 0;
  let u = 0;
  for (let k = 0; k < a.length; k++) {
    i += a[k] & b[k];
    u += a[k] | b[k];
  }
  return u ? i / u : 1;
};

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const out: string[] = [];
  out.push(`# Region morphing — benchmark\n`);
  out.push(
    `bun ${Bun.version} (JSC) · ${process.platform}/${process.arch} · ${navigator.hardwareConcurrency} threads · ${icons.length} upstream icons, ${Object.keys(SETS).length} sets · ${new Date().toISOString().slice(0, 10)}\n`,
  );

  out.push(`## 1. Weight (esbuild, minified, KB)\n`);
  out.push(await weight());
  out.push(
    `\n"eager" = the entry's static import closure (what every page pays). "lazy" = chunks reached only via import() — the region normalizer, fetched on the first morph that involves a fill icon. "no-splitting" = a bundler that inlines dynamic imports (IIFE/UMD builds, single-file, some RN/Metro setups).\n`,
  );

  // warm-up
  for (const i of icons.slice(0, 40))
    resampleRegion(toRegion(i.icon, { strokeWidth: i.sw }));

  out.push(`## 2. Time (ms, best of 3 per icon)\n`);
  const cells = [0.25, 0.125, 0.0625];
  const rows: string[] = [
    "| set | n | normalize cell ¼ med | cell ⅛ (default) med | ⅛ p95 | ⅛ max | cell 1/16 med | resample med | plan med | plan max | frame µs (region) | frame µs (centerline) |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];
  const all: Record<string, number[]> = {
    n4: [],
    n8: [],
    n16: [],
    plan: [],
    frame: [],
    cframe: [],
  };
  const regions = new Map<string, ReturnType<typeof resampleRegion>>();
  const regionD = new Map<string, number>();
  for (const key of Object.keys(SETS)) {
    const list = icons.filter((i) => i.set === key);
    const n: number[][] = [[], [], []];
    const rs: number[] = [];
    for (const i of list) {
      cells.forEach((cell, k) => {
        n[k].push(timeit(() => toRegion(i.icon, { strokeWidth: i.sw, cell })));
      });
      const r = toRegion(i.icon, { strokeWidth: i.sw });
      regionD.set(i.id, String(r[0][1].d).length);
      let s = resampleRegion(r);
      rs.push(timeit(() => (s = resampleRegion(r))));
      regions.set(i.id, s);
    }
    const plans: number[] = [];
    const frames: number[] = [];
    const cframes: number[] = [];
    for (let k = 0; k < list.length; k++) {
      const a = regions.get(list[k].id) ?? [];
      const b = regions.get(list[(k + 1) % list.length].id) ?? [];
      let plan: MorphPlan = buildRegionPlan(a, b);
      plans.push(timeit(() => (plan = buildRegionPlan(a, b))));
      const o = allocOutputs(plan);
      const closed = plan.items.map((it) => it.closed);
      frames.push(
        (timeit(() => {
          for (let f = 0; f < 200; f++) {
            interpPolar(plan, 0.37, o);
            serialize(o, closed);
          }
        }) /
          200) *
          1000,
      );
      if (paintOf(list[k].icon) === "stroke") {
        const ca = resampleIcon(list[k].icon);
        const cb = resampleIcon(list[(k + 1) % list.length].icon);
        const cp = buildPlan(ca, cb);
        const co = allocOutputs(cp);
        const cc = cp.items.map((it) => it.closed);
        cframes.push(
          (timeit(() => {
            for (let f = 0; f < 200; f++) {
              interpPolar(cp, 0.37, co);
              serialize(co, cc);
            }
          }) /
            200) *
            1000,
        );
      }
    }
    all.n4.push(...n[0]);
    all.n8.push(...n[1]);
    all.n16.push(...n[2]);
    all.plan.push(...plans);
    all.frame.push(...frames);
    all.cframe.push(...cframes);
    rows.push(
      `| ${key} | ${list.length} | ${median(n[0]).toFixed(2)} | ${median(n[1]).toFixed(2)} | ${pct(n[1], 0.95).toFixed(2)} | ${Math.max(...n[1]).toFixed(2)} | ${median(n[2]).toFixed(2)} | ${median(rs).toFixed(3)} | ${median(plans).toFixed(3)} | ${Math.max(...plans).toFixed(2)} | ${median(frames).toFixed(1)} | ${cframes.length ? median(cframes).toFixed(1) : "—"} |`,
    );
  }
  rows.push(
    `| **all** | ${all.n8.length} | ${median(all.n4).toFixed(2)} | ${median(all.n8).toFixed(2)} | ${pct(all.n8, 0.95).toFixed(2)} | ${Math.max(...all.n8).toFixed(2)} | ${median(all.n16).toFixed(2)} | | ${median(all.plan).toFixed(3)} | ${Math.max(...all.plan).toFixed(2)} | ${median(all.frame).toFixed(1)} | ${median(all.cframe).toFixed(1)} |`,
  );
  out.push(rows.join("\n"));

  out.push(`\n## 3. Accuracy vs cell size (IoU against a 1/64 reference grid)\n`);
  const acc: Record<number, number[]> = { 0.25: [], 0.125: [], 0.0625: [] };
  const verts: Record<number, number[]> = { 0.25: [], 0.125: [], 0.0625: [] };
  const worst: Array<[string, number]> = [];
  for (const i of icons) {
    const ref = raster(regionContours(i.icon, { strokeWidth: i.sw, cell: 1 / 64 }));
    for (const cell of cells) {
      const cs = regionContours(i.icon, { strokeWidth: i.sw, cell });
      const v = iou(raster(cs), ref);
      acc[cell].push(v);
      verts[cell].push(cs.reduce((a, c) => a + c.length / 2, 0));
      if (cell === 0.125) worst.push([i.id, v]);
    }
  }
  out.push(
    "| cell | IoU median | IoU p5 | IoU min | vertices median | normalize median ms |\n|---|---:|---:|---:|---:|---:|",
  );
  for (const [k, cell] of cells.entries())
    out.push(
      `| ${cell} | ${median(acc[cell]).toFixed(5)} | ${pct(acc[cell], 0.05).toFixed(5)} | ${Math.min(...acc[cell]).toFixed(5)} | ${median(verts[cell])} | ${median([all.n4, all.n8, all.n16][k]).toFixed(2)} |`,
    );
  worst.sort((a, b) => a[1] - b[1]);
  out.push(
    `\nWorst at the default cell: ${worst
      .slice(0, 5)
      .map(([id, v]) => `${id} ${v.toFixed(4)}`)
      .join(" · ")}\n`,
  );

  out.push(`## 4. Memory retained by the driver\n`);
  const dBytes = [...regionD.values()];
  const sBytes = [...regions.values()].map((s) =>
    s.reduce((a, c) => a + c.pts.byteLength, 0),
  );
  const planBytes: number[] = [];
  const ids = [...regions.keys()];
  for (let k = 0; k < ids.length; k++) {
    const p = buildRegionPlan(
      regions.get(ids[k]) ?? [],
      regions.get(ids[(k + 7) % ids.length]) ?? [],
    );
    let b = 0;
    for (const it of p.items)
      for (const v of Object.values(it)) if (v instanceof Float64Array) b += v.byteLength;
    planBytes.push(b + allocOutputs(p).reduce((a, o) => a + o.byteLength, 0));
  }
  out.push(
    `| what | median | max |\n|---|---:|---:|\n| region d (chars) per icon | ${median(dBytes)} | ${Math.max(...dBytes)} |\n| resampled region (Float64) per icon | ${kb(median(sBytes))} KB | ${kb(Math.max(...sBytes))} KB |\n| plan + output buffers per pair | ${kb(median(planBytes))} KB | ${kb(Math.max(...planBytes))} KB |\n`,
  );
  console.log(out.join("\n"));
}

await main();
