import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { Showcase } from "@/components/showcase";

export const metadata: Metadata = {
  title: "Showcase",
  description:
    "shadcn/ui-style components with morphing icons: copy button, password toggle, theme switch, player controls, inline validation and file tree. Pick your icon library, tune the spring, copy the code for React, Vue or Svelte.",
  alternates: { canonical: "/showcase" },
};

export default function ShowcasePage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="flex flex-1 flex-col pb-24">
        <section className="mx-auto w-full max-w-[1200px] px-6 pb-10 pt-16">
          <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-[-0.045em] text-ink">
            Showcase
          </h1>
          <p className="mt-4 max-w-[560px] text-pretty text-lg leading-7 text-body">
            The icon swaps that show up most in real shadcn/ui apps, rebuilt as
            morphs. Pick a library, tune the physics, copy the component in
            your framework.
          </p>
        </section>

        <Showcase />
      </main>

      <SiteFooter />
    </div>
  );
}
