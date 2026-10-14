<p align="center">
  <a href="https://www.morphicons.com">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
      <img src="assets/logo-light.svg" alt="morphicons" width="96">
    </picture>
  </a>
</p>

<h1 align="center">morphicons</h1>

<p align="center">
  <a href="https://www.morphicons.com"><strong>morphicons.com</strong></a> — live playground
</p>

<p align="center">
  <a href="https://github.com/sponsors/guillermolg00">
    <img src="https://img.shields.io/badge/%E2%98%95%20Buy%20me%20a%20coffee-EA4AAA" alt="Buy me a coffee — sponsor morphicons on GitHub Sponsors">
  </a>
</p>

Morph any SVG icon into any other with spring physics. Lucide, Tabler, Heroicons, Material Symbols, Phosphor or your own paths, stroked or filled. Rotations are never declared by hand: they come out of the math. Zero runtime dependencies.

```tsx
import { MorphIcon } from "morphicons/react";
import { Menu, X } from "lucide"; // icon data, not components

<button onClick={() => setOpen(o => !o)} aria-expanded={open}>
  <MorphIcon icon={open ? X : Menu} />
</button>
```

Change the prop and the icon morphs. No wrappers, keys or per-pair configuration.

## Install

```bash
npm install morphicons
```

ESM only. Framework peers are optional, each needed only by its own entry: `react` ≥ 18, `vue` ≥ 3.3, `svelte` ≥ 5, `react-native` ≥ 0.71 with `react-native-svg` ≥ 14.

