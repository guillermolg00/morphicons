"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { type CodegenConfig, filenameOf, generate, type Target } from "@/lib/codegen";
import type { IconEntry } from "@/lib/icons";

const TARGETS: { v: Target; label: string }[] = [
  { v: "react", label: "React" },
  { v: "next", label: "Next.js" },
  { v: "vanilla", label: "Vanilla JS" },
];

/* Tiny tokenizer for the snippet: comments, strings, keywords, numbers.
   Enough color to read; no highlighting dependency. */
const TOKEN =
  /(\/\/[^\n]*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(import|from|export|default|function|return|const|let|type|typeof|new)\b|(\b\d+(?:\.\d+)?\b)/g;

function highlight(code: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (;;) {
    const m = TOKEN.exec(code);
    if (!m) break;
    if (m.index > last) out.push(code.slice(last, m.index));
    const cls = m[1]
      ? "text-code-mute"
      : m[2]
        ? "text-code-str"
        : m[3]
          ? "text-code-key"
          : "text-code-num";
    out.push(
      <span key={key++} className={cls}>
        {m[0]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

export function CodePanel({
  entries,
  cfg,
  className = "",
}: {
  entries: IconEntry[];
  cfg: CodegenConfig;
  className?: string;
}) {
  const [target, setTarget] = useState<Target>("react");
  const code = useMemo(() => generate(entries, target, cfg), [entries, target, cfg]);
  const tokens = useMemo(() => highlight(code), [code]);

  return (
    <div className={className}>
      <div className="overflow-hidden rounded-xl border border-hairline bg-code-bg shadow-card-lg">
        <div className="flex h-12 items-center justify-between gap-3 border-b border-white/10 px-3 sm:px-4">
          <div className="flex items-center gap-1" role="tablist" aria-label="Export target">
            {TARGETS.map((t) => (
              <button
                key={t.v}
                type="button"
                role="tab"
                aria-selected={target === t.v}
                onClick={() => setTarget(t.v)}
                className={`h-7 rounded-md px-2.5 font-mono text-xs transition-colors ${
                  target === t.v
                    ? "bg-white/15 text-code-fg"
                    : "text-code-mute hover:text-code-fg"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden font-mono text-xs text-code-mute sm:block">
              {filenameOf(target)}
            </span>
            <CopyButton
              text={code}
              className="h-8 w-8 text-code-mute hover:bg-white/10 hover:text-code-fg"
            />
          </div>
        </div>
        <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-[1.6] text-code-fg">
          <code>{tokens}</code>
        </pre>
      </div>
      <p className="mt-3 text-sm text-body">
        It is a regular component file. Drop it into your project and swap the icons for your
        own.
      </p>
    </div>
  );
}
