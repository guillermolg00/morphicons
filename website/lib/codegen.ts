/* Generates the exportable snippet for the current studio state. Pure string
   work: the output mirrors exactly what the README documents, with Lucide
   icons imported from the `lucide` data package and Feather/Tabler selections
   inlined as IconNode literals (their packages don't ship node data). */

import type { IconEntry } from "./icons";

export type Target = "react" | "next" | "vanilla";

export interface CodegenConfig {
  spring: "smooth" | "snappy" | "bouncy";
  size: number;
  strokeWidth: number;
}

const pascal = (label: string): string =>
  label.replace(/(^|-)(\w)/g, (_, __, c: string) => c.toUpperCase());

/** Identifier for an entry inside the generated snippet. */
const nameOf = (e: IconEntry): string =>
  e.lucideExport ?? pascal(e.lib) + pascal(e.label);

/** Non-default MorphIcon props for the current config ("" when all default). */
function propsOf(cfg: CodegenConfig): string {
  let s = "";
  if (cfg.spring !== "snappy") s += ` spring="${cfg.spring}"`;
  if (cfg.size !== 24) s += ` size={${cfg.size}}`;
  if (cfg.strokeWidth !== 2) s += ` strokeWidth={${cfg.strokeWidth}}`;
  return s;
}

function header(entries: IconEntry[], target: Target): string {
  const lucide = entries.filter((e) => e.lucideExport);
  const vendored = entries.filter((e) => !e.lucideExport);
  const lines: string[] = [];

  if (target === "next") lines.push(`"use client";\n`);
  if (target !== "vanilla") {
    lines.push(`import { useState } from "react";`);
    lines.push(
      vendored.length > 0
        ? `import { MorphIcon, type IconNode } from "morphicons/react";`
        : `import { MorphIcon } from "morphicons/react";`,
    );
  } else {
    lines.push(
      vendored.length > 0
        ? `import { createMorph, type IconNode } from "morphicons/dom";`
        : `import { createMorph } from "morphicons/dom";`,
    );
  }
  if (lucide.length > 0) {
    lines.push(
      `import { ${lucide.map((e) => e.lucideExport).join(", ")} } from "lucide"; // data, not components`,
    );
  }
  for (const e of vendored) {
    lines.push("");
    lines.push(`// ${e.lib} "${e.label}" (MIT), inlined as icon data`);
    lines.push(`const ${nameOf(e)}: IconNode = ${JSON.stringify(e.data)};`);
  }
  return lines.join("\n");
}

export function generate(entries: IconEntry[], target: Target, cfg: CodegenConfig): string {
  if (entries.length === 0) return "// Pick at least one icon above.";
  const names = entries.map(nameOf);
  const props = propsOf(cfg);
  const head = header(entries, target);

  if (target === "vanilla") {
    const spring = cfg.spring === "snappy" ? "" : `, "${cfg.spring}"`;
    return `${head}

const icons = [${names.join(", ")}];
const path = document.querySelector<SVGPathElement>("#my-icon path")!;

const morph = createMorph(path, icons[0]);
let i = 0;

document.querySelector("#my-icon")!.addEventListener("click", () => {
  i = (i + 1) % icons.length;
  morph.morphTo(icons[i]${spring});
});
`;
  }

  if (entries.length === 1) {
    return `${head}

export function MorphButton() {
  return <MorphIcon icon={${names[0]}}${props} />;
}
`;
  }

  if (entries.length === 2) {
    return `${head}

export function MorphButton() {
  const [on, setOn] = useState(false);
  return (
    <button type="button" onClick={() => setOn(!on)} aria-pressed={on}>
      <MorphIcon icon={on ? ${names[1]} : ${names[0]}}${props} />
    </button>
  );
}
`;
  }

  return `${head}

const icons = [${names.join(", ")}];

export function MorphButton() {
  const [i, setI] = useState(0);
  return (
    <button type="button" onClick={() => setI((i + 1) % icons.length)}>
      <MorphIcon icon={icons[i]}${props} />
    </button>
  );
}
`;
}

export const filenameOf = (target: Target): string =>
  target === "vanilla" ? "morph-icon.ts" : "morph-button.tsx";
