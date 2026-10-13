# Region morphing: report (branch `feat/region-morphing`)

Everything below was measured on this branch:
- the CLI benchmark (`bun run bench:regions`, JSC, raw output at the end);
- the playground (`bun run play:regions`) running in Chrome 152 against the real server, including its network lab.

Machine: Linux x64, 12 threads. Icons: 318 upstream Iconify icons, 10 libraries, 19 sets (stroke / fill-built "line" / solid / duotone).

## TL;DR

| | result |
|---|---|
| Static cost (every page) | **+1.25 KB gzip** on dom and on every binding (dom 6.88 → 8.13; react 7.81 → 9.05) |
| Lazy cost (first morph with a fill icon) | **4.13 KB gzip / 3.75 KB brotli** incremental chunk. Fetch 2 ms on the tailnet, **parse + eval 0.6 ms** (Chrome desktop) |
| Stroke-only apps | download **0 bytes** of the chunk and never write paint (tested) |
| Normalize (once per icon, cached) | median **1.08 ms**, p95 1.83, max 3.24 (JSC). Browser (V8): median 0.6, max 2.3 |
| Plan (once per pair, cached) | median **0.05 ms**, max 0.30 |
| Frame (every rAF) | **13.6 µs** region vs 9.4 µs centerline (median). 20 icons morphing at once ≈ 0.3 ms per frame |
| Fidelity vs the browser rendering the ORIGINAL svg | IoU median **0.9987**, worst **0.983** (lucide circle, a thin ring). 0 of 322 icons below 0.98 |
| Discretization (cell ⅛ vs a 1/64 reference) | IoU median 0.99917. Mean boundary deviation ≈ 0.01 units (≈ 1% of a pixel at 24 px) |
| Robustness | 318/318 icons normalize, sample and plan; 0 NaN; winding locked at every t (tested) |

## 1. Weight

Measured with esbuild over `dist/` like an app build: code splitting on, minified, gzip -9. Baseline is `main` (38d2a72) built the same way.

- `size-limit` gates were renegotiated (~10% headroom) and all 14 pass.
- The RN gate now **counts** the region chunk: Metro inlines `import()`.
- New gate: `morphicons/region` (standalone 9.31 KB; ~4.1 KB incremental over the driver).

Where the +1.25 KB static comes from: the paint model, paint writes, the loader with its failure and budget policy, and the region plan caches.

**Cheaper options:**
- Move `regionOf` / `regionPlanBetween` and their caches into the lazy chunk. Estimated −0.3 to −0.5 KB static; not done, not measured.
- Bundlers without code splitting pay 11.5 KB (dom) instead of 8.1 + 4.1 lazy.

Earlier comparison for the same job (Fourier scratch, same 10 libraries):
- clipper-lib union + offset: 25.8 KB gzip, 0.04–0.54 ms per icon.
- PathKit (Skia): ~135 KB wasm.

The SDF normalizer is 2–4× slower than clipper on JSC but 6× smaller, and has no degenerate cases. All of it is paid once per icon and cached.

## 2. Cost of the first stroke↔fill interaction

The first morph that involves a given fill icon pays:
- the chunk, once per page;
- normalize for both icons (~1 ms each, desktop);
- the plan (~0.05 ms).

That is a **~2–5 ms main-thread task on the click** on desktop. Low-end Android is typically 4–6× slower: **10–25 ms**, an *estimate* that was not measured on a device. After that, everything is cached by icon reference (WeakMap), so later morphs cost only frames.

**More efficient, by case:**

| situation | best option |
|---|---|
| App knows it mixes stroke and fill | `preloadRegion()` on idle (`requestIdleCallback`) or on the first `pointerenter` / `focus` of a toggle. Skip it if `navigator.connection.saveData` |
| Low-end devices, long lists of fill icons | Precompute at build time with `toRegion()` (pure, emits `data-region`): **zero runtime normalization**. Or cell ¼ on device: 0.40 ms per icon, IoU 0.9976 |
| Critical UI that must never jump | `setRegionLoader(async () => region)` with a static `import * as region from "morphicons/region"`: +4.1 KB eager, no network |
| Many fill icons mounted at once | Nothing to do: one shared load (single promise), N icons → 1 request |

## 3. Network edge cases (measured in the network lab)

The server throttles the chunk with a cookie; the page is the real build with the real dynamic import.

