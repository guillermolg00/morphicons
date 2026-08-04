/* Types for the ?client virtual modules served by loader.ts (same file,
   client compile — see the loader header). Test-only ambient declarations. */

declare module "svelte?client" {
  export * from "svelte";
}

declare module "*/MorphIcon.svelte?client" {
  import type { Component } from "svelte";
  import type { MorphHandle, MorphIconProps } from "../../src/svelte/shared";

  const MorphIcon: Component<MorphIconProps, MorphHandle>;
  export default MorphIcon;
}

declare module "*/harness.svelte?client" {
  import type { Component } from "svelte";
  import type { MorphHandle, MorphIconProps } from "../../src/svelte/shared";

  const Harness: Component<
    { initial: MorphIconProps },
    { update(next: MorphIconProps): void; getHandle(): MorphHandle | undefined }
  >;
  export default Harness;
}
