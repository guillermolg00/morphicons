# Region morphing: report (branch `feat/region-morphing`)

Everything below was measured on this branch:
- the CLI benchmark (`bun run bench:regions`, JSC, raw output at the end);
- the playground (`bun run play:regions`) running in Chrome 152 against the real server, including its network lab.

Machine: Linux x64, 12 threads. Icons: 318 upstream Iconify icons, 10 libraries, 19 sets (stroke / fill-built "line" / solid / duotone).

## TL;DR

| | result |
|---|---|
| Static cost (every page) | **+1.7 KB gzip** on dom and on every binding (size-limit: dom 7.12 → 8.81; react 8.01 → 9.70). +1.07 of it is the region model; +0.6 the fixes after review (§1) |
| Lazy cost (first morph with a fill icon) | **4.92 KB gzip / 4.43 KB brotli** incremental chunk (esbuild: dom + a static region import − dom; was 4.13 / 3.75 before the topology rules and the moved caches). Fetch 2 ms on the tailnet, parse + eval 0.6 ms in Chrome desktop, measured on the 4.13 KB chunk |
| Stroke-only apps | download **0 bytes** of the chunk and never write paint (tested) |
| Normalize (once per icon, cached) | median **1.08 ms**, p95 1.83, max 3.24 (JSC). Browser (V8): median 0.6, max 2.3 |
| Plan (once per pair, cached) | median **0.05 ms**, max 0.72 |
| Frame (every rAF) | **11.9 µs** region vs 9.4 µs centerline (median). 20 icons morphing at once ≈ 0.25 ms per frame |
| Fidelity vs the browser rendering the ORIGINAL svg | IoU median **0.9987**, worst **0.983** (lucide circle, a thin ring). 0 of 322 icons below 0.98 |
| Discretization (cell ⅛ vs a 1/64 reference) | IoU median 0.99917. Mean boundary deviation ≈ 0.01 units (≈ 1% of a pixel at 24 px) |
| Robustness | 318/318 icons normalize, sample and plan; 0 NaN; winding locked at every t (tested). Held out: 9,998 of 10,000 random Iconify icons normalize (2 use `<use>`, rejected by `svgToIcon`), 0 NaN, 0 non-canonical regions (§8) |
| Topology (4798 region pairs) | **0** endpoints that don't render their icon (was 1057 of 5267: the bell video). **2** pairs paint > 1% of ink outside the surface mid-flight, worst 1.3%, both outer folds (168, worst 9.2%, at the first measurement over these pairs: §4). 65 of 4590 same-concept pairs turn > 46°, almost all moons drawn rotated (was 237) |
| Held-out corpus (§8) | the planner was tuned on the vendored icons, and it shows: random pairs of unseen icons paint > 1% outside the surface mid-flight in **5–6%** of pairs (vs 0.5% on the tuning icons), almost all outer folds of a few frames. 0 broken endpoints, 0 throws |
| Color | every binding paints a filled path in the `color` prop; React Native forwards paint (was: CSS color on the web, stroked outline on RN) |

## 1. Weight

Measured with esbuild over `dist/` like an app build: code splitting on, minified, gzip -9. Baseline is `main` (38d2a72) built the same way.

- `size-limit` gates were renegotiated (~10% headroom) and all 14 pass.
- The RN gate now **counts** the region chunk: Metro inlines `import()`.
- New gate: `morphicons/region` (standalone 10.26 KB, gate 10.7; ~5 KB incremental over the driver). The static gates were tightened back to ~0.4–0.6 KB headroom after the move below.

Where the static bytes come from: the paint model, paint writes, and the loader with its failure and budget policy: what has to run before the chunk exists (+1.07 KB). The fixes after review added +0.6 KB, each measured by removing it alone (esbuild, gzip -9, dom entry):

| fix | gzip | what it buys |
|---|---:|---|
| fallback flight | ~0.25 KB | a slow or failed chunk animates (old shape shrinks, new one grows) instead of jumping |
| Chromium retry | 0.19 | the chunk loads again after a transient failure (§3) |
| idle prefetch + Save-Data | 0.09 | the chunk leaves the mount's critical path; no bytes under Save-Data |
| duotone filter | 0.07 | a translucent layer is no longer painted opaque before the chunk (48 of 2,010 fill icons, §5) |
| rest look | 0.04 | stroke / fill + stroke / evenodd before the chunk (45 of 2,010, §5) |
| SSR paint | 0.03 | a fill icon is filled in the server markup, not stroked until hydration |
| stale-load check | 0.02 | a hanging load no longer costs 100 ms on every morph |

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
| Critical UI that must never jump | `setRegionLoader(async () => region)` with a static `import * as region from "morphicons/region"`: +4.9 KB eager, no network |
| Many fill icons mounted at once | Nothing to do: one shared load (single promise), N icons → 1 request |

