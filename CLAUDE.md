# morphicons

Universal morphing library for stroke-based icons (Lucide, Tabler, Heroicons, Iconoir; off-grid packs via `fitIcon`): any icon morphs into any other with spring physics and rotations that emerge from the math. **`README.md` is the source of truth** — it documents the API, the architecture and the full math pipeline with formulas.

## Status

The library is complete: `src/core/` (pure pipeline: parse → normalize F.6 → GL8 resampling with anchored corners and intrinsic sampling for closed paths → surjective matching with greedy guards → Procrustes with λ tie-break + circular correspondence + global hybrid → polar interpolation → serialization with Z → spring), `src/dom/` (`createMorph` with morphTo/set/**seek**/progress/destroy + singleton rAF scheduler + WeakMap caches + canonical snap + reduced-motion), `src/react/` (`MorphIcon` with 3 modes + exact SSR + a11y + lucide-react drop-in), `src/vue/` (`MorphIcon` for Vue 3: same 3 modes + exact SSR + a11y; plain render function with `h` — no SFC, no JSX, no Vue compiler), `playground/` (multi-library demo, validated by eye).

- `bun test` → 92 tests / ~13,509 asserts. Performance: plan() 0.01–0.42 ms. Gzip size: core 6.60 / +dom 7.04 / +react 7.77 / +vue 7.81 (gates 7 / 7.5 / 8.5 / 8.5).
- Published on npm as **morphicons** (public, OIDC trusted publishing): bumping `version` in package.json on main IS the release trigger (publish.yml compares against the registry, publishes, tags, and then points `website/` at the new version — the site consumes the published package with an exact pin, weekly dependabot on `/website` as backstop).
- Not done (no date): React Native driver (possible thanks to the DOM-free core), golden screenshots in CI.

## Commands

```bash
bun test                   # full suite (92 tests) — always green
bun run typecheck          # strict ×4: root (core+dom WITHOUT lib DOM), playground, react, vue
bunx biome check --write . # lint + format
bun run build              # tsdown → dist/ (entries index, dom, react, vue; shared core chunk)
bun run size               # size gates (7 / 7.5 / 8.5 / 8.5 KB gzip)
bun run play               # playground → http://localhost:3000 (HMR)
node spike/test.js         # original spike spec → ALL OK
bun playground/extract-vendor-icons.mjs  # regenerate vendored Feather/Tabler icons
```

## Hard rules (non-negotiable)

- **Zero runtime dependencies**. None. devDeps yes; `react` (>= 18) and `vue` (>= 3.3) are **optional** peers, only for `./react` and `./vue`.
- **The core never touches the DOM**: pure functions consume icon data and produce `d` strings and numbers. DOM only in `src/dom` (via ambient declares — compiles without `lib: DOM`); React only in `src/react`; Vue only in `src/vue`. The **root** tsconfig deliberately omits `lib: DOM` and excludes `src/react` + `test/react` + `src/vue` + `test/vue`; the playground/react/vue/build tsconfigs add DOM (and jsx where needed). `tsconfig.build.json` exists ONLY so tsdown can emit types — the separation is enforced by `bun run typecheck`.
- ESM only, TypeScript strict, `sideEffects: false`, subpath exports (`.`, `./dom`, `./react`, `./vue`).
- Size budget: **anti-regression tripwire, not a straitjacket** — gates carry ~10% headroom over what's measured. If a real capability needs more, the number is renegotiated; growing unnoticed is what's not accepted.
- Accepts `IconNode = [tag, attrs][]` (Lucide's data format) structurally typed — Lucide is **not** a dependency, not even a peer. `IconNodeAttrs` admits `undefined` on purpose (lucide's SVGProps includes it; the runtime treats it as an absent attr).
- The driver's `PathEl` is structural (`{ setAttribute }`): dom tests use a fake and a rAF injected into globalThis — no jsdom. Keep it that way.

## Toolchain

Bun (runtime, test runner, package manager and playground dev server) · Biome (lint + format; `playground/vendor-icons.ts` excluded as generated) · tsdown (build) · TypeScript 7 (tsgo; the "experimental" notice when emitting types is benign — pinning to 5.x is a one-liner if it gets in the way). Ask before replacing any of these.

## Invariants (pinned by tests, never break)

From `test/invariants.test.ts`:

