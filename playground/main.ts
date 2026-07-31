/* morphicons playground — consumes the REAL library: createMorph (DOM driver)
   for polar mode, and the core primitives (buildPlan + interpLinear +
   Spring) for the linear comparison mode. Icons come from three different
   libraries to demonstrate the universal input: Lucide imported live as
   IconNode, Feather and Tabler vendored (vendor-icons.ts).

   Method rule (CLAUDE.md): quality is validated by eye — the scrubber
   freezes any pair at an exact t to inspect the intermediate states. */

import {
  Aperture,
  ArrowDown,
  ArrowRight,
  Bell,
  Camera,
  Check,
  Circle,
  Diamond,
  Heart,
  House,
  Menu,
  Moon,
  Play,
  Plus,
  Search,
  Settings,
  Square,
  Star,
  Sun,
  Triangle,
  X,
  Zap,
} from "lucide";
import { createMorph } from "../src/dom/index";
import {
  allocOutputs,
  buildPlan,
  cubicsToPathD,
  type IconInput,
  iconToCubics,
  interpLinear,
  type MorphPlan,
  resampleIcon,
  type Sampled,
  SPRING_PRESETS,
  Spring,
  type SpringPreset,
  serialize,
} from "../src/index";
import { FEATHER, TABLER } from "./vendor-icons";

type Lib = "lucide" | "feather" | "tabler";

interface Entry {
  id: string;
  label: string;
  lib: Lib;
  data: IconInput;
}

const LUCIDE: Record<string, IconInput> = {
  menu: Menu,
  x: X,
  check: Check,
  plus: Plus,
  "arrow-right": ArrowRight,
  "arrow-down": ArrowDown,
  square: Square,
  circle: Circle,
  diamond: Diamond,
  triangle: Triangle,
  heart: Heart,
  star: Star,
  bell: Bell,
  settings: Settings,
  camera: Camera,
  sun: Sun,
  moon: Moon,
  search: Search,
  play: Play,
  aperture: Aperture,
  house: House,
  zap: Zap,
};

const entriesOf = (lib: Lib, icons: Record<string, IconInput>): Entry[] =>
  Object.entries(icons).map(([label, data]) => ({
    id: `${lib}:${label}`,
    label,
    lib,
    data,
  }));

const REGISTRY: Entry[] = [
  ...entriesOf("lucide", LUCIDE),
  ...entriesOf("feather", FEATHER),
  ...entriesOf("tabler", TABLER),
];

// ---------------------------------------------------------------------------
// DOM

function must<T>(v: T | null): T {
  if (v === null) throw new Error("playground: node not found");
  return v;
}

const pathEl = must(document.querySelector<SVGPathElement>("#mp"));
const pairEl = must(document.getElementById("pair"));
const mathEl = must(document.getElementById("math"));
const verdictEl = must(document.getElementById("verdict"));
const scrubPairEl = must(document.getElementById("scrubpair"));
const slider = must(document.querySelector<HTMLInputElement>("#tslider"));
const tvalEl = must(document.getElementById("tval"));

// ---------------------------------------------------------------------------
// Playground core

const dCache = new Map<string, string>();
const dOf = (e: Entry): string => {
  let d = dCache.get(e.id);
  if (!d) {
    d = typeof e.data === "string" ? e.data : cubicsToPathD(iconToCubics(e.data));
    dCache.set(e.id, d);
  }
  return d;
};

const sampleCache = new Map<string, Sampled[]>();
const samplesOf = (e: Entry): Sampled[] => {
  let s = sampleCache.get(e.id);
  if (!s) {
    s = resampleIcon(e.data);
    sampleCache.set(e.id, s);
  }
  return s;
};

let cur: Entry = REGISTRY[0];
let prev: Entry | null = null;
let mode: "polar" | "linear" = "polar";
let preset: SpringPreset = "snappy";
let scrubActive = false;

const m = createMorph(pathEl, cur.data);