## 3. Network edge cases (measured in the network lab)

The server throttles the chunk with a cookie; the page is the real build with the real dynamic import.

| case | what happens (measured) | before this branch's fixes | mitigation / most efficient solution |
|---|---|---|---|
| fast / cached (≤ 100 ms) | flies; start delay = load time (2–12 ms on the tailnet) | same | none needed |
| slow (400 ms / 1.5 s / 5 s) | **flies the fallback at +100 ms** (old shape shrinks, new one grows), rest upgrades to the exact region when the chunk lands, next morphs fly. Measured in the lab before the fallback: jump at +102 ms, upgrade at +415 / +1513 ms | waited the full load time with no visual response, then flew late | budget + fallback (fixed); a fill icon prefetches on idle at mount |
| hang (captive portal, dead TCP) | first morph: fallback at +100 ms; later ones fly the fallback at once (the load is older than the budget); never stuck (tested) | **icon stuck forever** on the old shape (bug, fixed) | fixed |
| fail (500 / offline) | fallback at once; **one** request per need | the jump fired a 2nd request in the same instant (retry storm, fixed) | fixed |
| fail, then the network comes back | **Chromium caches the failed `import()` for the document's lifetime** (Chromium 152: a second `import()` fails with no request). The next need re-runs the chunk as a module script under `url#<time>`: a new module-map key, the same URL for the server. Verified end to end in Chromium 152 with `dist/`: 503 → fallback flight, no second request in that instant; next morph → `region.js#…` → region flight | icons stayed jumps until reload | fixed where the error names the URL (Chromium, Firefox). Safari names none; a CSP / Trusted Types policy blocking module scripts blocks the retry. Both: static import via `setRegionLoader` |
| stale deploy (old HTML, hashed chunk deleted → 404) | same as fail | same | keep old hashed assets for N deploys / skew protection (Vercel), or a static import |
| superseded request (A → fill, then → stroke before load) | latest wins, the stale flight is dropped (tested) | same | none needed |
| bundler without splitting (IIFE/UMD, single-file) | inlined: no network, +4.9 KB eager | n/a | fine as is |
| React Native / Metro | inlined (gate counts it). Paint goes through the shim (`setNativeProps`), republished on every render like `d`; `currentColor` / `inherit` resolve to the `color` prop | fill icons drew as the stroked outline of their region (fixed) | none needed. Not verified on a device: the Path mock replays Fabric commits |
| SSR | every binding renders a fill icon's paint in the server markup (its rest look, §5); the client prefetches on idle and upgrades the rest `d` to the region. Pinned by SSR tests in React, Vue, Svelte and react-native-web; `<morph-icon>` adopts a server-filled path as a fill icon (tested) | the server markup drew fill icons stroked until hydration | hydration-safe: the driver writes after mount |
| CSP / CDN | the chunk is a same-origin module script; it needs `script-src 'self'` (or `'strict-dynamic'` from a nonced entry). A cross-origin CDN must send CORS headers | n/a | config only |
| HTTP/1.1 congestion at startup | the prefetch waits for idle (`requestIdleCallback`, 2 s timeout) | n/a | fine as is |
| Save-Data | no prefetch; the first morph that needs the chunk loads it (fallback if it takes > 100 ms) | prefetched at mount | fine as is |

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
| stronger upright tie-break for outers (λ 0.05 → 0.3) | 4798 | 0 | 19 (2.0%) | 65 of 4590 |
| a vanishing hole moves with its outer's local blend; a matched hole that strays at t = ¼, ½, ¾ splits into one that closes and one that opens | 4798 | 0 | **2 (1.3%)** | **65 of 4590** |

¹ The check's own artifact: one shared sampling phase on both axes put 45° edges exactly on pixel centers. Both benches now use a different phase per axis.

The 2 left are not holes: the outer folds over itself for a few frames (heroicons/solid:check → plus, 1.3% at t = 0.375, has no hole at all; mdi/line:home → iconoir/stroke:home, 1.2% at t = 0.25). On icons the planner never saw, folds are the main defect left (§8). The complete fix is drawing holes as a mask (outer ∖ ∪ holes) instead of nonzero winding, plus a fold-aware matcher; that means more DOM per icon and a `<mask>` in React Native, so it is not done.

