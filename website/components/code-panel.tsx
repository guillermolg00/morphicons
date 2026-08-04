"use client";

import { useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { CopyButton } from "@/components/copy-button";
import { REACT_LOGO, SVELTE_LOGO, VUE_LOGO } from "@/lib/logos";

/* The whole API, verbatim from the README, once per binding: state lives
   outside and MorphIcon animates when the prop changes. Fixed on purpose —
   generating a snippet per studio selection dressed the library up as
   something it isn't. */

const REACT_SNIPPET = `import { MorphIcon } from "morphicons/react";
import { Menu, X } from "lucide"; // data, not components

<button onClick={() => setOpen(o => !o)} aria-expanded={open}>
  <MorphIcon icon={open ? X : Menu} />
</button>
`;

const VUE_SNIPPET = `<script setup>
import { ref } from "vue";
import { MorphIcon } from "morphicons/vue";
import { Menu, X } from "lucide"; // data, not components
const open = ref(false);
</script>

<template>
  <button @click="open = !open" :aria-expanded="open">
    <MorphIcon :icon="open ? X : Menu" />
  </button>
</template>
`;

const SVELTE_SNIPPET = `<script>
  import { MorphIcon } from "morphicons/svelte";
  import { Menu, X } from "lucide"; // data, not components
  let open = $state(false);
</script>

<button onclick={() => (open = !open)} aria-expanded={open}>
  <MorphIcon icon={open ? X : Menu} />
</button>
`;

const REACT_NATIVE_SNIPPET = `import { MorphIcon } from "morphicons/react-native";
import { Menu, X } from "lucide"; // data, not components

<Pressable onPress={() => setOpen(o => !o)}>
  <MorphIcon icon={open ? X : Menu} />
</Pressable>
`;

/* Tiny tokenizer for the snippets: comments, strings, keywords, numbers.
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

type Framework = {
  id: string;
  label: string;
  lang: string;
  logo: string;
  code: string;
  tokens: ReactNode[];
};

const FRAMEWORKS: Framework[] = [
  { id: "react", label: "React", lang: "tsx", logo: REACT_LOGO, code: REACT_SNIPPET },
  { id: "vue", label: "Vue", lang: "vue", logo: VUE_LOGO, code: VUE_SNIPPET },
  {
    id: "svelte",
    label: "Svelte",
    lang: "svelte",
    logo: SVELTE_LOGO,
    code: SVELTE_SNIPPET,
  },
  {
    id: "react-native",
    label: "React Native",
    lang: "tsx",
    logo: REACT_LOGO,
    code: REACT_NATIVE_SNIPPET,
  },
].map((f) => ({ ...f, tokens: highlight(f.code) }));

export function CodePanel() {
  const [active, setActive] = useState(0);
  const current = FRAMEWORKS[active];

  const onTablistKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const delta = e.key === "ArrowRight" ? 1 : -1;
    const next = (active + delta + FRAMEWORKS.length) % FRAMEWORKS.length;
    setActive(next);
    document.getElementById(`code-tab-${FRAMEWORKS[next].id}`)?.focus();
  };

  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-hairline bg-code-bg shadow-card-lg">
        <div className="flex h-12 items-center justify-between gap-3 border-b border-white/10 px-2 sm:px-3">
          {/* biome note: intentionally a manual tabs pattern — 4 static tabs */}
          <div
            role="tablist"
            aria-label="Framework"
            className="flex items-center gap-1"
            onKeyDown={onTablistKeyDown}
          >
            {FRAMEWORKS.map((f, i) => (
              <button
                key={f.id}
                id={`code-tab-${f.id}`}
                type="button"
                role="tab"
                aria-selected={i === active}
                aria-controls="code-panel"
                tabIndex={i === active ? 0 : -1}
                onClick={() => setActive(i)}
                className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors ${
                  i === active
                    ? "bg-white/10 text-code-fg"
                    : "text-code-mute hover:bg-white/5 hover:text-code-fg"
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  width={14}
                  height={14}
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d={f.logo} />
                </svg>
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden font-mono text-xs text-code-mute sm:inline">
              {current.lang}
            </span>
            <CopyButton
              text={current.code}
              className="h-8 w-8 text-code-mute hover:bg-white/10 hover:text-code-fg"
            />
          </div>
        </div>
        <pre
          id="code-panel"
          role="tabpanel"
          aria-labelledby={`code-tab-${current.id}`}
          className="overflow-x-auto p-5 font-mono text-[13px] leading-[1.6] text-code-fg"
        >
          <code>{current.tokens}</code>
        </pre>
      </div>
      <p className="mt-3 text-sm text-body">
        That is the whole thing — in React, Vue, Svelte or React Native. No wrappers,
        no keys, no from/to pairs, no configuration. Swap the pair for any two icons
        above.
      </p>
    </div>
  );
}
