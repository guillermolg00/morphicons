"use client";

import { Check, Copy } from "lucide";
import type { IconInput, SpringPreset } from "morphicons";
import { MorphIcon } from "morphicons/react";
import { useRef, useState } from "react";
import { byId, dOf, type Lib } from "@/lib/icons";
import { REACT_LOGO, SVELTE_LOGO, VUE_LOGO } from "@/lib/logos";
import {
  type Framework,
  FRAMEWORK_LABEL,
  type RecipeId,
  snippet,
  type SnippetOpts,
} from "@/lib/showcase-snippets";

/* Ordered by how often the swap appears in real shadcn/ui apps (the research
   that picked these six): copy 53, eye 41, sun/moon 27, play/pause 21,
   check/x 8, folder 6. Chevron pairs were left out on purpose — most sightings
   are separate prev/next buttons, not one morphing slot. */

const LIBS: { v: Lib; label: string }[] = [
  { v: "lucide", label: "Lucide" },
  { v: "heroicons", label: "Heroicons" },
  { v: "tabler", label: "Tabler" },
];

const FRAMEWORKS: { v: Framework; logo: string }[] = [
  { v: "react", logo: REACT_LOGO },
  { v: "vue", logo: VUE_LOGO },
  { v: "svelte", logo: SVELTE_LOGO },
];