1. arrow-right → arrow-down: θ = 90°, σ = 1, res = 0 per subpath — **emergent** rotation group, no hand-declared groups.
2. plus → x: |θ| = 45°, res ≈ 0, σ ≈ 1.212.
3. menu → x: **minimal**-rotation folds (±45°, never 135°) — the orientation tie-break is `score = res + 0.05·|θ|/π`. This λ exists because shapes symmetric under inversion (lines) tie in residual; see README "Minimal-rotation tie-break".
4. Exactness at the endpoints: `interp(plan, 0) = A` and `interp(plan, 1) = B` with error < 1e-9.
5. Anchored corners: the original path's vertices are **exact** sample points after resampling (fidelity at rest).
6. Surjective matching: with p ≠ q subpaths, none appears or disappears — leftovers duplicate in place ("cell division"), never collapse to a point.
7. Interruptions: re-planning from the intermediate shape preserves spring velocity; never a NaN in any frame.

From `test/closed.test.ts`:

8. **Intrinsic** sampling of closed paths (anchors = corners only, not the M point): the same square with a different start point gives res ≈ 0 and θ ≈ 0.
9. square → diamond: |θ| = 45°, σ = √½ — emergent rotation in closed paths too, via circular correspondence (N offsets × 2 directions over the closed cloud).
10. Topology in flight: closed↔closed flies with `Z`; closed→open flies open (the loop opens at the optimal cut chosen by the circular search).
11. Block coherence (global hybrid): if the whole icon is congruent (global res < 5e-3), all subpaths share the SAME (θ, σ) — e.g. both arrow subpaths spin the same way — **and the block is rigid mid-flight** (block transport): centroids ride the shared similarity around the global centroid instead of lerping, so cross-subpath distances hold at t = 0.25/0.5/0.75, not only at the endpoints. Non-hybrid plans keep the plain centroid lerp (`block: null`).

From the driver and the bindings (`test/dom.test.ts`, `test/react/morphicon.test.tsx`, `test/vue/morphicon.test.ts`):

12. Canonical snap at rest: input string **verbatim**; IconNode → `cubicsToPathD`. In flight, M/L polylines (+Z) with never a NaN.
13. Exact interruption: after a mid-flight `morphTo`, a frame with dt = 0 paints the **identical** intermediate shape (the snapshot is the plan's source).
14. `seek` is deterministic, does not start the scheduler, and a later `morphTo` takes off from the frozen shape. `progress =` equals seek on the active target.
15. Singleton scheduler: N flying instances share ONE rAF; when all settle, it stops (zero live timers).
16. SSR: `MorphIcon`'s initial `d` is computed once with the pure core and the framework (React/Vue) never rewrites it; `label` → `role="img"` + `<title>`, no label → `aria-hidden`. Pinned for both bindings — the Vue suite mirrors the React one.

## Working method

A morph's quality is validated by eye, not just asserts. After every pipeline change: run the suite **and** open the playground (`bun run play`) to feel the key pairs (menu↔x, →↔↓, x↔check, plus↔x, circle↔square, square↔diamond, sun↔moon, settings↔aperture). If something looks off, describe it, encode it as a metric or tie-break (as happened with λ) and add the test that pins it. Intermediate states matter as much as the endpoints: the playground scrubber freezes exact t ≈ 0.25 / 0.5 / 0.75.

## Structure

```
src/core/    parse.ts normalize.ts resample.ts plan.ts interpolate.ts serialize.ts spring.ts types.ts
src/index.ts core consumer surface (what the 7 KB gate measures); introspection
             utilities (parsePath, procrustes, alignPair, detectCorners, arcLength,
             KAPPA, rotatePts…) are imported from src/core/* directly
src/dom/     createMorph + singleton rAF scheduler + canonicalD (ambient declares, no lib DOM)
src/react/   MorphIcon (uncontrolled / controlled / imperative) + MorphHandle + SSR
src/vue/     MorphIcon for Vue 3 (same 3 modes) + MorphHandle + SSR — render function, no SFC/JSX
test/        Bun suite — invariants (1–7), closed (8–11), dom (12–15), react/ + vue/ (16), unit tests
spike/       core.js + test.js from the original spike (historical reference; don't
             delete without asking)
playground/  real demo: index.html + main.ts (driver + core), vendor-icons.ts (GENERATED),
             extract-vendor-icons.mjs, own tsconfig with lib DOM
```
