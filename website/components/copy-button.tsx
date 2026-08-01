"use client";

import { Check, Copy } from "lucide";
import { MorphIcon } from "morphicons/react";
import { useRef, useState } from "react";

/* Copy-to-clipboard button whose icon morphs Copy → Check: the library
   demoing itself in the page chrome. */
export function CopyButton({
  text,
  className = "",
  size = 16,
}: {
  text: string;
  className?: string;
  size?: number;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable (permissions, http): nothing to signal */
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Copied" : "Copy to clipboard"}
      className={`inline-flex items-center justify-center rounded-md transition-colors active:scale-[0.96] ${className}`}
    >
      <MorphIcon icon={copied ? Check : Copy} size={size} strokeWidth={2} />
    </button>
  );
}

/* The install command chip: mono one-liner + morphing copy button. */
export function InstallCommand({ className = "" }: { className?: string }) {
  const cmd = "npm install morphicons";
  return (
    <span
      className={`inline-flex h-11 items-center gap-3 rounded-md border border-hairline bg-canvas pl-4 pr-2 font-mono text-sm text-ink shadow-card ${className}`}
    >
      <span aria-hidden="true" className="select-none text-mute">
        $
      </span>
      {cmd}
      <CopyButton
        text={cmd}
        className="h-8 w-8 text-mute hover:bg-canvas-soft-2 hover:text-ink"
      />
    </span>
  );
}