// Linear mode: a local mini-driver over the core primitives (the real
// driver is polar on purpose — linear exists only for eyeball comparison).
const lin = {
  plan: null as MorphPlan | null,
  out: null as Float64Array[] | null,
  closed: null as boolean[] | null,
  spring: new Spring(),
  raf: 0,
  last: -1,
};

function linReset(): void {
  if (lin.raf) cancelAnimationFrame(lin.raf);
  lin.raf = 0;
  lin.last = -1;
  lin.plan = null;
  lin.out = null;
  lin.closed = null;
}

function linRender(t: number): void {
  if (!lin.plan || !lin.out || !lin.closed) return;
  interpLinear(lin.plan, t, lin.out);
  pathEl.setAttribute("d", serialize(lin.out, lin.closed));
}

function linTick(ts: number): void {
  const dt = lin.last < 0 ? 0 : Math.min((ts - lin.last) / 1000, 0.1);
  lin.last = ts;
  const done = lin.spring.step(dt);
  linRender(lin.spring.x);
  if (done) {
    pathEl.setAttribute("d", dOf(cur));
    linReset();
    return;
  }
  lin.raf = requestAnimationFrame(linTick);
}

function linPlanTo(next: Entry): void {
  // From flight or scrub, the source is the rendered intermediate shape.
  const src: Sampled[] =
    lin.plan && lin.out
      ? lin.out.map((o, k) => ({
          pts: Float64Array.from(o),
          closed: (lin.plan as MorphPlan).items[k].closed,
        }))
      : samplesOf(cur);
  lin.plan = buildPlan(src, samplesOf(next));
  lin.out = allocOutputs(lin.plan);
  lin.closed = lin.plan.items.map((it) => it.closed);
}

function linMorphTo(next: Entry): void {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    linReset();
    pathEl.setAttribute("d", dOf(next));
    return;
  }
  const flying = lin.raf !== 0;
  linPlanTo(next);
  const p = SPRING_PRESETS[preset];
  lin.spring.config(p.k, p.c);
  if (!flying) lin.spring.v = 0;
  lin.spring.start();
  if (!flying) {
    lin.last = -1;
    lin.raf = requestAnimationFrame(linTick);
  }
}

// ---------------------------------------------------------------------------
// Math readout: the rest→rest plan of the active pair (informative; an
// interruption flies with its own plan from the intermediate shape).

const fmtDeg = (rad: number): string => `${Math.round((rad * 180) / Math.PI)}°`;

function updateReadout(): void {
  pairEl.textContent = prev ? `${prev.label} → ${cur.label}` : cur.label;
  if (!prev) {
    mathEl.textContent = "tap an icon to start";
    verdictEl.textContent = "";
    verdictEl.classList.remove("pure");
    return;
  }
  const a = samplesOf(prev);
  const b = samplesOf(cur);
  const plan = buildPlan(a, b);
  const items = plan.items;
  const shown = items.slice(0, 6);
  const more = items.length > 6 ? ` +${items.length - 6}` : "";
  const th = shown.map((it) => fmtDeg(it.theta)).join(" ");
  const sg = shown.map((it) => Math.exp(it.lnSigma).toFixed(2)).join(" ");
  const maxRes = Math.max(...items.map((it) => it.res));
  const maxTh = Math.max(...items.map((it) => Math.abs(it.theta)));
  const subs = a.length === b.length ? `${items.length}sp` : `${a.length}→${b.length}sp`;
  mathEl.textContent = `${subs}  θ [${th}${more}]  σ [${sg}${more}]  res ${maxRes.toFixed(3)}`;

  let verdict: string;
  let pure = false;
  if (mode === "linear") {
    verdict = "linear mode — coordinate lerp, no decomposition";
  } else if (maxRes < 0.03 && maxTh > 0.09) {
    verdict = "pure rotation — emergent rotation group";
    pure = true;
  } else if (maxRes < 0.03) {
    verdict = "pure similarity — translation / scale";
  } else if (maxRes < 0.3) {
    verdict = "dominant rotation + non-rigid residual";
  } else {
    verdict = "coordinate morph in the aligned frame";
  }
  if (a.length !== b.length) verdict += " · cell division";
  verdictEl.textContent = verdict;
  verdictEl.classList.toggle("pure", pure);
}

