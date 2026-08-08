import { CopyButton } from "@/components/copy-button";
import { highlight } from "@/lib/highlight";

/* A single code block in the CodePanel's visual language: dark panel, mono
   label, morphing copy button. For the showcase tabs, where there is one
   snippet to show, not one per framework. */
export function SnippetBlock({ label, code }: { label: string; code: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-hairline bg-code-bg shadow-card-lg">
      <div className="flex h-12 items-center justify-between gap-3 border-b border-white/10 pl-4 pr-2 sm:pr-3">
        <span className="font-mono text-xs text-code-mute">{label}</span>
        <CopyButton
          text={code}
          className="h-8 w-8 text-code-mute hover:bg-white/10 hover:text-code-fg"
        />
      </div>
      <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-[1.6] text-code-fg">
        <code>{highlight(code)}</code>
      </pre>
    </div>
  );
}
