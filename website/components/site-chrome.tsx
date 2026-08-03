import Link from "next/link";
import { LogoMark } from "@/components/logo";

export const GITHUB_URL = "https://github.com/guillermolg00/morphicons";

/* Shared page chrome: one header and one footer for every route. */
export function SiteHeader() {
  return (
    <header className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between px-6">
      <Link
        href="/"
        className="flex items-center gap-2 text-[15px] font-medium text-ink"
      >
        <LogoMark size={20} />
        morphicons
      </Link>
      <nav className="flex items-center gap-6">
        <Link
          href="/#how"
          className="text-sm text-body transition-colors hover:text-ink"
        >
          How it works
        </Link>
        <Link
          href="/roadmap"
          className="text-sm text-body transition-colors hover:text-ink"
        >
          Roadmap
        </Link>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-body transition-colors hover:text-ink"
        >
          GitHub
        </a>
      </nav>
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