// ---------------------------------------------------------------------------
// Scrub: freezes the pair (prev → cur) at t. In polar mode it uses m.seek —
// the controlled-mode primitive; a later morphTo takes off from there.

function scrubTo(t: number): void {
  if (!prev) return;
  slider.value = String(t);
  tvalEl.textContent = `t = ${t.toFixed(3)}`;
  if (mode === "polar") {
    if (!scrubActive) m.set(prev.data); // return to the pair's origin once
    scrubActive = true;
    m.seek(cur.data, t);
  } else {
    if (!lin.plan) {
      const src = samplesOf(prev);
      lin.plan = buildPlan(src, samplesOf(cur));
      lin.out = allocOutputs(lin.plan);
      lin.closed = lin.plan.items.map((it) => it.closed);
    }
    if (lin.raf) {
      cancelAnimationFrame(lin.raf);
      lin.raf = 0;
      lin.last = -1;
    }
    linRender(t);
  }
}

function resetScrubUI(): void {
  scrubActive = false;
  slider.value = "1";
  tvalEl.textContent = "t = 1.000";
  if (prev) {
    slider.disabled = false;
    scrubPairEl.textContent = `${prev.label} → ${cur.label}`;
  }
}

// ---------------------------------------------------------------------------
// Navigation

function setActive(): void {
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-icon]")) {
    b.classList.toggle("active", b.dataset.icon === cur.id);
  }
}

function goTo(next: Entry): void {
  if (next.id === cur.id && !scrubActive && !lin.raf) return;
  prev = cur;
  cur = next;
  if (mode === "polar") {
    m.morphTo(next.data, preset);
  } else {
    linMorphTo(next);
  }
  setActive();
  updateReadout();
  resetScrubUI();
}

/** Switching mode or preset cuts the animation and settles on the current
 *  icon — each mode has its own engine and in-flight states don't carry over. */
function quiesce(): void {
  linReset();
  m.set(cur.data);
  scrubActive = false;
  resetScrubUI();
}

// ---------------------------------------------------------------------------
// UI construction

function buildGrid(lib: Lib): void {
  const root = must(document.getElementById(`grid-${lib}`));
  for (const e of REGISTRY.filter((r) => r.lib === lib)) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.icon = e.id;
    b.title = e.id;
    b.setAttribute("aria-label", `Go to ${e.label} (${e.lib})`);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", dOf(e));
    svg.appendChild(p);
    b.appendChild(svg);
    b.addEventListener("click", () => goTo(e));
    root.appendChild(b);
  }
}
buildGrid("lucide");
buildGrid("feather");
buildGrid("tabler");

must(document.getElementById("stage")).addEventListener("click", () => {
  const i = REGISTRY.findIndex((e) => e.id === cur.id);
  goTo(REGISTRY[(i + 1) % REGISTRY.length]);
});

function segmented(id: string, onPick: (v: string) => void): void {
  const root = must(document.getElementById(id));
  for (const b of root.querySelectorAll<HTMLButtonElement>("button")) {
    b.addEventListener("click", () => {
      for (const x of root.querySelectorAll("button")) x.classList.remove("active");
      b.classList.add("active");
      onPick(b.dataset.v ?? "");
    });
  }
}
segmented("mode", (v) => {
  mode = v === "linear" ? "linear" : "polar";
  quiesce();
  updateReadout();
});
segmented("preset", (v) => {
  preset = (v in SPRING_PRESETS ? v : "snappy") as SpringPreset;
  quiesce();
});

slider.addEventListener("input", () => {
  scrubTo(Number(slider.value));
});
for (const b of must(document.getElementById("tquick")).querySelectorAll("button")) {
  b.addEventListener("click", () => {
    scrubTo(Number((b as HTMLButtonElement).dataset.t ?? "1"));
  });
}

setActive();
updateReadout();
