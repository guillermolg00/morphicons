# How morphicons works

```
icon A ─┐
        ├→ normalize → resample → match → align → PLAN → interpolate(t) → serialize → d
icon B ─┘                                          (cached per pair)
```

The core is pure functions: icon data in, `d` strings and numbers out, no DOM. The `dom` driver writes those strings to anything with `setAttribute` on one shared `requestAnimationFrame`, and every binding is a thin layer over the driver. That is why React Native is a shim (`setNativeProps`) rather than a port.

## 1. Normalize

Every SVG primitive becomes cubic Béziers: lines get collinear control points, quadratics are degree-elevated, circles are 4 cubics (`k ≈ 0.5523·r`), arcs are split into ≤ 90° slices (SVG spec F.6).

## 2. Resample

Each subpath is sampled at **N = 64 points evenly spaced by arc length** (8-point Gauss–Legendre per segment), so correspondence is index to index. Corners are kept as exact samples, which keeps them sharp at rest. Closed paths ignore their arbitrary `M` start point: only corners anchor, so two congruent loops sample the same.

## 3. Match

- **Direction:** both traversal directions of B are tried.
- **Start point:** for closed paths, all 64 circular offsets are tried.
- **Pieces:** subpaths pair by centroid distance and length. With unequal counts the extra pieces split off the nearest one instead of growing out of nothing.

## 4. Align (2D Procrustes)

The best similarity (rotation θ, scale σ, translation) mapping A onto B has a closed form in 2D, on centered points:

```
θ* = atan2(Σ aₓbᵧ − aᵧbₓ,  Σ aₓbₓ + aᵧbᵧ)
σ* = [cos θ*·(Σ aₓbₓ + aᵧbᵧ) + sin θ*·(Σ aₓbᵧ − aᵧbₓ)] / Σ‖aᵢ‖²
```

The residual after aligning measures shape difference: ≈ 0 means B is A rotated and scaled. Among the candidates from §3 the lowest `res + λ·|θ|/π` wins (λ = 0.05), so equal shapes pick the shortest turn. Alignment runs per subpath, so a hamburger folds instead of spinning as a block; when the whole icon is congruent, one shared θ applies to every piece.

## 5. Interpolate

Lerping coordinates collapses rotations (points cut the chord and the shape shrinks). morphicons interpolates each part in its own space instead:

```
P(t) = c(t) + σ*ᵗ · R(t·θ*) · [(1−t)·aᵢ + t·b̃ᵢ]      a, b̃ centered; b̃ = B brought into A's frame
```

A pure rotation stays rigid the whole way; a spring overshoot (t > 1) overshoots the rotation too.

## 6. Serialize and settle

In flight each subpath is written as `M … L … (Z)` with 2 decimals; that string is the frame's only allocation. On settle the driver writes the target's exact `d` (real curves, 4 decimals, identical on every JS engine so SSR hydrates cleanly).

## 7. Spring

`ẍ = k·(1 − x) − c·ẋ`, semi-implicit Euler at 240 Hz substeps.

| preset | k | c | feel |
|---|---|---|---|
| smooth | 170 | 26 | no overshoot |
| snappy (default) | 420 | 30 | fast, subtle overshoot |
| bouncy | 300 | 14 | playful |

A `morphTo` mid-flight re-plans from the shape on screen and keeps the velocity, so rapid toggles never jump.

## Fill icons: regions

A filled icon has no centerline to follow. When either side of a pair is filled, both are reduced to their visible surface: a signed distance field over every element, traced with marching squares into closed contours (outers wound positive, holes negative, nonzero rule). Contours then go through the same match → align → interpolate steps (λ = 0.3), with extra rules so holes never paint mid-flight, and with 128 samples for contours 64 can't follow (spirals, cogs).

This code lives in the `morphicons/region` chunk, loaded on demand. Why it is lazy and how loading fails safe: [ADR 0004](adr/0004-regions-are-canon-normalizer-is-lazy.md). Measurements: [bench/region-report.md](../bench/region-report.md).

## Cost

- Planning a stroke pair takes 0.01–0.4 ms; a fill icon's first normalization ~1 ms. Both are cached by reference.
- Frames allocate nothing but the `d` string.
- A hundred icons morphing at once share one animation loop.
