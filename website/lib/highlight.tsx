import type { ReactNode } from "react";

/* Tiny tokenizer for code snippets: comments, strings, keywords, numbers.
   Enough color to read; no highlighting dependency. Shared by the home
   CodePanel and the showcase SnippetBlocks. */
const TOKEN =
  /(\/\/[^\n]*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(import|from|export|default|function|return|const|let|type|typeof|new)\b|(\b\d+(?:\.\d+)?\b)/g;

export function highlight(code: string): ReactNode[] {
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
