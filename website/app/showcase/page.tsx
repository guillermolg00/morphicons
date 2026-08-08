import type { Metadata } from "next";
import { Showcase } from "@/components/showcase";
import { ShowcaseShell } from "@/components/showcase-shell";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";

export const metadata: Metadata = {
  title: "Showcase",
  description:
    "shadcn/ui-style components with morphing icons, built on the core library alone: copy button, password toggle, theme switch, player controls, inline validation and file tree. Pick your icon library, tune the spring, copy the code for React, Vue or Svelte.",
  alternates: { canonical: "/showcase" },
};

export default function ShowcasePage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <ShowcaseShell
        active="core"
        lede={
          <>
            The icon swaps that show up most in real shadcn/ui apps, rebuilt as
            morphs with the core library alone: one MorphIcon component
            rendering inline SVG. Pick a library, tune the physics, copy the
            component in your framework.
          </>
        }
        traits={[
          {
            label: "Why this path",
            body: "Inline SVG straight from icon data, with an SSR-exact first paint and accessibility built in. This is the default way to ship a morph, and the lightest.",
          },
          {
            label: "What it weighs",
            body: "6.6 KB gzip for the core, about 8 KB with a framework binding. Zero runtime dependencies, and subpath exports so you only pay for what you import.",
          },
          {
            label: "The tradeoff",
            body: "Icons must be stroke-centerline data: Lucide, Tabler, Heroicons outline, Iconoir. Fill-drawn glyphs have no centerline to morph, so they are rejected up front.",
          },
        ]}
      >
        <Showcase />
      </ShowcaseShell>

      <SiteFooter />
    </div>
  );
}