| case | what happens (measured) | before this branch's fixes | mitigation / most efficient solution |
|---|---|---|---|
| fast / cached (≤ 100 ms) | flies; start delay = load time (2–12 ms on the tailnet) | same | none needed |
| slow (400 ms / 1.5 s / 5 s) | **jumps at +102 ms**, rest upgrades to the exact region when the chunk lands (+415 / +1513 ms), next morphs fly | waited the full load time with no visual response, then flew late | budget (fixed) + `preloadRegion()` on idle/hover; `<link rel="modulepreload">` for the chunk if the bundler exposes its URL |
| hang (captive portal, dead TCP) | **jumps at +103 ms on every interaction**; never stuck | **icon stuck forever** on the old shape (bug, fixed) | budget (fixed). Possible refinement: once a load is older than the budget, jump immediately without waiting 100 ms each time |
| fail (500 / offline) | jumps at +5 ms; **one** request per need | the jump fired a 2nd request in the same instant (retry storm, fixed) | fixed. See the next row for the browser limit |
| fail, then the network comes back | **Chromium caches the failed `import()` for the document's lifetime**: 5 attempts → 1 request reached the server, later attempts fail in ~1 ms. Icons keep working as jumps until reload | same | not fixable in the library (the bundler owns the chunk URL). Options: static import via `setRegionLoader`; service worker precache (Workbox picks the chunk up); app-level reload on ChunkLoadError |
| stale deploy (old HTML, hashed chunk deleted → 404) | same as fail | same | keep old hashed assets for N deploys / skew protection (Vercel), or a static import |
| superseded request (A → fill, then → stroke before load) | latest wins, the stale flight is dropped (tested) | same | none needed |
| bundler without splitting (IIFE/UMD, single-file) | inlined: no network, +4.1 KB eager | n/a | fine as is |
| React Native / Metro | inlined (gate counts it). **The RN binding does not map fill/stroke yet**: follow-up | n/a | wire `fill` / `stroke` / `fill-rule` in the RN shim |
| SSR | rest shapes need no chunk (a fill icon rests on its own canonical `d` + declared rule); the client prefetches at mount and upgrades the rest `d` to the region (same pixels) | n/a | expected to be hydration-safe (the driver writes after mount); not verified in this branch |
| CSP / CDN | the chunk is a same-origin module script; it needs `script-src 'self'` (or `'strict-dynamic'` from a nonced entry). A cross-origin CDN must send CORS headers | n/a | config only |
| HTTP/1.1 congestion at startup | the chunk queues behind images | n/a | modulepreload / `fetchpriority`, or preload on idle after load |

## 4. Accuracy

- **Against the real rendering** (playground, Chrome): each original SVG is rasterized by the browser (its own caps, joins, fill rules, opacity), and so is its normalized region, at 192 px. IoU median 0.9987; per-set minimum ≥ 0.983. The worst are thin stroke rings and diagonals (lucide circle 0.983, heroicons check 0.983), where anti-aliasing dominates.
- **Cell size** (vs a 1/64 grid):

  | cell | IoU median | p5 | normalize median |
  |---|---|---|---|
  | ¼ | 0.9976 | 0.9901 | 0.40 ms |
  | ⅛ (default) | 0.99917 | 0.9962 | 1.06 ms |
  | 1/16 | 0.99965 | 0.9987 | 3.34 ms |

  ⅛ is the sweet spot. ¼ is a valid low-end setting.
- **Known modelling limits:**
  - Square / butt caps and miter joins are modelled as round. All the stroke libraries measured use round; the IoU would show the difference.
  - White "knockout" fills are not subtracted.
  - Duotone layers with opacity < 0.5 are skipped by design.

## 5. Memory

Retained per icon:
- region `d`: median 1.5 K chars, max 8.4 K;
- samples: 2 KB, max 10 KB.

Per pair, plan plus output buffers: median 15 KB, max 55 KB. Everything is keyed by icon reference (WeakMap), so it is collected with the icons. Raw `d` strings use a bounded cache (64 entries).

## 6. Review the animations

`bun run play:regions` serves the playground on the tailnet. It has:
- 16 curated hard cases;
- a pair explorer: any icon ↔ any icon, scrubber, red ghost of the original SVG;
- a wall that cycles every concept across libraries;
- on-device benchmarks (timing / fidelity with visual diffs / load cost);
- `?lab`: the network lab.

## Appendix: raw CLI benchmark output



bun 1.3.14 (JSC) · linux/x64 · 12 threads · 318 upstream icons, 19 sets · 2026-10-13

### 1. Weight (esbuild, minified, KB)

| entry | main eager gz | branch eager gz | Δ eager | branch lazy gz (region chunk) | branch lazy br | no-splitting bundler (all eager) gz |
|---|---:|---:|---:|---:|---:|---:|
| core (index, everything) | 6.37 | 6.40 | +0.03 | — | — | 6.40 |
| dom: createMorph | 6.88 | 8.13 | +1.25 | 4.13 | 3.75 | 11.47 |
| react: MorphIcon | 7.81 | 9.05 | +1.24 | 4.13 | 3.75 | 12.39 |
| vue | 7.84 | 9.08 | +1.25 | 4.13 | 3.75 | 12.41 |
| svelte-shared | 7.41 | 8.68 | +1.27 | 4.13 | 3.75 | 12.02 |
| react-native | 7.99 | 9.19 | +1.20 | 4.13 | 3.75 | 12.54 |
| element (custom element) | 8.59 | 9.85 | +1.26 | 4.13 | 3.75 | 13.17 |
| adapters: svgToIcon | 3.29 | 4.15 | +0.86 | — | — | 4.15 |
| adapters (all) | 4.15 | 5.01 | +0.85 | — | — | 5.01 |
| region (static import) | — | 9.03 | new | — | — | 9.03 |

