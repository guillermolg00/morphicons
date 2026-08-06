<!-- Svelte 5 binding: MorphIcon with the three modes — uncontrolled (change
  the `icon` prop and morphicons animates), controlled (`from`/`to`/`progress`,
  no spring) and imperative (`bind:this` → { morphTo, set }).

  Clean SSR by construction: the initial `d` is computed ONCE with the pure
  core at init (server and client produce the same string → hydration without
  mismatch) and stays a plain const, so Svelte never rewrites the attribute —
  the morph mutates it externally via createMorph. Thin shell on purpose: all
  logic lives in shared.ts (typechecked); this file is only compiled.
  Drop-in with lucide-svelte: same presentation props. -->
<script lang="ts">
import { onMount, untrack } from "svelte";
import {
  computeInitialD,
  createController,
  type IconInput,
  type MorphIconProps,
  type MorphOptions,
  type SpringPreset,
} from "./shared";

let {
  icon,
  from,
  to,
  progress,
  spring,
  reducedMotion,
  size = 24,
  color = "currentColor",
  strokeWidth = 2,
  absoluteStrokeWidth = false,
  label,
  ...rest
}: MorphIconProps = $props();

// svelte-ignore state_referenced_locally — mount-time value on purpose: the
// initial d must stay a constant so Svelte never rewrites the attribute.
const initialD = computeInitialD({ icon, from, to, progress });

let pathEl: SVGPathElement | undefined = $state();
// svelte-ignore state_referenced_locally — init-time values on purpose: they
// seed the controller's watch baselines so the first $effect run is a no-op.
const ctrl = createController({ icon, from, to, progress, reducedMotion });

onMount(() => {
  if (pathEl) ctrl.mount(pathEl, { icon, from, to, progress, reducedMotion });
  return () => ctrl.destroy();
});

// Prop changes: one watcher owns the mode logic (controlled wins — change
// detection and precedence live in shared.ts).
$effect(() => {
  const next = { icon, from, to, progress, spring, reducedMotion };
  untrack(() => ctrl.watch(next));
});

export function morphTo(i: IconInput, s?: SpringPreset | MorphOptions): void {
  ctrl.morphTo(i, s ?? spring);
}

export function set(i: IconInput): void {
  ctrl.set(i);
}

const sw = $derived(
  absoluteStrokeWidth ? (Number(strokeWidth) * 24) / Number(size) : strokeWidth,
);
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke={color}
  stroke-width={sw}
  stroke-linecap="round"
  stroke-linejoin="round"
  role={label ? "img" : undefined}
  aria-hidden={label ? undefined : "true"}
  {...rest}
>
  {#if label}<title>{label}</title>{/if}
  <path bind:this={pathEl} d={initialD} />
</svg>
