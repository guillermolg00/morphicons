"use client";

import { Menu, X } from "lucide";
import { MorphIcon } from "morphicons/react";
import Link from "next/link";
import { useEffect, useState } from "react";

export interface NavLink {
  href: string;
  label: string;
  external?: boolean;
}

/* Mobile disclosure menu. The toggle is the README's opening example living
   in the page chrome: MorphIcon morphing Menu ↔ X. Bare glyph on purpose —
   no border, no fill. The dropdown positions against the header (the
   nearest relative ancestor). */
export function MobileNav({ links }: { links: NavLink[] }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
        className="-mr-2 flex h-10 w-10 items-center justify-center text-ink"
      >
        <MorphIcon icon={open ? X : Menu} size={20} strokeWidth={2} spring="snappy" />
      </button>
      {open && (
        <>
          {/* Invisible backdrop: tap outside to close. Escape and the toggle
              cover keyboard users, so it hides from the a11y tree. */}
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute inset-x-6 top-full z-50 rounded-xl border border-hairline bg-canvas p-2 shadow-card-lg">
            <nav className="flex flex-col">
              {links.map((l) =>
                l.external ? (
                  <a
                    key={l.label}
                    href={l.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setOpen(false)}
                    className="rounded-md px-3 py-2.5 text-base text-body transition-colors hover:bg-canvas-soft-2 hover:text-ink"
                  >
                    {l.label}
                  </a>
                ) : (
                  <Link
                    key={l.label}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="rounded-md px-3 py-2.5 text-base text-body transition-colors hover:bg-canvas-soft-2 hover:text-ink"
                  >
                    {l.label}
                  </Link>
                ),
              )}
            </nav>
          </div>
        </>
      )}
    </div>
  );
}
