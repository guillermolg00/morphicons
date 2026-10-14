# How morphicons works

```
icon A ─┐
        ├→ normalize → resample → match → align → plan → interpolate(t) → d
icon B ─┘                                        (cached per pair)
```

The core is pure functions with no DOM: icon data in, `d` strings out. The driver writes them on one shared `requestAnimationFrame`; the bindings are thin layers over it.

## 1. Normalize

Every SVG shape becomes cubic Béziers: lines, quadratics, circles (4 cubics) and arcs (≤ 90° slices).

## 2. Resample

Each subpath becomes **64 points evenly spaced by arc length**, so point *i* of A maps to point *i* of B. Corners are kept as exact points, so they stay sharp at rest.

## 3. Match

Both directions of B are tried and, for closed paths, all 64 starting points. Subpaths pair by position and length; when the counts differ, extra pieces split off the nearest one.

## 4. Align

The rotation θ and scale σ that best map A onto B have a closed form in 2D (Procrustes), on centered points:

```
θ* = atan2(Σ aₓbᵧ − aᵧbₓ,  Σ aₓbₓ + aᵧbᵧ)
σ* = [cos θ*·(Σ aₓbₓ + aᵧbᵧ) + sin θ*·(Σ aₓbᵧ − aᵧbₓ)] / Σ‖aᵢ‖²
```

The leftover error says how different the shapes are; ≈ 0 means B is A rotated. The candidate with the lowest `error + 0.05·|θ|/π` wins, so equal shapes take the shortest turn.

## 5. Interpolate

Rotation, scale and shape are interpolated separately, so a rotation never collapses through the middle:

```
P(t) = c(t) + σ*ᵗ · R(t·θ*) · [(1−t)·aᵢ + t·b̃ᵢ]      b̃ = B brought into A's frame
```

On settle the driver writes the target's exact `d`.

## 6. Spring

`ẍ = k·(1 − x) − c·ẋ`. Presets: smooth (k 170, c 26, no overshoot), snappy (420, 30, the default) and bouncy (300, 14). A new `morphTo` mid-flight starts from the shape on screen and keeps the velocity.

## Fill icons

A filled icon has no line to follow. When either side is filled, both are reduced to their visible surface (a distance field traced into closed contours, holes wound the other way) and go through the same steps. Contours that 64 points can't follow (spirals, cogs) use 128.

That code is the `morphicons/region` chunk, loaded on demand: see [ADR 0004](adr/0004-regions-are-canon-normalizer-is-lazy.md) and the [measurements](../bench/region-report.md).

## Cost

Planning a pair takes well under 1 ms; a filled icon's first normalization about 1 ms. Both are cached. Frames allocate only the `d` string.
