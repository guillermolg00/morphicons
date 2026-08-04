<!-- Client-test harness: swaps the WHOLE props object so the mount suite can
  drive MorphIcon's $effect the way a real parent re-render would (unchanged
  keys keep their identity for the controller's change detection). Test-only. -->
<script lang="ts">
import MorphIcon from "../../src/svelte/MorphIcon.svelte?client";
import type { MorphHandle, MorphIconProps } from "../../src/svelte/shared";

let { initial }: { initial: MorphIconProps } = $props();

// svelte-ignore state_referenced_locally — mount-time seed on purpose.
let current: MorphIconProps = $state(initial);
let handle: MorphHandle | undefined = $state();

export function update(next: MorphIconProps): void {
  current = next;
}

export function getHandle(): MorphHandle | undefined {
  return handle;
}
</script>

<MorphIcon {...current} bind:this={handle} />
