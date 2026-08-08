import type { Metadata } from "next";
import { ShowcaseMask } from "@/components/showcase-mask";
import { ShowcaseShell } from "@/components/showcase-shell";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";

export const metadata: Metadata = {
  title: "Mask adapter",
  description:
    "Morph Iconify-style CSS mask icons in place: svgToIcon parses the markup you already ship, maskTarget animates the element you already have. No inline SVG, no markup changes, currentColor keeps working.",
  alternates: { canonical: "/showcase/mask" },
};

export default function MaskShowcasePage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <ShowcaseShell
        active="mask"
        lede={
          <>
            Iconify-style pipelines render icons as CSS masks: a span whose
            shape is a <code className="font-mono text-[0.92em]">mask-image</code>,
            no path in the DOM. The mask adapter morphs that span as it is.
            svgToIcon reads the markup, maskTarget drives the mask, and your
            element keeps its classes, its paint and its place in the layout.
          </>
        }
        traits={[
          {
            label: "Why this path",
            body: "You already ship icons as CSS masks: UnoCSS presetIcons, Tailwind icon plugins, plain Iconify. This animates the elements you have instead of asking you to switch to inline SVG. Any stroke-drawn set Iconify carries qualifies.",
          },
          {
            label: "How it works",
            body: "svgToIcon turns markup into morphable data, re-gridding off-grid sets via their viewBox. maskTarget keeps a hidden pair of SVG mask buffers and flips mask-image between them each frame, which is what keeps Safari repainting. Whatever paints the element shows through the moving shape.",
          },
          {
            label: "The tradeoff",
            body: "Every frame re-rasterizes the mask on the main thread, so budget it like a hover effect: toggles, nav, empty states. For icon-heavy views, inline SVG stays leaner. Client-only by nature, and fill-drawn sets (Material Symbols) are rejected up front.",
          },
        ]}
      >
        <ShowcaseMask />
      </ShowcaseShell>

      <SiteFooter />
    </div>
  );
}