const SPRINGS: SpringPreset[] = ["smooth", "snappy", "bouncy"];
const STROKES = [1, 1.5, 2, 2.5];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* Full-width segmented control, the sidebar's only input pattern. */
function Seg<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { v: T; label: string; icon?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-mute">
        {label}
      </span>
      <div
        role="group"
        aria-label={label}
        className="mt-2 grid auto-cols-fr grid-flow-col overflow-hidden rounded-md border border-hairline bg-canvas"
      >
        {options.map((o) => (
          <button
            key={String(o.v)}
            type="button"
            aria-pressed={value === o.v}
            onClick={() => onChange(o.v)}
            className={`flex h-8 items-center justify-center gap-1.5 text-[13px] transition-colors ${
              value === o.v
                ? "bg-ink text-canvas"
                : "text-body hover:bg-canvas-soft-2 hover:text-ink"
            }`}
          >
            {o.icon && (
              <svg
                viewBox="0 0 24 24"
                width={13}
                height={13}
                fill="currentColor"
                aria-hidden="true"
              >
                <path d={o.icon} />
              </svg>
            )}
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* The card's "get the code" action: copies the generated component and
   confirms with the library's own Copy → Check morph. */
function SnippetButton({
  recipe,
  title,
  opts,
}: {
  recipe: RecipeId;
  title: string;
  opts: SnippetOpts;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet(recipe, opts));
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
      aria-label={`Copy the ${title} component for ${FRAMEWORK_LABEL[opts.framework]}`}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-hairline bg-canvas pl-2 pr-2.5 text-xs font-medium text-body transition-colors hover:bg-canvas-soft-2 hover:text-ink"
    >
      <MorphIcon icon={copied ? Check : Copy} size={13} strokeWidth={2} spring="snappy" />
      {FRAMEWORK_LABEL[opts.framework]}
    </button>
  );
}

function Card({
  recipe,
  title,
  desc,
  opts,
  children,
}: {
  recipe: RecipeId;
  title: string;
  desc: string;
  opts: SnippetOpts;
  children: React.ReactNode;
}) {
  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-hairline bg-canvas shadow-card">
      <header className="flex items-start justify-between gap-3 border-b border-hairline px-5 py-4">
        <div>
          <h3 className="text-sm font-medium text-ink">{title}</h3>
          <p className="mt-0.5 text-[13px] text-mute">{desc}</p>
        </div>
        <SnippetButton recipe={recipe} title={title} opts={opts} />
      </header>
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        {children}
      </div>
    </article>
  );
}

/* One folder row of the tree demo. Module-scope on purpose: defining it
   inside Showcase would remount it (and reset the morph) on every control
   change. The disclosure chevron rotates in CSS — only the folder morphs. */
function TreeRow({
  name,
  files,
  defaultOpen = false,
  closedIcon,
  openIcon,
  spring,
  strokeWidth,
}: {
  name: string;
  files: string[];
  defaultOpen?: boolean;
  closedIcon: IconInput;
  openIcon: IconInput;
  spring: SpringPreset;
  strokeWidth: number;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-ink transition-colors hover:bg-canvas-soft-2"
      >
        <svg
          viewBox="0 0 8 10"
          width={8}
          height={10}
          fill="none"
          aria-hidden="true"
          className={`shrink-0 text-mute transition-transform ${open ? "rotate-90" : ""}`}
        >
          <path
            d="M1.5 1.5 6 5 1.5 8.5"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <MorphIcon
          icon={open ? openIcon : closedIcon}
          size={18}
          spring={spring}
          strokeWidth={strokeWidth}
          className="shrink-0 text-body"
        />
        {name}
      </button>
      {open && (
        <ul role="list" className="ml-[1.4rem] border-l border-hairline pl-3">
          {files.map((f) => (
            <li key={f} className="px-2 py-1 font-mono text-[13px] text-body">
              {f}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Showcase() {
  const [lib, setLib] = useState<Lib>("lucide");
  const [framework, setFramework] = useState<Framework>("react");
  const [spring, setSpring] = useState<SpringPreset>("snappy");
  const [strokeWidth, setStrokeWidth] = useState<number>(2);

  /* Per-demo state. */
  const [cmdCopied, setCmdCopied] = useState(false);
  const cmdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visible, setVisible] = useState(false);
  const [dark, setDark] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [email, setEmail] = useState("");

  const opts: SnippetOpts = { lib, framework, spring, strokeWidth };

  /* Icon data from the selected library, as the quantized canonical `d`
     (dOf): MorphIcon renders a string input verbatim, so server and client
     agree byte by byte — full-precision IconNode data would hydration-warn
     on arc-heavy icons (eye), whose trig last ulp differs per engine.
     Switching the library morphs every preview to its counterpart: same
     label, same 24×24 grid. */
  const d = (label: string): IconInput =>
    dOf((byId.get(`${lib}:${label}`) ?? byId.get(`lucide:${label}`))!);

  const morph = { spring, strokeWidth } as const;

  const copyCmd = async () => {
    try {
      await navigator.clipboard.writeText("npm i morphicons");
      setCmdCopied(true);
      if (cmdTimer.current) clearTimeout(cmdTimer.current);
      cmdTimer.current = setTimeout(() => setCmdCopied(false), 1600);
    } catch {
      /* clipboard unavailable: nothing to signal */
    }
  };

  return (
    <section
      aria-label="Component showcase"
      className="mx-auto w-full max-w-[1200px] px-6"
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:gap-6">
        {/* Controls: everything drives both the previews and the copied code. */}
        <aside className="lg:w-60 lg:shrink-0">
          <div className="grid gap-5 rounded-xl border border-hairline bg-canvas p-5 shadow-card sm:grid-cols-2 lg:sticky lg:top-6 lg:grid-cols-1">
            <Seg label="Library" options={LIBS} value={lib} onChange={setLib} />
            <Seg
              label="Framework"
              options={FRAMEWORKS.map((f) => ({
                v: f.v,
                label: FRAMEWORK_LABEL[f.v],
                icon: f.logo,
              }))}
              value={framework}
              onChange={setFramework}
            />
            <Seg
              label="Spring"
              options={SPRINGS.map((s) => ({ v: s, label: s }))}
              value={spring}
              onChange={setSpring}
            />
            <Seg
              label="Stroke"
              options={STROKES.map((s) => ({ v: s, label: String(s) }))}
              value={strokeWidth}
              onChange={setStrokeWidth}
            />
            <p className="text-[13px] leading-5 text-mute sm:col-span-2 lg:col-span-1">
              Previews run the React binding live. Each card copies the same
              component for your framework, spring and stroke included.
            </p>
          </div>
        </aside>

        {/* The six recipes, ordered by frequency in real shadcn/ui apps. */}
        <div className="grid flex-1 content-start gap-5 md:grid-cols-2">
          <Card
            recipe="copy"
            title="Copy to clipboard"
            desc="The most repeated swap in real apps: Copy settles into Check."
            opts={opts}
          >
            <span className="inline-flex h-11 items-center gap-3 rounded-md border border-hairline bg-canvas pl-4 pr-1.5 font-mono text-sm text-ink shadow-card">
              npm i morphicons
              <button
                type="button"
                onClick={copyCmd}
                aria-label={cmdCopied ? "Copied" : "Copy the install command"}
                className="flex h-8 w-8 items-center justify-center rounded text-mute transition-colors hover:bg-canvas-soft-2 hover:text-ink"
              >
                <MorphIcon
                  icon={cmdCopied ? d("check") : d("copy")}
                  size={18}
                  {...morph}
                />
              </button>
            </span>
          </Card>

          <Card
            recipe="password"
            title="Password visibility"
            desc="Eye to EyeOff on the input's trailing button."
            opts={opts}
          >
            <div className="relative w-full max-w-64">
              <input
                type={visible ? "text" : "password"}
                name="password"
                defaultValue="correct-horse-battery"
                aria-label="Password"
                className="h-10 w-full rounded-md border border-hairline bg-canvas pl-3.5 pr-10 text-base text-ink outline-none focus:border-ink sm:text-sm"
              />
              <button
                type="button"
                onClick={() => setVisible((v) => !v)}
                aria-label={visible ? "Hide password" : "Show password"}
                aria-pressed={visible}
                className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded text-mute transition-colors hover:text-ink"
              >
                <MorphIcon
                  icon={visible ? d("eye-off") : d("eye")}
                  size={18}
                  {...morph}
                />
              </button>
            </div>
          </Card>

          <Card
            recipe="theme"
            title="Theme toggle"
            desc="Sun to Moon in one slot: no double SVG, no CSS swap."
            opts={opts}
          >
            <button
              type="button"
              onClick={() => setDark((v) => !v)}
              aria-label="Toggle theme"
              aria-pressed={dark}
              className="flex h-11 w-11 items-center justify-center rounded-md border border-hairline bg-canvas text-body shadow-card transition-colors hover:bg-canvas-soft-2 hover:text-ink"
            >
              <MorphIcon icon={dark ? d("moon") : d("sun")} size={20} {...morph} />
            </button>
          </Card>

          <Card
            recipe="player"
            title="Player controls"
            desc="Play and pause, plus mute on the same cluster."
            opts={opts}
          >
            <div className="flex w-full max-w-64 flex-col gap-3 rounded-lg border border-hairline bg-canvas p-3.5 shadow-card">
              <div className="flex items-center justify-between font-mono text-[11px] text-mute">
                <span>ambient-01.wav</span>
                <span className="tabular-nums">3:42</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-canvas-soft-2">
                <div className="h-full w-1/3 rounded-full bg-ink" />
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPlaying((p) => !p)}
                  aria-label={playing ? "Pause" : "Play"}
                  className="flex h-9 w-9 items-center justify-center rounded-md bg-ink text-canvas transition-opacity hover:opacity-90"
                >
                  <MorphIcon
                    icon={playing ? d("pause") : d("play")}
                    size={17}
                    {...morph}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => setMuted((m) => !m)}
                  aria-label={muted ? "Unmute" : "Mute"}
                  aria-pressed={muted}
                  className="flex h-9 w-9 items-center justify-center rounded-md text-body transition-colors hover:bg-canvas-soft-2 hover:text-ink"
                >
                  <MorphIcon
                    icon={muted ? d("volume-x") : d("volume")}
                    size={17}
                    {...morph}
                  />
                </button>
              </div>
            </div>
          </Card>

          <Card
            recipe="validation"
            title="Inline validation"
            desc="The trailing icon tracks the field: Check when valid, X when not."
            opts={opts}
          >
            <div className="relative w-full max-w-64">
              <input
                type="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                aria-label="Email"
                className="h-10 w-full rounded-md border border-hairline bg-canvas pl-3.5 pr-10 text-base text-ink outline-none placeholder:text-mute focus:border-ink sm:text-sm"
              />
              {/* Stays mounted so valid ↔ invalid morphs instead of remounting. */}
              <MorphIcon
                icon={EMAIL.test(email) ? d("check") : d("x")}
                size={18}
                {...morph}
                className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink ${
                  email ? "" : "opacity-0"
                }`}
              />
            </div>
          </Card>

          <Card
            recipe="tree"
            title="File tree"
            desc="Folders morph open; the disclosure chevron stays CSS."
            opts={opts}
          >
            <div className="w-full max-w-64">
              <TreeRow
                name="components"
                files={["button.tsx", "input.tsx", "toggle.tsx"]}
                defaultOpen
                closedIcon={d("folder")}
                openIcon={d("folder-open")}
                {...morph}
              />
              <TreeRow
                name="lib"
                files={["utils.ts"]}
                closedIcon={d("folder")}
                openIcon={d("folder-open")}
                {...morph}
              />
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}
