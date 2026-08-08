/* morphicons/adapters — format adapters, the single home for every foreign
   icon representation. The core has exactly two structural contracts:
   IconInput on the way in (IconNode | `d` string) and PathEl on the way out
   (anything with `setAttribute`). An adapter converts a foreign FORMAT into
   one of those two contracts — never a vendor's: there is no `/iconify` and
   never will be (README "Icon library compatibility", docs/adr/0001).

   The unit of payment is the import: this entry is opt-in, and inside it every
   adapter is an independent module so named imports tree-shake to just what
   you use. That independence is pinned by per-export size gates in CI
   (size-limit `"import": "{ svgToIcon }"`) — coupling two adapters together
   trips the gate, not a reviewer's eye. */

export {
  type Canvas2DContext,
  type CanvasSurface,
  type CanvasTargetOptions,
  canvasTarget,
} from "./canvas";
export {
  type MaskEl,
  type MaskPathEl,
  type MaskStyle,
  type MaskTargetOptions,
  maskTarget,
} from "./mask";
export { svgToIcon } from "./svg";
