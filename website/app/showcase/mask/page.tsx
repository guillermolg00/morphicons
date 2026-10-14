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
            Iconify-style pipelines render icons as CSS masks: a span with a{" "}
            <code className="font-mono text-[0.92em]">mask-image</code> and no
            path in the DOM. The mask adapter morphs that span as it is, keeping
            its classes and its paint.
          </>
        }
        traits={[
          {
            label: "Why this path",
            body: "You already ship icons as CSS masks: UnoCSS presetIcons, Tailwind icon plugins, plain Iconify. This animates the elements you have instead of asking you to switch to inline SVG.",
          },
          {
            label: "How it works",
            body: "svgToIcon turns the markup into icon data. maskTarget flips mask-image between two hidden SVG masks every frame, which keeps Safari repainting.",
          },
          {
            label: "The tradeoff",
            body: "Every frame repaints the mask on the main thread: fine for toggles and nav, inline SVG stays leaner for icon-heavy views. Client-only, and stroke icons only: filled sets (Material Symbols) belong in inline SVG.",
          },
        ]}
      >
        <ShowcaseMask />
      </ShowcaseShell>

      <SiteFooter />
    </div>
  );
}
