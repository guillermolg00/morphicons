import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const dynamic = "force-static";

const REPO_URL = "https://github.com/guillermolg00/morphicons";

/* /llms-full.txt (https://llmstxt.org) serves the library docs as plain
   markdown for AI agents: the README, then how the math works. Prefer the
   repo root copies (fresh when building inside the monorepo); the README
   falls back to the packed copy shipped in the npm tarball. Paths stay
   static so the file tracer doesn't pull in the whole project. */
const README = [
  path.join(process.cwd(), "..", "README.md"),
  path.join(process.cwd(), "node_modules", "morphicons", "README.md"),
];
const HOW_IT_WORKS = [path.join(process.cwd(), "..", "docs", "how-it-works.md")];

// Reads the first copy found; relative links point into the repo, so they
// are made absolute against the doc's repo path.
function read(candidates: string[], repoPath: string): string | undefined {
  const file = candidates.find((p) => existsSync(p));
  if (!file) return undefined;
  const base = `${REPO_URL}/blob/main/${repoPath}`;
  return readFileSync(file, "utf8").replace(
    /\]\((?!https?:|#)([^)]+)\)/g,
    (_, rel: string) => `](${new URL(rel, base).href})`,
  );
}

export function GET() {
  const readme = read(README, "README.md");
  if (!readme) {
    return new Response("morphicons README not found", { status: 404 });
  }
  const howItWorks = read(HOW_IT_WORKS, "docs/how-it-works.md");

  // The README opens with an HTML logo/heading block; the markdown body
  // starts at the first line that isn't HTML or indentation.
  const start = readme.search(/^[^<\s]/m);
  const text = [
    "# morphicons — full documentation",
    "",
    `> npm: \`morphicons\` · site: https://www.morphicons.com · repo: ${REPO_URL} · index: https://www.morphicons.com/llms.txt`,
    "",
    start === -1 ? readme : readme.slice(start),
    ...(howItWorks ? [howItWorks] : []),
  ].join("\n");

  return new Response(text, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