The spins (65) are mostly moons drawn rotated across libraries. A stronger tie-break (λ 0.3 → 0.4) fixes the two home flips but was not measured on the wide corpus, so it is not committed.

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
  - Duotone layers with opacity < 0.5 are skipped by design, before the chunk too.
- **Before the chunk** (what a fill icon rests on until the chunk lands, `bun run bench:wide`, IoU < 0.99 against its region, 2,010 Iconify fill icons): one merged fill 118 → translucent layers dropped 70 → closest single look (stroke / fill + stroke / evenodd) **25** (1.2%). Held out (6,685 fill icons, seed 3): 95 (1.4%). What's left are icons whose elements cancel (all-evenodd XOR, opposite winding) or mix looks one `<path>` can't give. One regressed: iconoir:mail-out-solid 0.93 → 0.27 (one stroke-only element turns the whole icon to stroke); bi:music-note 0.999 → 0.918. The exact region replaces the rest when the chunk lands.

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

## 8. Held-out corpus (overfitting check)

Every heuristic above was tuned on the 318 vendored icons. `bun run bench:wide [perSet] [pairs] [seed]` draws a seeded sample of the full Iconify sets installed as devDeps (~53k icons, 10 sets), runs the same checks and the same pairs procedure over the vendored icons as a control. Two runs on the final code: seed 1 (300 per set) and seed 3 (1,000 per set, never looked at while tuning).

| | seed 1 · 3,000 icons · 3,000 pairs | seed 3 · 10,000 icons · 6,000 pairs | vendored control (3,000 / 6,000 pairs) |
|---|---|---|---|
| `toRegion` throws / NaN / empty | 0 / 0 / 0 | 0 / 0 / 0 (2 rejected earlier by `svgToIcon`: `<use>`) | 0 / 0 / 0 |
| non-canonical region (winding ∉ {0, 1}) | **0** (3 before the fix below) | **0** | 0 |
| region vs per-element truth, IoU at 96 px | median 0.9994, min 0.9852 | median 0.9994, min 0.9844 | |
| boundary deviation (units of 24) | median 0.005, p95 0.036, max 0.067 | median 0.006, p95 0.042, max 0.129 | |
| `toRegion` time (JSC, machine under load) | median 1.35 ms, p95 2.5, max 9.2 | median 1.46 ms, p95 2.6, max 8.3 | |
| rest before the chunk, IoU < 0.99 | 25 of 2,010 fill icons | 95 of 6,685 | |
| broken endpoints | 0 | 0 | 0 |
| pairs painting > 1% outside the surface mid-flight | 151 (5.0%): 20 holes, 136 folds | 366 (6.1%): 42 holes, 333 folds | 15 / 34 (0.5–0.6%), all folds |
| landing (64 samples per contour vs region), IoU < 0.95 | 50 (1.7%) | 180 (1.8%) | |
| plan time | median 0.09 ms, p95 0.24, max 1.7 | median 0.10 ms, p95 0.25, max 1.6 | |

What it found and what was done:
- **Touching contours (fixed).** Integer coordinates (MingCute, MDI) put grid nodes exactly on shape edges, so two contours shared crossing points and nesting by a vertex was a coin flip: a lens sparkle came out as a hole, a balloon's panels and three MingCute line icons wound 2 or −1. Crossings are now kept 10⁻⁵ of a cell off the nodes: contours never touch and any vertex nests exactly. Pinned by two tests with the real MDI and MingCute paths.
- **Hole leaks (improved).** The vanishing-hole and stray-hole rules of §4 took seed 1 from 52 to 20 pairs (182 → 151 in total).
- **Outer folds (not fixed).** Outers of different structure (paper clip, spiral, snowflake, cogs) fold over themselves for a few frames: 4.5–5.5% of random unseen pairs, against 0.5% on the tuning icons. That gap is the overfitting. They are slivers, not stuck states; the fix is the mask rendering of §4 or a fold-aware matcher.
- **Landing snap (kept).** A flight lands on 64 samples per contour, then snaps to the exact region. For spirals, snowflakes and cogs with many teeth, 64 points miss detail (IoU < 0.95 on 1.7%), so the last frame jumps a little. 96 samples cut it to 2 of 3,000 but double the plan time and frame cost of every pair, so 64 stays.

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
