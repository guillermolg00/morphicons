import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { MobileNav, type NavLink } from "@/components/mobile-nav";

export const GITHUB_URL = "https://github.com/guillermolg00/morphicons";

const NAV_LINKS: NavLink[] = [
  /* The home hero IS the studio; "Playground" is the way back to it. */
  { href: "/", label: "Playground" },
  { href: "/showcase", label: "Showcase" },
  { href: "/#how", label: "How it works" },
  { href: "/roadmap", label: "Roadmap" },
  { href: GITHUB_URL, label: "GitHub", external: true },
  { href: "https://x.com/guillermolg00", label: "X", external: true },
];

/* Shared page chrome: one header and one footer for every route. The header
   is `relative` because the mobile dropdown positions against it. */
export function SiteHeader() {
  return (
    <header className="relative mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between px-6">
      <Link
        href="/"
        className="flex items-center gap-2 text-[15px] font-medium text-ink"
      >
        <LogoMark size={20} />
        morphicons
      </Link>
      <nav className="flex items-center gap-6 max-md:hidden">
        {NAV_LINKS.map((l) =>
          l.external ? (
            <a
              key={l.label}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-body transition-colors hover:text-ink"
            >
              {l.label}
            </a>
          ) : (
            <Link
              key={l.label}
              href={l.href}
              className="text-sm text-body transition-colors hover:text-ink"
            >
              {l.label}
            </Link>
          ),
        )}
      </nav>
      <MobileNav links={NAV_LINKS} />
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-hairline">
      <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-3 px-6 py-10 text-sm text-body">
        <span className="flex items-center gap-2">
          <LogoMark size={16} className="text-ink" />
          morphicons, MIT license.
        </span>
        <span>
          Demo icons belong to their authors: Lucide (ISC), Heroicons (MIT), Tabler (MIT).
        </span>
        <span className="flex items-center gap-4">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-ink"
          >
            GitHub
          </a>
          <a href="/llms.txt" className="transition-colors hover:text-ink">
            llms.txt
          </a>
          <a
            href="https://guillermolg.com"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-ink"
          >
            Made by guillermolg.com
          </a>
        </span>
      </div>
    </footer>
  );
}
