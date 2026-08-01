"use client";

import { Pause, Play } from "lucide";
import { buildPlan, resampleIcon, type Sampled } from "morphicons";
import { createMorph, type Morph } from "morphicons/dom";
import { MorphIcon } from "morphicons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CodePanel } from "@/components/code-panel";
import { StaticIcon } from "@/components/static-icon";
import type { CodegenConfig } from "@/lib/codegen";
import { byId, dOf, type IconEntry, ICONS, type Lib } from "@/lib/icons";

type Tab = "all" | Lib;

const TABS: { v: Tab; label: string }[] = [
  { v: "all", label: "All" },
  { v: "lucide", label: "Lucide" },
  { v: "feather", label: "Feather" },
  { v: "tabler", label: "Tabler" },
];

/* The set the page loads with, autoplaying: simple strokes first, the
   emergent rotations (arrows), then the closed shapes (heart → star). */
const DEFAULT_SEQ = [
  "lucide:x",
  "lucide:plus",
  "lucide:arrow-right",
  "lucide:arrow-down",
  "lucide:check",
  "lucide:chevron-down",
  "lucide:heart",
  "lucide:star",
];

const SPRINGS = ["smooth", "snappy", "bouncy"] as const;
const STROKES = [1, 1.5, 2, 2.5] as const;
const SIZES = [16, 20, 24, 32, 48] as const;

const sampleCache = new Map<string, Sampled[]>();
function samplesOf(e: IconEntry): Sampled[] {
  let s = sampleCache.get(e.id);
  if (!s) {
    s = resampleIcon(e.data);
    sampleCache.set(e.id, s);
  }
  return s;
}

const fmtDeg = (rad: number): string => `${Math.round((rad * 180) / Math.PI)}°`;

/* Similarity readout of the rest-to-rest plan for the pair, like the
   playground: the math is the product, so the page shows it. */
