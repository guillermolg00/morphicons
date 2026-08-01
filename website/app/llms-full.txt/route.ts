import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const dynamic = "force-static";

/* /llms-full.txt (https://llmstxt.org) serves the library README — the
   documentation's source of truth — as plain markdown for AI agents.
   Prefer the repo root copy (fresh when building inside the monorepo);
   fall back to the packed copy shipped in the vendored tarball. */
const README_CANDIDATES = [
  path.join(process.cwd(), "..", "README.md"),
  path.join(process.cwd(), "node_modules", "morphicons", "README.md"),
];

export function GET() {
  const file = README_CANDIDATES.find((p) => existsSync(p));
  if (!file) {
    return new Response("morphicons README not found", { status: 404 });
  }

  const readme = readFileSync(file, "utf8");
  // The README opens with an HTML logo/heading block; the markdown body
  // starts at the intro paragraph. Re-title it for standalone consumption.
  const start = readme.indexOf("Universal morphing");
  const body = start === -1 ? readme : readme.slice(start);
  const text = [
    "# morphicons — full documentation",
    "",
    "> npm: `morphicons` · site: https://www.morphicons.com · repo: https://github.com/guillermolg00/morphicons · index: https://www.morphicons.com/llms.txt",
    "",
    body,
  ].join("\n");

  return new Response(text, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
