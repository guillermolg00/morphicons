# Regions are canon; the normalizer is a lazy chunk

Fill-drawn icons (Material Symbols, Heroicons solid, Phosphor, Remix, MDI, Bootstrap, MingCute…) can't fly on centerlines: their geometry is an outline, often a union of overlapping pieces with per-element fill rules, and a stroke icon drawn "filled" (Material outlined, Phosphor regular) looks like a stroke but isn't one. Any pair where one side is painted by fill now flies as **regions**: both endpoints are reduced to the visible surface (closed, non-overlapping contours, outers positive, holes negative, nonzero) and morph surface to surface. Stroke ↔ stroke keeps the centerline pipeline, byte-identical in behaviour.

We decided this is **canon, not an opt-in**: `<MorphIcon icon={open ? Close : Menu} />` must work for any two icons with no plugin, no registration call and no bundler integration (it has to work under webpack, Rollup, esbuild, Metro and plain `<script type="module">`, not just Vite). The capability is paid in two parts:

- **Static, in the driver (+1.0 KB gzip on dom and every binding):** only what must run before the chunk exists — the paint model (`paintOf`), paint writes on the element (a fill icon paints filled from its first frame), and the lazy loader with its wait budget and failure policy.
- **Lazy, a separate chunk (~5.3 KB gzip incremental, `morphicons/region`):** the normalizer (signed distance field + marching squares + corner recovery), the region planner and everything that can only run once they are around: region forms, samples and plans, cached by reference (the driver hooks `regionOf` / `regionPlan` / `regionPlanFrom`). It is loaded with `import()` the first time a morph involves a fill icon, or at mount when an icon is filled at rest. Stroke-only apps never download it.

## Considered Options

1. **Opt-in plugin / registration (`registerRegions()`), the ADR 0001 pattern.** Rejected for this capability. Unlike a foreign format, a fill icon is already a valid `IconInput` (an IconNode with `fill`), so silently flying it as centerlines would be a wrong result, not a missing feature. And forgetting the opt-in can't be detected at build time.
2. **Build-time normalization only (bundler plugin).** Rejected as the only path: it ties correctness to one toolchain. It stays available as an optimization, since `toRegion` is pure and its output (`data-region`) skips normalization at runtime.
3. **Everything static.** Rejected: +5.3 KB on every page for a capability many apps never use.
4. **Static driver half + lazy normalizer (chosen).**

## Consequences

- The dom and binding gates moved (+1.0 KB static). This is a renegotiation for a core capability, not an adapter: ADR 0001's "gates never move for an adapter" still holds.
- Network becomes part of the morph's first run. The policy:
  - A morph waits at most 100 ms for the chunk. Past that, or on a failed load, it jumps instantly. The load continues in the background, the resting icon upgrades to the exact region when the chunk lands, and the next morph flies.
  - Superseded requests are dropped.
  - A failure does not trigger an immediate second request; the next morph that needs the chunk retries.
  - Chromium caches a failed dynamic import for the document's lifetime, so a retry after a real failure is a cheap no-op until reload. Apps that can't accept that use `setRegionLoader(async () => region)` with a static import.
- Bundlers that don't code-split inline the chunk (Metro: the RN gate counts it).
- `setRegionLoader` / `preloadRegion` are the escape hatches: static import, CDN, prefetch on idle or hover.
- The winding is the picture under nonzero, so the planner keeps it right at every t, not only at the endpoints: a contour with holes is never duplicated (two copies wind +2 under a −1 hole and paint it), holes pair only with an overlapping hole of the paired outer and fly in that outer's frame, unmatched holes close on the first half of the flight and open on the second, and a vanishing piece takes its holes along one homothety. `bench/region-topology.ts` checks every region pair of the vendored sets.
- Bindings set `color` on the `<svg>` with `stroke`, so a filled path's `currentColor` is the prop. React Native has no cascade: its shim forwards paint through `setNativeProps`, republishes it on every render like `d`, and resolves `currentColor` / `inherit` to the prop.