**Icons are data.** `MorphIcon` takes an `IconNode` (Lucide's data format) or a `d` string. For Lucide, import from `lucide`, not `lucide-react`: component packages can't be morphed. Both can live in the same app; keep their versions aligned.

| entry | what it gives you |
|---|---|
| `morphicons/react` | `<MorphIcon>` for React and Next.js |
| `morphicons/vue` | `<MorphIcon>` for Vue 3 and Nuxt |
| `morphicons/svelte` | `<MorphIcon>` for Svelte 5 and SvelteKit |
| `morphicons/react-native` | `<MorphIcon>` over react-native-svg |
| `morphicons/astro` | `<MorphIcon>` for Astro, no island needed |
| `morphicons/element` | `<morph-icon>` custom element for plain HTML |
| `morphicons/dom` | `createMorph()`, the vanilla driver |
| `morphicons/adapters` | `svgToIcon`, `maskTarget`, `canvasTarget` |
| `morphicons` | the pure core: plans and paths, no DOM |
| `morphicons/region` | the fill normalizer (loaded on demand, see [Fill icons](#fill-icons)) |

## Usage

Every binding has the same three modes:

```tsx
import { MorphIcon, type MorphHandle } from "morphicons/react";

// 1. Uncontrolled: change the prop and it animates
<MorphIcon icon={open ? X : Menu} />

// 2. Controlled: you drive the progress (gestures, scroll)
<MorphIcon from={Menu} to={X} progress={0.4} />

// 3. Imperative
const ref = useRef<MorphHandle>(null);
<MorphIcon ref={ref} icon={Menu} />
ref.current?.morphTo(Check); // animates
ref.current?.set(X);         // jumps
```

| prop | |
|---|---|
| `size`, `color`, `strokeWidth`, `absoluteStrokeWidth` | as in lucide-react; any other `<svg>` attribute passes through |
| `spring` | `"snappy"` (default), `"smooth"`, `"bouncy"` or `{ stiffness, damping }` |
| `reducedMotion` | `"never"` (default), `"user"` (follow the OS setting) or `"always"` (never animate) |
| `label` | accessible name; without it the icon is `aria-hidden` |

Server rendering emits the exact static SVG, so nothing flashes on hydration. A morph started mid-flight keeps the current velocity.

### Lifecycle contract

The same in every binding:

- Mounting without an icon is fine. The first icon renders without animating; `morphTo` before it acts as `set`.
- While `from` and `to` are both set, they win over `icon`.
- Leaving controlled mode and coming back renders like a fresh mount.

### Vue, Svelte, React Native

```vue
<MorphIcon :icon="open ? X : Menu" />           <!-- Vue: template ref → morphTo / set -->
```

```svelte
<MorphIcon icon={open ? X : Menu} />            <!-- Svelte 5: bind:this → morphTo / set -->
```

React Native uses the React API as is. It needs Metro with package `exports` (the default since React Native 0.79).

### Astro and plain HTML

The server renders the SVG; in the browser it upgrades to `<morph-icon>`, with no framework runtime.

```astro
---
import MorphIcon from "morphicons/astro";
import { Menu } from "lucide";
---

<MorphIcon icon={Menu} id="menu-icon" />

<script>
  import { X } from "lucide";
  import type { MorphIconElement } from "morphicons/element";
  document.querySelector<MorphIconElement>("#menu-icon")!.morphTo(X);
</script>
```

Anywhere else:

```html
<script type="module">
  import { defineMorphIcon } from "morphicons/element";
  defineMorphIcon();
</script>

<morph-icon icon="M4 6h16M4 12h16M4 18h16" label="Menu"></morph-icon>
```

Attributes take `d` strings; the `icon`, `from` and `to` properties take any icon, `progress` a number. The element has `morphTo()` and `set()`.

### Vanilla

```ts
import { createMorph } from "morphicons/dom";

const m = createMorph(pathEl, Menu); // pathEl: an SVG <path>
m.morphTo(X, "snappy");              // animates
m.set(Check);                        // jumps
m.seek(X, 0.4);                      // frozen at 40 %
m.destroy();
```

## Fill icons

Stroke icons morph along their lines. When either icon is filled (Material Symbols, Heroicons solid, Phosphor fill…), both are turned into filled shapes and morph shape to shape. There is nothing to configure.

That code (~5.4 KB gzip) is a separate chunk, fetched the first time a filled icon shows up; apps that only use stroke icons never download it. Until it arrives, a filled icon renders in a close approximation, and a morph waits at most 100 ms before falling back to a simple shrink-and-grow transition. To take the network out of the picture:

```ts
import { preloadRegion, setRegionLoader } from "morphicons/dom";
import * as region from "morphicons/region";

setRegionLoader(async () => region); // bundle it: no extra request
// or call preloadRegion() early (on idle, on hover) to fetch it ahead of time
```

Known limit: on a random sample of filled pairs, about 4 % briefly paint a little outside the shape mid-flight ([report](bench/region-report.md)).

## Format adapters

```ts
import { canvasTarget, maskTarget, svgToIcon } from "morphicons/adapters";
```

- **`svgToIcon(markup)`** turns SVG markup (an Iconify body, a full `<svg>`, a `<path>`) into an icon: transforms baked, re-gridded to 24 from its `viewBox`. Call it once at module scope.
- **`maskTarget(el)`** morphs CSS-mask icons in place (UnoCSS `presetIcons`, Tailwind icon plugins): `createMorph(maskTarget(span), icon)`. Call `target.dispose()` after `morph.destroy()`. The browser repaints the mask every frame: fine for toggles, inline SVG stays leaner for icon-heavy views.
- **`canvasTarget(canvas | ctx)`** draws the morph into a canvas or 2D context: maps, charts, WebGL textures, workers. `onWrite` tells a host with its own render loop when to repaint.

Each adapter tree-shakes on its own. `maskTarget` and `canvasTarget` draw strokes only.

## Icon library compatibility

Any set drawn on a 24×24 grid works as is. For other grids, convert once with `fitIcon`:

```ts
import { fitIcon } from "morphicons";

const search = fitIcon(carbonSearch, 32); // 32×32 → 24×24, returns a d string
```

An `IconNode` may use `path`, `line`, `circle`, `ellipse`, `rect`, `polyline` and `polygon`, with no `<g>` or `transform`. For markup that has them, use `svgToIcon`.

## How it works

Every icon is resampled into evenly spaced points. For each pair of pieces, morphicons solves the rotation, scale and translation that best map one onto the other (2D Procrustes, in closed form), then interpolates rotation, scale and shape separately. So two icons that are the same shape rotated morph as a pure rotation: arrow-right turns 90° into arrow-down without anyone declaring it.

The math, with formulas: [docs/how-it-works.md](docs/how-it-works.md). Design decisions: [docs/adr](docs/adr).

## Size

gzip, enforced in CI:

| | KB |
|---|---|
| `morphicons` (core) | 6.7 |
| `morphicons/dom` | 9.2 |
| `morphicons/react` · `vue` · `svelte` | 10.1 · 10.1 · 11.0 |
| `morphicons/element` | 10.9 |
| `morphicons/react-native` (fill chunk included) | 15.7 |
| fill chunk, on demand | +5.4 |
| `svgToIcon` · `maskTarget` · `canvasTarget` | 4.2 · 0.7 · 0.5 |

## Development

```bash
bun install
bun test
bun run typecheck
bun run lint
bun run build && bun run size
bun run play   # playground → http://localhost:3000
```

Playground icons belong to their authors: [Lucide](https://lucide.dev) (ISC), [Feather](https://feathericons.com) (MIT), [Tabler](https://tabler.io/icons) (MIT).

---

MIT © [Guillermo](https://guillermolg.com) — made by [guillermolg.com](https://guillermolg.com)