"eager" = the entry's static import closure (what every page pays). "lazy" = chunks reached only via import() — the region normalizer, fetched on the first morph that involves a fill icon. "no-splitting" = a bundler that inlines dynamic imports (IIFE/UMD builds, single-file, some RN/Metro setups).

### 2. Time (ms, best of 3 per icon)

| set | n | normalize cell ¼ med | cell ⅛ (default) med | ⅛ p95 | ⅛ max | cell 1/16 med | resample med | plan med | plan max | frame µs (region) | frame µs (centerline) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| lucide/stroke | 20 | 0.38 | 1.01 | 2.15 | 2.15 | 2.94 | 0.110 | 0.072 | 0.30 | 16.9 | 9.1 |
| tabler/stroke | 20 | 0.36 | 0.91 | 2.19 | 2.19 | 2.52 | 0.117 | 0.093 | 0.30 | 16.1 | 9.6 |
| tabler/solid | 14 | 0.43 | 1.10 | 1.40 | 1.40 | 3.45 | 0.078 | 0.043 | 0.19 | 9.1 | — |
| heroicons/stroke | 19 | 0.34 | 0.81 | 1.56 | 1.56 | 2.25 | 0.112 | 0.064 | 0.34 | 13.6 | 11.6 |
| heroicons/solid | 19 | 0.45 | 1.18 | 2.09 | 2.09 | 3.93 | 0.076 | 0.043 | 0.18 | 9.2 | — |
| iconoir/stroke | 20 | 0.29 | 0.72 | 1.23 | 1.23 | 2.02 | 0.087 | 0.057 | 0.22 | 13.7 | 11.6 |
| material-symbols/line | 20 | 0.40 | 0.98 | 1.50 | 1.50 | 3.12 | 0.055 | 0.060 | 0.27 | 14.0 | — |
| material-symbols/solid | 14 | 0.34 | 0.95 | 1.47 | 1.47 | 3.10 | 0.057 | 0.040 | 0.18 | 9.5 | — |
| ph/line | 20 | 0.50 | 1.21 | 1.80 | 1.80 | 3.76 | 0.099 | 0.058 | 0.24 | 16.1 | — |
| ph/solid | 14 | 0.41 | 1.11 | 1.76 | 1.76 | 3.52 | 0.066 | 0.025 | 0.18 | 9.0 | — |
| ph/duotone | 7 | 0.54 | 1.46 | 1.86 | 1.86 | 4.20 | 0.117 | 0.063 | 0.20 | 18.1 | — |
| ri/line | 20 | 0.45 | 1.18 | 1.91 | 1.91 | 3.50 | 0.061 | 0.062 | 0.24 | 13.6 | — |
| ri/solid | 14 | 0.39 | 1.08 | 1.39 | 1.39 | 3.63 | 0.057 | 0.040 | 0.17 | 9.2 | — |
| mdi/line | 20 | 0.44 | 0.99 | 1.65 | 1.65 | 2.99 | 0.041 | 0.059 | 0.22 | 13.9 | — |
| mdi/solid | 11 | 0.35 | 0.97 | 1.22 | 1.22 | 3.24 | 0.059 | 0.039 | 0.06 | 9.1 | — |
| bi/line | 20 | 0.61 | 1.65 | 3.34 | 3.34 | 4.86 | 0.109 | 0.058 | 0.21 | 13.7 | — |
| bi/solid | 14 | 0.53 | 1.51 | 2.32 | 2.32 | 4.96 | 0.072 | 0.039 | 0.19 | 9.3 | — |
| mingcute/line | 19 | 0.37 | 0.95 | 1.88 | 1.88 | 2.83 | 0.103 | 0.059 | 0.25 | 13.9 | 9.3 |
| mingcute/solid | 13 | 0.45 | 1.15 | 1.44 | 1.44 | 3.46 | 0.066 | 0.040 | 0.19 | 13.4 | — |
| **all** | 318 | 0.41 | 1.06 | 1.84 | 3.34 | 3.34 | | 0.046 | 0.34 | 13.6 | 9.4 |

### 3. Accuracy vs cell size (IoU against a 1/64 reference grid)

| cell | IoU median | IoU p5 | IoU min | vertices median | normalize median ms |
|---|---:|---:|---:|---:|---:|
| 0.25 | 0.99758 | 0.99009 | 0.98505 | 87 | 0.41 |
| 0.125 | 0.99917 | 0.99616 | 0.98763 | 128 | 1.06 |
| 0.0625 | 0.99965 | 0.99868 | 0.99242 | 148 | 3.34 |

Worst at the default cell: ph/line:check 0.9876 · mingcute/line:x 0.9922 · lucide/stroke:x 0.9928 · tabler/stroke:x 0.9928 · heroicons/solid:check 0.9931

### 4. Memory retained by the driver

| what | median | max |
|---|---:|---:|
| region d (chars) per icon | 1528 | 8434 |
| resampled region (Float64) per icon | 2.00 KB | 10.00 KB |
| plan + output buffers per pair | 15.00 KB | 55.00 KB |

