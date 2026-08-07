# Mask adapter mechanism: referenced SVG masks, double-buffered

CSS-icon systems ship icons as `mask-image` styles precisely to keep the DOM free of SVG nodes — that is the optimization their users opted into, and the mask adapter's contract is to morph such elements **without changing that rendering model**. Of the three candidate mechanisms, we chose a hidden inline `<svg>` holding a PAIR of `<mask><path>` buffers per target: every frame the driver's `d` lands on the back buffer's live path and `mask-image` is re-pointed at it. The flip is load-bearing: WebKit does not reliably repaint a masked element when the *content* of its referenced mask mutates (a single live mask renders frozen in Safari until the flight ends), but flipping the property value (`url(#a)` ↔ `url(#b)`) forces reference re-resolution in every engine, at no extra cost where invalidation already worked.

## Considered Options

1. **Data-URI mask re-encoded per frame.** Rejected: CSS image loads — data URIs included — are asynchronous in Chromium, so the URI is replaced before it ever decodes and the element renders blank for the entire flight (found by eye; endpoints looked fine because the last URI gets time to decode at rest).
2. **Injecting an inline `<svg><path>` into the element.** Cheapest per frame and immune to masking quirks, but rejected on principle: it silently reverses the host model's optimization (icons in CSS, SVG-free DOM) for every morphing element. A user who is fine with inline SVG already has the bindings; an adapter that swaps the rendering model under the hood answers the wrong question.
3. **Referenced double-buffered masks (chosen).** Stays inside the host model; the only per-frame work is a path `d` write plus a style re-point.

## Consequences

- Per-frame cost on mask elements: the browser re-rasterizes the mask and repaints the masked box (main thread, no compositor-only path). Toggles and short lists are fine; icon-heavy views belong to the inline bindings.
- Two hidden mask nodes exist per target; the returned target exposes `dispose()` to remove them on unmount.
- The buffer flip is invisible in behavior and pinned by tests; removing it re-breaks Safari silently, which is why it is documented here and in the module.