function useReadout(prevId: string | null, curId: string) {
  return useMemo(() => {
    if (!prevId || prevId === curId) return null;
    const a = byId.get(prevId);
    const b = byId.get(curId);
    if (!a || !b) return null;
    const plan = buildPlan(samplesOf(a), samplesOf(b));
    const items = plan.items;
    const maxRes = Math.max(...items.map((it) => it.res));
    const maxTh = Math.max(...items.map((it) => Math.abs(it.theta)));
    const shown = items.slice(0, 4);
    const more = items.length > 4 ? ` +${items.length - 4}` : "";
    let verdict: string;
    if (maxRes < 0.03 && maxTh > 0.09) verdict = "pure rotation, emergent";
    else if (maxRes < 0.03) verdict = "pure similarity";
    else if (maxRes < 0.3) verdict = "rotation + residual";
    else verdict = "coordinate morph, aligned frame";
    if (a.data !== b.data && samplesOf(a).length !== samplesOf(b).length)
      verdict += " · cell division";
    return {
      pair: `${a.label} → ${b.label}`,
      stats: `θ [${shown.map((it) => fmtDeg(it.theta)).join(" ")}${more}]  res ${maxRes.toFixed(3)}`,
      verdict,
    };
  }, [prevId, curId]);
}

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { v: T; label: string }[] | readonly T[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const opts = options.map((o) =>
    typeof o === "object" ? o : { v: o, label: String(o) },
  ) as { v: T; label: string }[];
  return (
    <div className="flex items-center gap-2.5">
      <span className="font-mono text-[11px] text-mute">{label}</span>
      <div className="flex overflow-hidden rounded-md border border-hairline bg-canvas">
        {opts.map((o) => (
          <button
            key={String(o.v)}
            type="button"
            aria-pressed={value === o.v}
            onClick={() => onChange(o.v)}
            className={`h-7 px-2.5 text-[13px] transition-colors ${
              value === o.v
                ? "bg-ink text-canvas"
                : "text-body hover:bg-canvas-soft-2 hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Studio() {
  const [seq, setSeq] = useState<string[]>(DEFAULT_SEQ);
  const [curId, setCurId] = useState(DEFAULT_SEQ[0]);
  const [prevId, setPrevId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [spring, setSpring] = useState<CodegenConfig["spring"]>("snappy");
  const [strokeWidth, setStrokeWidth] = useState<number>(2);
  const [size, setSize] = useState<number>(24);
  const [playing, setPlaying] = useState(true);
  const [t, setT] = useState(1);

  const cur = byId.get(curId) ?? ICONS[0];
  const readout = useReadout(prevId, curId);

  /* The stage consumes the vanilla driver directly: morphTo for taps and
     autoplay, set + seek for the scrubber (the same primitives the generated
     vanilla snippet uses). React renders the initial d once; from then on the
     driver owns the attribute. */
  const pathRef = useRef<SVGPathElement>(null);
  const morphRef = useRef<Morph | null>(null);
  const scrubbing = useRef(false);
  const initialEntry = useRef(cur);
  const [initialD] = useState(() => dOf(cur));

  useEffect(() => {
    const el = pathRef.current;
    if (!el) return;
    const m = createMorph(el, initialEntry.current.data);
    morphRef.current = m;
    return () => {
      m.destroy();
      morphRef.current = null;
    };
  }, []);

  const goTo = (id: string) => {
    if (id === curId) return;
    const e = byId.get(id);
    if (!e) return;
    setPrevId(curId);
    setCurId(id);
    setT(1);
    scrubbing.current = false;
    morphRef.current?.morphTo(e.data, spring);
  };

  const advance = () => {
    if (seq.length < 2) return;
    const i = seq.indexOf(curId);
    goTo(seq[(i + 1 + seq.length) % seq.length]);
  };

  // Re-armed on every tick (curId changes), so it behaves as a delay chain.
  useEffect(() => {
    if (!playing || seq.length < 2) return;
    const timer = setInterval(() => {
      const i = seq.indexOf(curId);
      const next = byId.get(seq[(i + 1 + seq.length) % seq.length]);
      if (!next) return;
      setPrevId(curId);
      setCurId(next.id);
      setT(1);
      scrubbing.current = false;
      morphRef.current?.morphTo(next.data, spring);
    }, 1300);
    return () => clearInterval(timer);
  }, [playing, seq, curId, spring]);

  /* Scrub: freeze the prev → cur pair at t. On the first input the driver is
     re-based on prev (playground pattern); a later tap takes off from the
     frozen shape with velocity intact. */
  const scrub = (v: number) => {
    setT(v);
    if (!prevId) return;
    const a = byId.get(prevId);
    const b = byId.get(curId);
    const m = morphRef.current;
    if (!a || !b || !m) return;
    setPlaying(false);
    if (!scrubbing.current) {
      m.set(a.data);
      scrubbing.current = true;
    }
    m.seek(b.data, v);
  };

  const pick = (id: string) => {
    if (!seq.includes(id)) setSeq((s) => [...s, id]);
    goTo(id);
  };

  const remove = (id: string) => {
    if (seq.length <= 1) return;
    const next = seq.filter((x) => x !== id);
    setSeq(next);
    if (id === curId) goTo(next[Math.min(seq.indexOf(id), next.length - 1)]);
  };

  const query = q.trim().toLowerCase();
  const shown = ICONS.filter(
    (e) => (tab === "all" || e.lib === tab) && (!query || e.label.includes(query)),
  );

  const entries = seq
    .map((id) => byId.get(id))
    .filter((e): e is IconEntry => e !== undefined);
  const cfg = useMemo<CodegenConfig>(
    () => ({ spring, size, strokeWidth }),
    [spring, size, strokeWidth],
  );

  return (
    <section aria-label="Morph studio" className="mx-auto w-full max-w-[1200px] px-6">
      <div className="overflow-hidden rounded-xl border border-hairline bg-canvas shadow-card-lg">
        <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          {/* Stage: the morph itself, over the page's single mesh gradient. */}
          <div className="relative flex flex-col items-center justify-center gap-6 border-b border-hairline p-8 lg:border-b-0 lg:border-r">
            <div aria-hidden="true" className="mesh pointer-events-none absolute inset-10" />
            <button
              type="button"
              onClick={() => advance()}
              aria-label="Morph to the next icon in your set"
              title="Morph to the next icon"
              className="relative rounded-xl p-4 text-ink transition-transform active:scale-[0.97]"
            >
              <svg
                viewBox="0 0 24 24"
                width={144}
                height={144}
                fill="none"
                stroke="currentColor"
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path ref={pathRef} d={initialD} suppressHydrationWarning />
              </svg>
            </button>
            <div className="relative flex min-h-10 flex-col items-center gap-0.5 text-center font-mono text-[11px] leading-4">
              {readout ? (
                <>
                  <span className="text-body">{readout.pair}</span>
                  <span className="text-mute">{readout.stats}</span>
                  <span className="text-mute">{readout.verdict}</span>
                </>
              ) : (
                <span className="text-mute">pick icons to morph between them</span>
              )}
            </div>
            {/* Scrubber: drive the active pair by hand, t from 0 to 1. */}
            <div className="relative flex w-full max-w-72 items-center gap-3">
              <input
                type="range"
                min={0}
                max={1}
                step={0.001}
                value={t}
                disabled={!prevId}
                onChange={(e) => scrub(Number(e.target.value))}
                aria-label="Scrub the morph between the previous and current icon"
                className="scrub w-full"
              />
              <span className="w-12 shrink-0 text-right font-mono text-[11px] text-mute">
                t={t.toFixed(2)}
              </span>
            </div>
            {/* The set: tap to morph, x to drop. */}
            <div className="relative flex flex-wrap items-center justify-center gap-2">
              {entries.map((e) => (
                <span key={e.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => goTo(e.id)}
                    aria-label={`Morph to ${e.label}`}
                    aria-current={e.id === curId}
                    className={`flex h-10 w-10 items-center justify-center rounded-lg border transition-colors ${
                      e.id === curId
                        ? "border-ink text-ink"
                        : "border-hairline text-body hover:bg-canvas-soft-2 hover:text-ink"
                    }`}
                  >
                    <StaticIcon entry={e} size={18} />
                  </button>
                  {seq.length > 1 && (
                    <button
                      type="button"
                      onClick={() => remove(e.id)}
                      aria-label={`Remove ${e.label} from the set`}
                      className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-ink text-[9px] leading-none text-canvas group-focus-within:flex group-hover:flex"
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
              <span aria-hidden="true" className="mx-1.5 h-6 w-px bg-hairline" />
              <button
                type="button"
                onClick={() => setPlaying((p) => !p)}
                disabled={seq.length < 2}
                aria-pressed={playing}
                aria-label={playing ? "Pause the sequence" : "Play the sequence"}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-hairline bg-canvas text-body shadow-card transition-colors hover:bg-canvas-soft-2 hover:text-ink disabled:opacity-40"
              >
                <MorphIcon icon={playing ? Pause : Play} size={16} strokeWidth={2} />
              </button>
            </div>
          </div>

          {/* Picker: library tabs, search, grid. */}
          <div className="flex flex-col gap-4 p-6">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex overflow-hidden rounded-md border border-hairline">
                {TABS.map((t) => (
                  <button
                    key={t.v}
                    type="button"
                    aria-pressed={tab === t.v}
                    onClick={() => setTab(t.v)}
                    className={`h-9 px-3 text-[13px] transition-colors ${
                      tab === t.v
                        ? "bg-ink text-canvas"
                        : "text-body hover:bg-canvas-soft-2 hover:text-ink"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="relative min-w-40 flex-1">
                <StaticIcon
                  entry={byId.get("lucide:search") as IconEntry}
                  size={15}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-mute"
                />
                <input
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search icons"
                  aria-label="Search icons"
                  className="h-9 w-full rounded-md border border-hairline bg-canvas pl-8 pr-3 text-sm text-ink outline-none placeholder:text-mute focus:border-ink"
                />
              </div>
            </div>
            {shown.length > 0 ? (
              <div className="icon-pane grid max-h-80 grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] content-start gap-1 overflow-y-auto pr-1">
                {shown.map((e) => {
                  const added = seq.includes(e.id);
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => pick(e.id)}
                      title={e.id}
                      aria-label={`Add ${e.label} (${e.lib})`}
                      aria-pressed={added}
                      className={`flex aspect-square items-center justify-center rounded-lg border transition-colors ${
                        added
                          ? "border-hairline bg-canvas-soft-2 text-ink"
                          : "border-transparent text-body hover:border-hairline hover:text-ink"
                      }`}
                    >
                      <StaticIcon entry={e} size={20} />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex max-h-80 flex-1 flex-col items-center justify-center gap-2 py-12 text-center">
                <p className="text-sm text-body">
                  Nothing matches &ldquo;{q.trim()}&rdquo;.
                </p>
                <button
                  type="button"
                  onClick={() => setQ("")}
                  className="text-sm text-link hover:underline"
                >
                  Clear the search
                </button>
              </div>
            )}
            <p className="text-[13px] text-mute">
              Click an icon to add it to your set. Icons from different libraries morph into
              each other: they all share the 24×24 grid.
            </p>
          </div>
        </div>

        {/* Config: everything below feeds the generated code. */}
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-hairline bg-canvas-soft px-6 py-4">
          <Segmented
            label="spring"
            options={SPRINGS.map((s) => ({ v: s, label: s }))}
            value={spring}
            onChange={setSpring}
          />
          <Segmented label="stroke" options={STROKES} value={strokeWidth} onChange={setStrokeWidth} />
          <Segmented label="size" options={SIZES} value={size} onChange={setSize} />
        </div>
      </div>

      <CodePanel entries={entries} cfg={cfg} className="mt-10" />
    </section>
  );
}
