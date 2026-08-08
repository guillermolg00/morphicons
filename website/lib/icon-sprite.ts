/* A morphing icon as a SPRITE: its own small, dedicated canvas.

   This is the doctrine the canvasTarget header asks for when the host has its
   own render loop: the morph NEVER gets the host's context, because the
   driver writes on its own rAF and the two clocks would fight. The icon lives
   on a canvas of its own and the host consumes it, with `onWrite` as the
   dirty signal.

   Two consumption styles, both covered here:
   - compositors (`drawImage` into a badge, a scene, a texture upload) read
     `canvas` and gate on `consume()`;
   - pixel readers (Mapbox's StyleImageInterface wants a flat RGBA `data`)
     read `ctx` via getImageData, again only when `consume()` says there is
     something new. `touch()` re-dirties by hand when the CONSUMER changed
     (say, a tint) and the morph did not. */

import type { IconInput } from "morphicons";
import { canvasTarget } from "morphicons/adapters";
import { createMorph, type Morph } from "morphicons/dom";

export interface IconSprite {
  /** The source canvas, exactly `size` x `size` device pixels. */
  readonly canvas: HTMLCanvasElement;
  /** Its 2D context, for consumers that read pixels back. */
  readonly ctx: CanvasRenderingContext2D;
  /** The full driver handle: morphTo, set, seek, progress, destroy. */
  readonly morph: Morph;
  /** true from the last write until someone consumes it. */
  readonly dirty: boolean;
  /** Read and lower the flag: `if (sprite.consume()) copyPixels()`. */
  consume(): boolean;
  /** Dirty by hand, for consumer-side changes (a tint) with no new frame. */
  touch(): void;
}

export interface IconSpriteOptions {
  /** Side of the sprite in device pixels. */
  size: number;
  icon: IconInput;
  color: string;
  /** Stroke width in grid units (Lucide uses 2). */
  strokeWidth?: number;
  /** The spring's overshoot leaves the 0..24 grid transiently: at small sizes
   *  that clips against the canvas edge. A padded viewBox gives it air
   *  without touching the geometry. */
  pad?: number;
  /** Chained after the dirty flag is raised (e.g. map.triggerRepaint). */
  onWrite?: () => void;
}

export function iconSprite(opts: IconSpriteOptions): IconSprite {
  const canvas = document.createElement("canvas");
  canvas.width = opts.size;
  canvas.height = opts.size;
  // willReadFrequently: pixel readers end every flight frame in getImageData.
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no 2D context");

  const pad = opts.pad ?? 3;
  let dirty = true;

  const morph = createMorph(
    canvasTarget(ctx, {
      viewBox: `${-pad} ${-pad} ${24 + pad * 2} ${24 + pad * 2}`,
      strokeWidth: opts.strokeWidth ?? 2,
      color: opts.color,
      onWrite: () => {
        dirty = true;
        opts.onWrite?.();
      },
    }),
    opts.icon,
  );

  return {
    canvas,
    ctx,
    morph,
    get dirty() {
      return dirty;
    },
    consume(): boolean {
      const was = dirty;
      dirty = false;
      return was;
    },
    touch(): void {
      dirty = true;
    },
  };
}
