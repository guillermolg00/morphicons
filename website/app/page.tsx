import { CodePanel } from "@/components/code-panel";
import { InstallCommand } from "@/components/copy-button";
import { GITHUB_URL, SiteFooter, SiteHeader } from "@/components/site-chrome";
import { Studio } from "@/components/studio";

/* The README is the source of truth for the API and the math. */
const DOCS_URL = `${GITHUB_URL}#readme`;

const STATS: { value: string; caption: string }[] = [
  { value: "6.5 KB", caption: "core, gzipped, everything included" },
  { value: "0", caption: "runtime dependencies" },
  { value: "<1 ms", caption: "to plan any morph pair" },
  { value: "1", caption: "shared rAF for every icon on screen" },
];

const COMPAT = [
  "Lucide",
  "Tabler",
  "Heroicons outline",
  "Iconoir",
  "Akar",
  "Untitled UI",
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
            Animate Lucide, Tabler, Heroicons or any stroke icon set. Optimal rotation
            solved in closed form, spring physics, zero dependencies.
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
                  Six kilobytes of math.
                </h2>
                <p className="mt-5 max-w-[60ch] leading-relaxed text-body">
                  morphicons solves the optimal similarity between two shapes in closed form
                  (2D Procrustes): if a pair is congruent under rotation, it rotates; if not,
                  it morphs in the aligned frame. Nobody declares rotation groups by hand.
                  Springs are interruptible, corners stay sharp at rest, and the core never
                  touches the DOM, so React, Vue, Next.js and plain JavaScript are all
                  first-class drivers.
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
                  format, structurally typed. No adapters, no per-library setup.
                </p>
                <a
                  href={DOCS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-8 inline-flex h-11 items-center gap-2 rounded-md bg-ink px-5 text-sm font-medium text-canvas shadow-card transition-opacity hover:opacity-90"
                >
                  See the full docs
                  <svg
                    viewBox="0 0 24 24"
                    width={16}
                    height={16}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M7 7h10v10" />
                    <path d="M7 17 17 7" />
                  </svg>
                </a>
              </div>
              <dl className="grid grid-cols-2 content-center gap-x-8 gap-y-10">
                {STATS.map((s) => (
                  <div key={s.caption}>
                    <dt className="sr-only">{s.caption}</dt>
                    <dd className="text-3xl font-semibold tracking-[-0.03em] text-ink">
                      {s.value}
                    </dd>
                    <p className="mt-1 text-sm text-body">{s.caption}</p>
                  </div>
                ))}
              </dl>
            </div>
            <div className="mt-16 border-t border-hairline pt-8">
              <p className="text-sm font-medium text-ink">
                Works with any stroke icon set — on any grid, via fitIcon.
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
