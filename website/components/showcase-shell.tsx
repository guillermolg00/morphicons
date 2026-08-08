import Link from "next/link";
import type { ReactNode } from "react";

/* Shared frame for the three showcase tabs: one h1, the tab switcher, a
   per-tab lede and an optional why/how/tradeoff strip. Tabs are routes, not
   client state: each surface keeps its own URL, metadata and code-split
   bundle, which is what keeps Mapbox and the chart runtime off the core tab. */

const TABS = [
  { id: "core", href: "/showcase", label: "Core" },
  { id: "mask", href: "/showcase/mask", label: "Mask adapter" },
  { id: "canvas", href: "/showcase/canvas", label: "Canvas adapter" },
] as const;

export type ShowcaseTabId = (typeof TABS)[number]["id"];

export interface Trait {
  label: string;
  body: ReactNode;
}

export function ShowcaseShell({
  active,
  lede,
  traits,
  children,
}: {
  active: ShowcaseTabId;
  lede: ReactNode;
  traits?: Trait[];
  children: ReactNode;
}) {
  return (
    <main className="flex flex-1 flex-col pb-24">
      <section className="mx-auto w-full max-w-[1200px] px-6 pb-10 pt-16">
        <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-[-0.045em] text-ink">
          Showcase
        </h1>

        {/* The switcher speaks the sidebar Seg's visual language, but these
            are links with aria-current, not buttons: each tab is a page. */}
        <nav
          aria-label="Showcase sections"
          className="mt-6 grid auto-cols-fr grid-flow-col overflow-hidden rounded-md border border-hairline bg-canvas text-center sm:inline-grid"
        >
          {TABS.map((t) => (
            <Link
              key={t.id}
              href={t.href}
              aria-current={t.id === active ? "page" : undefined}
              className={`flex h-9 items-center justify-center px-2 text-[13px] transition-colors sm:px-5 ${
                t.id === active
                  ? "bg-ink font-medium text-canvas"
                  : "text-body hover:bg-canvas-soft-2 hover:text-ink"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        <p className="mt-6 max-w-[640px] text-pretty text-lg leading-7 text-body">
          {lede}
        </p>

        {traits && (
          <dl className="mt-8 grid gap-5 border-t border-hairline pt-6 sm:grid-cols-3">
            {traits.map((t) => (
              <div key={t.label}>
                <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-mute">
                  {t.label}
                </dt>
                <dd className="mt-1.5 max-w-[42ch] text-sm leading-6 text-body">
                  {t.body}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {children}
    </main>
  );
}
