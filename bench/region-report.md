# Region morphing: report (branch `feat/region-morphing`)

Everything below was measured on this branch:
- the CLI benchmark (`bun run bench:regions`, JSC, raw output at the end);
- the playground (`bun run play:regions`) running in Chrome 152 against the real server, including its network lab.

Machine: Linux x64, 12 threads. Icons: 318 upstream Iconify icons, 10 libraries, 19 sets (stroke / fill-built "line" / solid / duotone).

## TL;DR

| | result |
|---|---|
| Static cost (every page) | **+1.07 KB gzip** on dom and on every binding (dom 6.88 → 7.95; react 7.81 → 8.87). Was +1.25 before moving the region caches into the chunk |
| Lazy cost (first morph with a fill icon) | **5.01 KB gzip / 4.59 KB brotli** incremental chunk (was 4.13 / 3.75; in the preview's Bun build the topology rules add 0.64 and the moved caches 0.26). Fetch 2 ms on the tailnet, parse + eval 0.6 ms in Chrome desktop, measured on the 4.13 KB chunk |
| Stroke-only apps | download **0 bytes** of the chunk and never write paint (tested) |
| Normalize (once per icon, cached) | median **1.08 ms**, p95 1.83, max 3.24 (JSC). Browser (V8): median 0.6, max 2.3 |
| Plan (once per pair, cached) | median **0.05 ms**, max 0.72 |
| Frame (every rAF) | **11.9 µs** region vs 9.4 µs centerline (median). 20 icons morphing at once ≈ 0.25 ms per frame |
| Fidelity vs the browser rendering the ORIGINAL svg | IoU median **0.9987**, worst **0.983** (lucide circle, a thin ring). 0 of 322 icons below 0.98 |
| Discretization (cell ⅛ vs a 1/64 reference) | IoU median 0.99917. Mean boundary deviation ≈ 0.01 units (≈ 1% of a pixel at 24 px) |
| Robustness | 318/318 icons normalize, sample and plan; 0 NaN; winding locked at every t (tested) |
| Topology (4798 region pairs) | **0** endpoints that don't render their icon (was 1057 of 5267: the bell video). 19 pairs with a transient hole leak > 1% of ink, worst 2.0% (168, worst 9.2%, at the first measurement over these pairs: §4). 65 of 4590 same-concept pairs turn > 46°, almost all moons drawn rotated (was 237) |
| Color | every binding paints a filled path in the `color` prop; React Native forwards paint (was: CSS color on the web, stroked outline on RN) |

## 1. Weight

Measured with esbuild over `dist/` like an app build: code splitting on, minified, gzip -9. Baseline is `main` (38d2a72) built the same way.

- `size-limit` gates were renegotiated (~10% headroom) and all 14 pass.
- The RN gate now **counts** the region chunk: Metro inlines `import()`.
- New gate: `morphicons/region` (standalone 10.26 KB, gate 10.7; ~5 KB incremental over the driver). The static gates were tightened back to ~0.4–0.6 KB headroom after the move below.

Where the +1.07 KB static comes from: the paint model, paint writes, and the loader with its failure and budget policy: what has to run before the chunk exists.

**Cheaper options:**
- ~~Move `regionOf` / `regionPlanBetween` and their caches into the lazy chunk.~~ Done: −0.18 KB here, −0.23 KB in size-limit (dom 8.36 → 8.13). Below the −0.3 to −0.5 estimate: the minified caches were smaller than they looked. The rest is policy that must run before the chunk exists.
- Bundlers without code splitting pay 12.2 KB (dom) instead of 7.95 + 5.0 lazy.

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
| Critical UI that must never jump | `setRegionLoader(async () => region)` with a static `import * as region from "morphicons/region"`: +5.0 KB eager, no network |
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
| bundler without splitting (IIFE/UMD, single-file) | inlined: no network, +5.0 KB eager | n/a | fine as is |
| React Native / Metro | inlined (gate counts it). Paint goes through the shim (`setNativeProps`), republished on every render like `d`; `currentColor` / `inherit` resolve to the `color` prop | fill icons drew as the stroked outline of their region (fixed) | none needed. Not verified on a device: the Path mock replays Fabric commits |
| SSR | rest shapes need no chunk (a fill icon rests on its own canonical `d` + declared rule); the client prefetches at mount and upgrades the rest `d` to the region (same pixels) | n/a | expected to be hydration-safe (the driver writes after mount); not verified in this branch |
| CSP / CDN | the chunk is a same-origin module script; it needs `script-src 'self'` (or `'strict-dynamic'` from a nonced entry). A cross-origin CDN must send CORS headers | n/a | config only |
| HTTP/1.1 congestion at startup | the chunk queues behind images | n/a | modulepreload / `fetchpriority`, or preload on idle after load |

## 4. Topology: holes that paint

The review video (Tabler solid bell → Heroicons outline bell) showed a hole appearing, a crescent mid-flight and a bell ending solid. Under nonzero the winding *is* the picture, and the planner broke it:
- it duplicated a contour that has holes onto several pieces (cell division), so two coincident copies wound +2 under the −1 hole and painted it;
- it gave each hole its own similarity, so a star ring's inner star could pick the other spin and poke out;
- it matched holes with nothing in common (a trash can's lid gap with one of its slats), so they swept across each other, and two holes on one spot wind −1 and paint.

`bun run bench:topology` now checks every region pair of the vendored sets (same concept across libraries plus the next concept in each set): t = 0 / 1 rasterized against the icons (IoU < 0.99 = broken), seven mid-flight frames for negative winding, and the main outer's turn.

| step (in order) | pairs | broken endpoints | pairs leaking > 1% mid-flight (worst) | same-concept spins > 46° |
|---|---:|---:|---:|---:|
| before | 5267 | 1057 | not measured | not measured |
| holed contours never duplicated; a vanishing piece takes its holes along one homothety | 5267 | 63 | | |
| a hole belongs to the outer its contour lies in (camera: window vs lens) | 5267 | 2 ¹ | | |
| check fixed: a different sampling phase per axis | 5267 | 0 | 278 (19.0%) | |
| matched holes fly in their outer's frame | 5267 | 0 | 209 (9.2%) | |
| check restricted to pairs that fly as regions (stroke ↔ stroke never does) | 4798 | 0 | 168 (9.2%) | |
| unmatched holes close on the first half, new ones open on the second | 4798 | 0 | 65 (8.9%) | |
| holes pair only with an overlapping hole (bbox IoU ≥ 0.25 in the outer's frame) | 4798 | 0 | 23 (3.1%) | 237 of 4590 |
| stronger upright tie-break for outers (λ 0.05 → 0.3) | 4798 | 0 | **19 (2.0%)** | **65 of 4590** |

¹ The check's own artifact: one shared sampling phase on both axes put 45° edges exactly on pixel centers. Both benches now use a different phase per axis.

The 19 left are short slivers mid-flight on pairs whose holes differ in structure (worst: ph/line:home → bi/solid:home, 2.0% of ink at t = 0.375). The only complete fix is drawing holes as a mask (outer ∖ ∪ holes) instead of nonzero winding; that means more DOM per icon and a `<mask>` in React Native, so it is not done.

## 5. Accuracy

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

## 6. Memory

Retained per icon:
- region `d`: median 1.5 K chars, max 8.4 K;
- samples: 2 KB, max 10 KB.

Per pair, plan plus output buffers: median 20 KB, max 60 KB. Everything is keyed by icon reference (WeakMap), so it is collected with the icons. Raw `d` strings use a bounded cache (64 entries).

## 7. Review the animations

`bun run play:regions` serves the playground on the tailnet. It has:
- 16 curated hard cases;
- a pair explorer: any icon ↔ any icon, scrubber, red ghost of the original SVG;
- a wall that cycles every concept across libraries;
- on-device benchmarks (timing / fidelity with visual diffs / load cost);
- `?lab`: the network lab.

## Appendix: raw CLI benchmark output

## Region morphing — benchmark

bun 1.3.14 (JSC) · linux/x64 · 12 threads · 318 upstream icons, 19 sets · 2026-10-13

### 1. Weight (esbuild, minified, KB)

| entry | main eager gz | branch eager gz | Δ eager | branch lazy gz (region chunk) | branch lazy br | no-splitting bundler (all eager) gz |
|---|---:|---:|---:|---:|---:|---:|
| core (index, everything) | 6.37 | 6.44 | +0.07 | — | — | 6.44 |
| dom: createMorph | 6.88 | 7.95 | +1.07 | 5.01 | 4.59 | 12.22 |
| react: MorphIcon | 7.81 | 8.87 | +1.07 | 5.01 | 4.59 | 13.14 |
| vue | 7.84 | 8.92 | +1.08 | 5.01 | 4.59 | 13.17 |
| svelte-shared | 7.41 | 8.51 | +1.10 | 5.01 | 4.59 | 12.76 |
| react-native | 7.99 | 9.18 | +1.18 | 5.01 | 4.59 | 13.45 |
| element (custom element) | 8.59 | 9.68 | +1.09 | 5.01 | 4.59 | 13.92 |
| adapters: svgToIcon | 3.29 | 4.15 | +0.86 | — | — | 4.15 |
| adapters (all) | 4.15 | 5.01 | +0.85 | — | — | 5.01 |
| region (static import) | — | 9.96 | new | — | — | 9.96 |

"eager" = the entry's static import closure (what every page pays). "lazy" = chunks reached only via import() — the region normalizer, fetched on the first morph that involves a fill icon. "no-splitting" = a bundler that inlines dynamic imports (IIFE/UMD builds, single-file, some RN/Metro setups).

### 2. Time (ms, best of 3 per icon)

| set | n | normalize cell ¼ med | cell ⅛ (default) med | ⅛ p95 | ⅛ max | cell 1/16 med | resample med | plan med | plan max | frame µs (region) | frame µs (centerline) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| lucide/stroke | 20 | 0.38 | 1.00 | 2.19 | 2.19 | 2.84 | 0.110 | 0.102 | 0.72 | 15.4 | 9.2 |
| tabler/stroke | 20 | 0.36 | 0.92 | 2.20 | 2.20 | 2.57 | 0.108 | 0.085 | 0.27 | 14.7 | 9.7 |
| tabler/solid | 14 | 0.43 | 1.10 | 1.39 | 1.39 | 3.53 | 0.078 | 0.043 | 0.21 | 9.2 | — |
| heroicons/stroke | 19 | 0.37 | 0.91 | 1.58 | 1.58 | 2.41 | 0.122 | 0.061 | 0.24 | 13.9 | 12.9 |
| heroicons/solid | 19 | 0.44 | 1.20 | 1.97 | 1.97 | 3.78 | 0.076 | 0.043 | 0.18 | 9.2 | — |
| iconoir/stroke | 20 | 0.28 | 0.74 | 1.21 | 1.21 | 2.15 | 0.086 | 0.054 | 0.22 | 13.5 | 11.9 |
| material-symbols/line | 20 | 0.41 | 1.03 | 1.64 | 1.64 | 3.26 | 0.050 | 0.056 | 0.22 | 13.3 | — |
| material-symbols/solid | 14 | 0.32 | 0.96 | 1.51 | 1.51 | 3.05 | 0.057 | 0.045 | 0.19 | 9.1 | — |
| ph/line | 20 | 0.50 | 1.29 | 1.79 | 1.79 | 3.78 | 0.102 | 0.055 | 0.23 | 14.0 | — |
| ph/solid | 14 | 0.43 | 1.08 | 1.68 | 1.68 | 3.52 | 0.067 | 0.041 | 0.19 | 8.8 | — |
| ph/duotone | 7 | 0.59 | 1.45 | 1.89 | 1.89 | 4.08 | 0.115 | 0.058 | 0.22 | 17.8 | — |
| ri/line | 20 | 0.45 | 1.17 | 1.94 | 1.94 | 3.69 | 0.091 | 0.050 | 0.21 | 12.8 | — |
| ri/solid | 14 | 0.38 | 1.07 | 1.70 | 1.70 | 3.58 | 0.053 | 0.045 | 0.18 | 9.1 | — |
| mdi/line | 20 | 0.42 | 1.08 | 1.84 | 1.84 | 3.38 | 0.041 | 0.052 | 0.20 | 12.8 | — |
| mdi/solid | 11 | 0.37 | 1.04 | 1.25 | 1.25 | 3.51 | 0.058 | 0.041 | 0.07 | 8.9 | — |
| bi/line | 20 | 0.58 | 1.61 | 3.80 | 3.80 | 5.06 | 0.109 | 0.045 | 0.24 | 13.6 | — |
| bi/solid | 14 | 0.52 | 1.47 | 2.25 | 2.25 | 4.88 | 0.071 | 0.041 | 0.18 | 9.2 | — |
| mingcute/line | 19 | 0.37 | 0.93 | 1.73 | 1.73 | 2.74 | 0.106 | 0.053 | 0.22 | 13.4 | 9.3 |
| mingcute/solid | 13 | 0.43 | 1.09 | 1.65 | 1.65 | 3.59 | 0.067 | 0.046 | 0.19 | 9.4 | — |
| **all** | 318 | 0.41 | 1.07 | 1.84 | 3.80 | 3.38 | | 0.053 | 0.72 | 11.9 | 9.4 |

### 3. Accuracy vs cell size (IoU against a 1/64 reference grid)

| cell | IoU median | IoU p5 | IoU min | vertices median | normalize median ms |
|---|---:|---:|---:|---:|---:|
| 0.25 | 0.99752 | 0.99006 | 0.98790 | 87 | 0.41 |
| 0.125 | 0.99914 | 0.99647 | 0.99125 | 128 | 1.07 |
| 0.0625 | 0.99966 | 0.99855 | 0.99336 | 148 | 3.38 |

Worst at the default cell: bi/line:x 0.9913 · mdi/line:check 0.9930 · ph/line:x 0.9931 · mdi/line:x 0.9939 · ph/line:check 0.9939

### 4. Memory retained by the driver

| what | median | max |
|---|---:|---:|
| region d (chars) per icon | 1528 | 8434 |
| resampled region (Float64) per icon | 2.00 KB | 10.00 KB |
| plan + output buffers per pair | 20.00 KB | 60.00 KB |
