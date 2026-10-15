import { CodePanel } from "@/components/code-panel";
import { InstallCommand } from "@/components/copy-button";
import { DocsButton } from "@/components/docs-button";
import { GITHUB_URL, SiteFooter, SiteHeader } from "@/components/site-chrome";
import { Studio } from "@/components/studio";

/* The README is the source of truth for the API. */
const DOCS_URL = `${GITHUB_URL}#readme`;

const STATS: { value: string; caption: string }[] = [
  { value: "10 KB", caption: "gzip with a framework binding" },
  { value: "0", caption: "runtime dependencies" },
  { value: "5", caption: "framework bindings, plus vanilla JS" },
  { value: "1", caption: "shared rAF for every icon on screen" },
];

const COMPAT = [
  "Lucide",
  "Tabler",
  "Heroicons",
  "Iconoir",
  "Material Symbols",
  "Phosphor",
  "Hugeicons",
  "shadcn registry",
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="flex flex-1 flex-col">
        {/* Hero: copy on top, the studio is the asset. */}
        <section className="mx-auto w-full max-w-[720px] px-6 pb-12 pt-16 text-center sm:pt-20">
          {/* text-balance: the longer keyword-carrying headline otherwise
              drops a one-word orphan onto its last line. */}
          <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-[-0.045em] text-ink sm:text-5xl">
            Morph any SVG icon into any other.
          </h1>
          <p className="mx-auto mt-5 max-w-[560px] text-pretty text-lg leading-7 text-body">
            Lucide, Tabler, Heroicons or any icon set, stroked or filled. Spring
            physics, zero dependencies, nothing to configure.
          </p>
          <div className="mt-8">
            <InstallCommand />
          </div>
        </section>

        <Studio />

        {/* The code: fixed, the same snippet the README opens with. */}
        <section className="mx-auto mt-10 w-full max-w-[1200px] px-6">
          <CodePanel />
        </section>

        {/* How it works: one paragraph of honest docs plus the numbers. */}
        <section id="how" className="mt-24 border-t border-hairline bg-canvas-soft">
          <div className="mx-auto w-full max-w-[1200px] px-6 py-20 sm:py-24">
            <div className="grid gap-14 lg:grid-cols-2 lg:gap-20">
              <div>
                <h2 className="text-3xl font-semibold tracking-[-0.03em] text-ink">
                  Closed-form math, no config.
                </h2>
                <p className="mt-5 max-w-[60ch] leading-relaxed text-body">
                  morphicons solves the rotation, scale and translation that best map one
                  icon onto the other, in closed form. Shapes that match under rotation
                  simply rotate, and filled icons morph as filled shapes.
                </p>
                <p className="mt-4 max-w-[60ch] leading-relaxed text-body">
                  Icons are consumed as data, not components: a{" "}
                  <code className="rounded bg-canvas-soft-2 px-1.5 py-0.5 font-mono text-[13px] text-ink">
                    d
                  </code>{" "}
                  attribute or Lucide&rsquo;s{" "}
                  <code className="rounded bg-canvas-soft-2 px-1.5 py-0.5 font-mono text-[13px] text-ink">
                    IconNode
                  </code>{" "}
                  format. No per-library setup.
                </p>
                <DocsButton href={DOCS_URL} />
              </div>
              <dl className="grid grid-cols-2 content-center gap-x-8 gap-y-10">
                {STATS.map((s) => (
                  // dt before dd (the only valid order), shown caption-under-value.
                  <div key={s.caption} className="flex flex-col-reverse">
                    <dt className="mt-1 text-sm text-body">{s.caption}</dt>
                    <dd className="text-3xl font-semibold tracking-[-0.03em] text-ink">
                      {s.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="mt-16 border-t border-hairline pt-8">
              <p className="text-sm font-medium text-ink">
                Works with any icon set, stroked or filled, on any grid via fitIcon.
              </p>
              <ul className="mt-4 flex flex-wrap gap-2">
                {COMPAT.map((name) => (
                  <li
                    key={name}
                    className="flex h-8 items-center rounded-full border border-hairline bg-canvas px-3.5 text-sm text-body"
                  >
                    {name}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
