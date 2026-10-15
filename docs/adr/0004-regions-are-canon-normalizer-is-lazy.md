# Regions are canon; the normalizer is a lazy chunk

Filled icons (Material Symbols, Heroicons solid, Phosphor…) can't morph along centerlines: their geometry is an outline, often overlapping pieces with their own fill rules. So any pair with a filled side morphs as **regions**: both icons are reduced to their visible surface (closed contours, outers positive, holes negative, nonzero) and morph surface to surface. Stroke ↔ stroke is unchanged.

This is **canon, not an opt-in**: `<MorphIcon icon={open ? Close : Menu} />` must work for any two icons, with no plugin, registration or bundler setup. The cost is split:

- **Static, in the driver (+2.1 KB gzip on dom and every binding):** what must work before the chunk exists: the paint model, the rest look of a filled icon (SSR included) and the loader.
- **Lazy (`morphicons/region`, ~5.4 KB gzip):** the normalizer (distance field + marching squares) and the region planner, loaded with `import()` the first time a filled icon shows up. Stroke-only apps never download it.

## Considered Options

1. **Opt-in registration (`registerRegions()`), like ADR 0001's adapters.** Rejected: a filled icon is already a valid `IconInput`, so forgetting the opt-in gives a wrong result, not a missing feature, and nothing catches it at build time.
2. **Build-time normalization only.** Rejected: it ties correctness to one toolchain. `toRegion` stays available for it.
3. **Everything static.** Rejected: +5.4 KB on every page.
4. **Static half + lazy chunk (chosen).**

## Consequences

- **Before the chunk**, a filled icon rests in the closest look one `<path>` can give it (fill, stroke, or both). 14 of 2,010 Iconify filled icons look visibly off until the chunk lands.
- **The network is part of the first morph.** A morph waits at most 100 ms for the chunk, then flies a fallback (the old shape shrinks, the new one grows). Filled icons prefetch the chunk on idle, never under Save-Data.
- **Retry.** A failed load is retried by the next morph that needs it: `import()` first, then the chunk as a module script with a fresh `#fragment` (Chromium ≤ 155 and Safari 26.2–27 cache a failed `import()`). Safari's error has no URL, so it is read from the loader's source. A CSP that blocks module scripts blocks this step. `setRegionLoader(async () => region)` with a static import avoids the network entirely. The step can go once browsers that follow whatwg/html#10327 are the floor.
- **Metro doesn't split**, so React Native includes the chunk (15.9 KB).
- **Winding holds at every t, not only at the endpoints:** a contour with holes is never duplicated, holes pair only inside their outer, and unmatched holes close or open with it.
- **Known limit:** 3.8–4.5% of random unseen pairs paint slightly outside the surface for a few frames, almost always an outer folding over itself. Fixing it fully needs a mask per icon, so it is deferred.
- Contours that 64 samples can't follow (spirals, cogs; ~10% of icons) use 128, at about twice the plan and frame cost.
- Bindings set `color` on the `<svg>`, so a filled path's `currentColor` is the prop; React Native forwards paint through `setNativeProps`.
