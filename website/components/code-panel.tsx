import type { ReactNode } from "react";
import { CopyButton } from "@/components/copy-button";

/* The whole API, verbatim from the README: state lives outside and MorphIcon
   animates when the prop changes. Fixed on purpose — generating a snippet per
   studio selection dressed the library up as something it isn't. */
const SNIPPET = `import { MorphIcon } from "morphicons/react";
import { Menu, X } from "lucide"; // data, not components

<button onClick={() => setOpen(o => !o)} aria-expanded={open}>
  <MorphIcon icon={open ? X : Menu} />
</button>
`;

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

const TOKENS = highlight(SNIPPET);

export function CodePanel() {
  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-hairline bg-code-bg shadow-card-lg">
        <div className="flex h-12 items-center justify-between gap-3 border-b border-white/10 px-3 sm:px-4">
          <span className="font-mono text-xs text-code-mute">tsx</span>
          <CopyButton
            text={SNIPPET}
            className="h-8 w-8 text-code-mute hover:bg-white/10 hover:text-code-fg"
          />
        </div>
        <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-[1.6] text-code-fg">
          <code>{TOKENS}</code>
        </pre>
      </div>
      <p className="mt-3 text-sm text-body">
        That is the whole thing. No wrappers, no keys, no from/to pairs, no configuration.
        Swap the pair for any two icons above.
      </p>
    </div>
  );
}
