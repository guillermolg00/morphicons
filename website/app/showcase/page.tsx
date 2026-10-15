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
            The icon swaps real shadcn/ui apps use most, as morphs. Pick a
            library, tune the spring, copy the component for your framework.
          </>
        }
        traits={[
          {
            label: "Why this path",
            body: "Inline SVG from icon data, exact on first paint, accessible by default. The default way to ship a morph, and the lightest.",
          },
          {
            label: "What it weighs",
            body: "About 10 KB gzip with a framework binding and zero runtime dependencies. Subpath exports: you only pay for what you import.",
          },
          {
            label: "The tradeoff",
            body: "Filled icons need a 5.4 KB chunk, fetched the first time one shows up. Until it lands they render close to exact, and a morph may fall back to a shrink-and-grow.",
          },
        ]}
      >
        <Showcase />
      </ShowcaseShell>

      <SiteFooter />
    </div>
  );
}
