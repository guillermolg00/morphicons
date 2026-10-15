/* Regions playground — the REAL library end to end: upstream Iconify markup
   → svgToIcon (adapters) → createMorph (DOM driver). Stroke↔stroke pairs fly
   on the centerline pipeline; any pair with a fill icon flies as regions,
   whose normalizer arrives as a lazy chunk. The region loader is replaced
   by an instrumented one that imports the SAME chunk, so the network bar
   (served by scripts/serve-regions.ts) exercises the real failure modes.

   Method rule (CLAUDE.md): quality is validated by eye — the explorer's
   scrubber freezes any pair at an exact t, and its ghost overlays the
   original SVG as the browser renders it. */

import { svgToIcon } from "../src/adapters/index";
import { allocOutputs, interpPolar } from "../src/core/interpolate";
import { type Paint, paintOf } from "../src/core/region";
import { serialize } from "../src/core/serialize";
import type { SpringPreset } from "../src/core/spring";
import type { IconInput, IconNode } from "../src/core/types";
import {
  createMorph,
  type Morph,
  type MorphOptions,
  preloadRegion,
  setRegionLoader,
} from "../src/dom/index";
import { CONCEPTS, SETS } from "./vendor-regions";

type RegionModule = typeof import("../src/region/index");

const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;
const SVGNS = "http://www.w3.org/2000/svg";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : Number.NaN;
};
const pct = (xs: number[], q: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : Number.NaN;
};

// ---------------------------------------------------------------------------
// Network: the server throttles lazy chunks by this cookie.

const netSel = $<HTMLSelectElement>("net");
const cookieNet = /(?:^|; )net=([^;]*)/.exec(document.cookie)?.[1];
if (cookieNet) netSel.value = decodeURIComponent(cookieNet);
const setNet = () => {
  // biome-ignore lint/suspicious/noDocumentCookie: cookieStore needs a secure context; the preview is plain http on the tailnet.
  document.cookie = `net=${encodeURIComponent(netSel.value)}; path=/; SameSite=Lax`;
  log(`network → ${netSel.value}`);
};
netSel.addEventListener("change", setNet);

const logEl = $("log");
function log(msg: string, cls = ""): void {
  const line = document.createElement("div");
  if (cls) line.className = cls;
  line.textContent = `${(performance.now() / 1000).toFixed(2).padStart(7)}s  ${msg}`;
  logEl.prepend(line);
}

const pill = $("chunk");
const setPill = (cls: string, text: string) => {
  pill.className = `pill ${cls}`;
  pill.textContent = text;
};

// Instrumented loader: same dynamic import as the driver's default (one
// chunk), plus timing. Resolve timestamps feed the "load cost" bench.
let attempts = 0;
const resolvedAt: number[] = [];
setRegionLoader(() => {
  const n = ++attempts;
  const t0 = performance.now();
  setPill("busy", `region chunk: loading #${n}…`);
  log(`#${n} import() start · network=${netSel.value}`);
  return import("../src/region/index").then(
    (m) => {
      const t1 = performance.now();
      resolvedAt.push(t1);
      setPill("ok", `region chunk: loaded in ${(t1 - t0).toFixed(0)} ms`);
      log(`#${n} loaded in ${(t1 - t0).toFixed(1)} ms`, "g");
      return m;
    },
    (e: unknown) => {
      setPill("bad", `region chunk: failed #${n} (retries on next need)`);
      log(
        `#${n} FAILED after ${(performance.now() - t0).toFixed(0)} ms: ${(e as Error)?.message ?? e}`,
        "e",
      );
      throw e;
    },
  );
});

$("preload").addEventListener("click", () => {
  preloadRegion().catch(() => {});
});
$("cold").addEventListener("click", () => location.reload());

// ---------------------------------------------------------------------------
// Icons: every upstream SVG parsed ONCE (stable references → plan caches).

interface Ico {
  id: string;
  label: string;
  concept: string;
  set: string;
  svg: string;
  icon: IconInput;
  paint: Paint;
  sw: number; // stroke width on the 24 grid (stroke icons)
}

const strokeWidthOf = (svg: string): number => {
  const sw = /stroke-width="([\d.]+)"/.exec(svg);
  const vb = /viewBox="([^"]+)"/.exec(svg);
  const w = vb ? Number(vb[1].trim().split(/[\s,]+/)[2]) : 24;
  return sw ? (Number(sw[1]) * 24) / w : 2;
};

const ICONS = new Map<string, Ico>();
const SET_KEYS = Object.keys(SETS);
for (const key of SET_KEYS) {
  const s = SETS[key];
  for (const c of CONCEPTS) {
    const e = s.icons[c];
    if (!e) continue;
    const icon = svgToIcon(e.svg);
    ICONS.set(`${key}:${c}`, {
      id: `${key}:${c}`,
      label: `${s.label} ${s.variant} · ${e.name}`,
      concept: c,
      set: key,
      svg: e.svg,
      icon,
      paint: paintOf(icon),
      sw: strokeWidthOf(e.svg),
    });
  }
}

const attrsToMarkup = (node: IconNode): string =>
  node
    .map(
      ([tag, a]) =>
        `<${tag} ${Object.entries(a)
          .map(([k, v]) => `${k}="${v}"`)
          .join(" ")}/>`,
    )
    .join("");

const custom = (id: string, label: string, node: IconNode): void => {
  ICONS.set(id, {
    id,
    label,
    concept: id,
    set: "custom",
    svg: `<svg viewBox="0 0 24 24">${attrsToMarkup(node)}</svg>`,
    icon: node,
    paint: paintOf(node),
    sw: 2,
  });
};
custom("custom:cross-rects", "cross · 2 overlapping rects", [
  ["rect", { x: 10, y: 4, width: 4, height: 16, fill: "currentColor" }],
  ["rect", { x: 4, y: 10, width: 16, height: 4, fill: "currentColor" }],
]);
custom("custom:cross-outline", "cross · 1 outline", [
  ["path", { d: "M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z", fill: "currentColor" }],
]);
custom("custom:ring", "ring · evenodd", [
  [
    "path",
    {
      d: "M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20zM12 6a6 6 0 1 1 0 12a6 6 0 1 1 0-12z",
      "fill-rule": "evenodd",
      fill: "currentColor",
    },
  ],
]);
custom("custom:disc", "disc", [
  ["circle", { cx: 12, cy: 12, r: 10, fill: "currentColor" }],
]);

const ico = (id: string): Ico => {
  const i = ICONS.get(id);
  if (!i) throw new Error(`playground: unknown icon ${id}`);
  return i;
};

// ---------------------------------------------------------------------------
// Rendering helpers.

const tpl = document.createElement("template");
function original(i: Ico, cls = ""): SVGSVGElement {
  tpl.innerHTML = i.svg;
  const svg = tpl.content.firstElementChild as SVGSVGElement;
  if (cls) svg.setAttribute("class", cls);
  return svg;
}

function morphSvg(): { svg: SVGSVGElement; path: SVGPathElement } {
  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  const path = document.createElementNS(SVGNS, "path");
  svg.append(path);
  return { svg, path };
}

const springSel = $<HTMLSelectElement>("spring");
const spring = (): SpringPreset | MorphOptions =>
  springSel.value === "slowmo"
    ? { stiffness: 40, damping: 12 }
    : (springSel.value as SpringPreset);

/** One morph instance + the stroke width bookkeeping of the pair. */
class Player {
  readonly svg: SVGSVGElement;
  readonly m: Morph;
  cur: Ico;
  constructor(host: Element, first: Ico) {
    const { svg, path } = morphSvg();
    host.append(svg);
    this.svg = svg;
    this.cur = first;
    this.m = createMorph(path, first.icon, { strokeWidth: first.sw });
    this.width(first, first);
  }
  // The element strokes with the stroke side's width; the region outline
  // of a stroke icon uses the same width, so rest and flight agree.
  private width(from: Ico, to: Ico): void {
    const w = to.paint === "stroke" ? to.sw : from.paint === "stroke" ? from.sw : 2;
    this.svg.setAttribute("stroke-width", String(w));
    this.m.strokeWidth = w;
  }
  to(next: Ico): void {
    this.width(this.cur, next);
    this.cur = next;
    this.m.morphTo(next.icon, spring());
  }
  set(next: Ico): void {
    this.width(next, next);
    this.cur = next;
    this.m.set(next.icon);
  }
  seek(from: Ico, next: Ico, t: number): void {
    this.width(from, next);
    this.m.seek(next.icon, t);
  }
}

const kindOf = (a: Ico, b: Ico) => `${a.paint} → ${b.paint}`;
const setLabel = (key: string) =>
  key === "custom" ? "custom" : `${SETS[key].label} · ${SETS[key].variant}`;

const time = (fn: () => void, reps = 5): number => {
  const xs: number[] = [];
  for (let r = 0; r < reps; r++) {
    const t0 = performance.now();
    fn();
    xs.push(performance.now() - t0);
  }
  return median(xs);
};

// ---------------------------------------------------------------------------
// Curated cases.

const CASES: Array<{ t: string; s: string; a: string; b: string }> = [
  {
    t: "Construction independence",
    s: "2 overlapping rects ≡ 1 outline: the morph must NOT move",
    a: "custom:cross-rects",
    b: "custom:cross-outline",
  },
  {
    t: "Hole closes: ring → disc",
    s: "evenodd ring; the hole collapses inside, never paints",
    a: "custom:ring",
    b: "custom:disc",
  },
  {
    t: "Hole, real icons",
    s: "Phosphor circle ↔ circle-fill",
    a: "ph/line:circle",
    b: "ph/solid:circle",
  },
  {
    t: "One piece → two",
    s: "Material play ↔ pause (cell division)",
    a: "material-symbols/solid:play",
    b: "material-symbols/solid:pause",
  },
  {
    t: "Stroke ↔ fill, cross-library",
    s: "Lucide x ↔ Material close",
    a: "lucide/stroke:x",
    b: "material-symbols/line:x",
  },
  {
    t: "The toggle, mixed libraries",
    s: "Lucide menu ↔ Material close",
    a: "lucide/stroke:menu",
    b: "material-symbols/line:x",
  },
  {
    t: "Stroke ↔ stroke (regression)",
    s: "historical centerline pipeline, never loads the chunk",
    a: "lucide/stroke:menu",
    b: "lucide/stroke:x",
  },
  {
    t: "Fill ↔ fill, cross-library",
    s: "Remix heart ↔ Bootstrap star",
    a: "ri/solid:heart",
    b: "bi/solid:star",
  },
  {
    t: "Fill-built 'line' icons",
    s: "Material outlined gear ↔ Phosphor gear (holes)",
    a: "material-symbols/line:settings",
    b: "ph/line:settings",
  },
  {
    t: "Same concept, stroke ↔ solid",
    s: "Lucide heart ↔ Heroicons solid",
    a: "lucide/stroke:heart",
    b: "heroicons/solid:heart",
  },
  {
    t: "Duotone ↔ fill",
    s: "Phosphor duotone (20% layer skipped) ↔ fill",
    a: "ph/duotone:heart",
    b: "ph/solid:heart",
  },
  {
    t: "1.5 stroke ↔ fill",
    s: "Heroicons outline bell ↔ Tabler filled",
    a: "heroicons/stroke:bell",
    b: "tabler/solid:bell",
  },
  {
    t: "Many pieces",
    s: "Lucide sun (9 strokes) ↔ Material sun",
    a: "lucide/stroke:sun",
    b: "material-symbols/solid:sun",
  },
  {
    t: "Holes + pieces",
    s: "MDI lock ↔ Lucide lock",
    a: "mdi/solid:lock",
    b: "lucide/stroke:lock",
  },
  {
    t: "Lens hole",
    s: "Tabler camera ↔ MingCute camera fill",
    a: "tabler/stroke:camera",
    b: "mingcute/solid:camera",
  },
  {
    t: "Search, outline ↔ fill-built",
    s: "Heroicons outline ↔ Remix line",
    a: "heroicons/stroke:search",
    b: "ri/line:search",
  },
];

const autoBtn = $("auto");
let auto = true;
autoBtn.addEventListener("click", () => {
  auto = !auto;
  autoBtn.classList.toggle("on", auto);
});

function initCards(): void {
  const cardFlips: Array<() => void> = [];
  for (const c of CASES) {
    const a = ico(c.a);
    const b = ico(c.b);
    const card = document.createElement("button");
    card.type = "button";
    card.className = "card";
    const st = document.createElement("div");
    st.className = "stage";
    const t = document.createElement("div");
    t.className = "t";
    t.textContent = c.t;
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = kindOf(a, b);
    const s = document.createElement("div");
    s.className = "s";
    s.textContent = c.s;
    const orig = document.createElement("div");
    orig.className = "orig";
    const oa = document.createElement("span");
    oa.className = "o";
    oa.title = `original: ${a.label}`;
    oa.append(original(a));
    const ob = document.createElement("span");
    ob.className = "o";
    ob.title = `original: ${b.label}`;
    ob.append(original(b));
    const arrow = document.createElement("span");
    arrow.className = "arrow";
    arrow.textContent = "originals";
    orig.append(oa, ob, arrow);
    card.append(st, t, badge, s, orig);
    $("cards").append(card);
    const p = new Player(st, a);
    let atA = true;
    const flip = () => {
      atA = !atA;
      p.to(atA ? a : b);
    };
    card.addEventListener("click", flip);
    cardFlips.push(flip);
  }

  setInterval(() => {
    if (!auto || document.hidden) return;
    cardFlips.forEach((f, i) => {
      setTimeout(f, i * 45);
    });
  }, 2200);
}

// ---------------------------------------------------------------------------
// Pair explorer.

function initExplorer(): void {
  const aSet = $<HTMLSelectElement>("aSet");
  const aIcon = $<HTMLSelectElement>("aIcon");
  const bSet = $<HTMLSelectElement>("bSet");
  const bIcon = $<HTMLSelectElement>("bIcon");
  const tIn = $<HTMLInputElement>("t");
  const tval = $("tval");
  const xinfo = $("xinfo");

  for (const sel of [aSet, bSet]) {
    for (const key of [...SET_KEYS, "custom"]) {
      const o = document.createElement("option");
      o.value = key;
      o.textContent = setLabel(key);
      sel.append(o);
    }
  }
  const fillIcons = (
    setSel: HTMLSelectElement,
    iconSel: HTMLSelectElement,
    want?: string,
  ) => {
    const prev = want ?? iconSel.value;
    iconSel.textContent = "";
    for (const [id, i] of ICONS) {
      if (i.set !== setSel.value) continue;
      const o = document.createElement("option");
      o.value = id;
      o.textContent = i.set === "custom" ? i.label : i.concept;
      iconSel.append(o);
    }
    const match = [...iconSel.options].find(
      (o) => o.value === prev || o.value.endsWith(`:${prev.split(":").pop()}`),
    );
    if (match) iconSel.value = match.value;
  };

  aSet.value = "lucide/stroke";
  fillIcons(aSet, aIcon, "lucide/stroke:menu");
  bSet.value = "material-symbols/line";
  fillIcons(bSet, bIcon, "material-symbols/line:x");

  const xstage = $("xstage");
  const xp = new Player(xstage, ico(aIcon.value));
  let ghostOn = false;
  let ghostEl: SVGSVGElement | null = null;
  let towardB = false;

  const A = () => ico(aIcon.value);
  const B = () => ico(bIcon.value);

  function showGhost(): void {
    ghostEl?.remove();
    ghostEl = null;
    if (!ghostOn) return;
    ghostEl = original(towardB ? B() : A(), "ghost");
    ghostEl.setAttribute("width", "62%");
    ghostEl.setAttribute("height", "62%");
    xstage.append(ghostEl);
  }

  function showPair(): void {
    const a = A();
    const b = B();
    $("xa").replaceChildren(original(a));
    $("xb").replaceChildren(original(b));
    $("xaCap").textContent = `A · original · ${a.label}`;
    $("xbCap").textContent = `B · original · ${b.label}`;
    $("xCap").textContent = `morph · ${kindOf(a, b)}`;
    towardB = false;
    tIn.value = "0";
    tval.textContent = "0.000";
    xp.set(a);
    showGhost();
    void describe(a, b);
  }

  async function describe(a: Ico, b: Ico): Promise<void> {
    const region = a.paint === "fill" || b.paint === "fill";
    if (!region) {
      xinfo.innerHTML = `pipeline <b>centerline</b> (stroke ↔ stroke) · no chunk needed`;
      return;
    }
    xinfo.innerHTML = `pipeline <b>region</b> · waiting for the chunk…`;
    let mod: RegionModule;
    try {
      mod = await preloadRegion();
    } catch {
      xinfo.innerHTML = `pipeline <b>region</b> · chunk unavailable (network)`;
      return;
    }
    if (a !== A() || b !== B()) return;
    const sw = a.paint === "stroke" ? a.sw : b.paint === "stroke" ? b.sw : 2;
    let ra!: IconNode;
    let rb!: IconNode;
    const nA = time(() => {
      ra = mod.toRegion(a.icon, { strokeWidth: sw });
    });
    const nB = time(() => {
      rb = mod.toRegion(b.icon, { strokeWidth: sw });
    });
    let sa = mod.resampleRegion(ra);
    let sb = mod.resampleRegion(rb);
    const rs = time(() => {
      sa = mod.resampleRegion(ra);
      sb = mod.resampleRegion(rb);
    });
    let plan = mod.buildRegionPlan(sa, sb);
    const pl = time(() => {
      plan = mod.buildRegionPlan(sa, sb);
    });
    const out = allocOutputs(plan);
    const closed = plan.items.map((it) => it.closed);
    let d = "";
    const fr =
      time(() => {
        for (let k = 0; k < 100; k++) {
          interpPolar(plan, 0.37, out);
          d = serialize(out, closed);
        }
      }, 3) * 10;
    const holes = (s: typeof sa) => s.filter((x) => x.hole).length;
    xinfo.innerHTML = [
      `pipeline <b>region</b> · stroke width ${sw}`,
      `A: <b>${sa.length}</b> contours (${holes(sa)} holes) · B: <b>${sb.length}</b> (${holes(sb)} holes) · plan items <b>${plan.items.length}</b>`,
      `normalize A <b>${nA.toFixed(2)}</b> ms · B <b>${nB.toFixed(2)}</b> ms · resample both <b>${rs.toFixed(2)}</b> ms · plan <b>${pl.toFixed(2)}</b> ms`,
      `frame (interp + serialize) <b>${fr.toFixed(1)}</b> µs · d ${d.length} chars`,
      `first morph of this pair ≈ <b>${(nA + nB + rs + pl).toFixed(1)}</b> ms of main thread, then cached`,
    ].join("<br>");
  }

  aSet.addEventListener("change", () => {
    fillIcons(aSet, aIcon);
    showPair();
  });
  bSet.addEventListener("change", () => {
    fillIcons(bSet, bIcon);
    showPair();
  });
  aIcon.addEventListener("change", showPair);
  bIcon.addEventListener("change", showPair);
  $("go").addEventListener("click", () => {
    xp.set(A());
    towardB = true;
    showGhost();
    xp.to(B());
  });
  $("back").addEventListener("click", () => {
    xp.set(B());
    towardB = false;
    showGhost();
    xp.to(A());
  });
  xstage.addEventListener("click", () => {
    towardB = xp.cur !== B();
    showGhost();
    xp.to(towardB ? B() : A());
  });
  $("swap").addEventListener("click", () => {
    const [sa, ia, sb, ib] = [aSet.value, aIcon.value, bSet.value, bIcon.value];
    aSet.value = sb;
    fillIcons(aSet, aIcon, ib);
    bSet.value = sa;
    fillIcons(bSet, bIcon, ia);
    showPair();
  });
  $("rand").addEventListener("click", () => {
    const ids = [...ICONS.keys()].filter((k) => !k.startsWith("custom"));
    const pick = () => ids[Math.floor(Math.random() * ids.length)];
    const a = ico(pick());
    const b = ico(pick());
    aSet.value = a.set;
    fillIcons(aSet, aIcon, a.id);
    bSet.value = b.set;
    fillIcons(bSet, bIcon, b.id);
    showPair();
  });
  $("ghost").addEventListener("click", (e) => {
    ghostOn = !ghostOn;
    (e.currentTarget as HTMLElement).classList.toggle("on", ghostOn);
    showGhost();
  });
  tIn.addEventListener("input", () => {
    const t = Number(tIn.value);
    tval.textContent = t.toFixed(3);
    towardB = t >= 0.5;
    showGhost();
    if (xp.cur !== A()) xp.set(A());
    xp.seek(A(), B(), t);
  });
  showPair();
}

// ---------------------------------------------------------------------------
// Wall.

function initWall(): void {
  const wall = $("wall");
  const wallMode = $<HTMLSelectElement>("wallMode");
  const wallSpeed = $<HTMLSelectElement>("wallSpeed");
  interface Cell {
    p: Player;
    list: Ico[];
    i: number;
    cap: HTMLElement;
  }
  let cells: Cell[] = [];

  function buildWall(): void {
    for (const c of cells) c.p.m.destroy();
    wall.textContent = "";
    cells = [];
    const groups: Array<{ title: string; list: Ico[] }> = [];
    const all = [...ICONS.values()].filter((i) => i.set !== "custom");
    if (wallMode.value === "set") {
      for (const key of SET_KEYS)
        groups.push({ title: setLabel(key), list: all.filter((i) => i.set === key) });
    } else {
      for (const c of CONCEPTS) {
        let list = all.filter((i) => i.concept === c);
        if (wallMode.value === "variant") {
          const strokes = list.filter((i) => SETS[i.set].variant !== "solid");
          const solids = list.filter((i) => SETS[i.set].variant === "solid");
          list = [];
          for (let k = 0; k < Math.max(strokes.length, solids.length); k++) {
            if (strokes[k]) list.push(strokes[k]);
            if (solids[k]) list.push(solids[k]);
          }
        }
        groups.push({ title: c, list });
      }
    }
    for (const g of groups) {
      if (g.list.length < 2) continue;
      const el = document.createElement("div");
      el.className = "cell";
      const st = document.createElement("div");
      st.className = "stage";
      const cap = document.createElement("div");
      cap.className = "cap";
      el.append(st, cap);
      wall.append(el);
      const cell: Cell = { p: new Player(st, g.list[0]), list: g.list, i: 0, cap };
      const label = () => {
        const cur = cell.list[cell.i];
        cap.innerHTML = `<b>${g.title}</b><br>${wallMode.value === "set" ? cur.concept : setLabel(cur.set)}`;
      };
      label();
      st.addEventListener("click", () => {
        cell.i = (cell.i + 1) % cell.list.length;
        cell.p.to(cell.list[cell.i]);
        label();
      });
      cell.cap.dataset.n = String(g.list.length);
      cells.push(cell);
      (cell as Cell & { label: () => void }).label = label;
    }
  }

  let wallTimer = 0;
  const restartWall = () => {
    clearInterval(wallTimer);
    wallTimer = window.setInterval(() => {
      if (!auto || document.hidden) return;
      for (const c of cells) {
        c.i = (c.i + 1) % c.list.length;
        c.p.to(c.list[c.i]);
        (c as Cell & { label: () => void }).label();
      }
    }, Number(wallSpeed.value));
  };
  wallMode.addEventListener("change", buildWall);
  wallSpeed.addEventListener("change", restartWall);
  buildWall();
  restartWall();
}

// ---------------------------------------------------------------------------
// On-device benchmarks.

const benchOut = $("benchOut");
const benchStatus = $("benchStatus");
const diffs = $("diffs");
const fmt = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "—");

async function needModule(): Promise<RegionModule | null> {
  try {
    return await preloadRegion();
  } catch {
    benchStatus.textContent = "region chunk unavailable — set network to normal";
    return null;
  }
}

$("benchTime").addEventListener("click", async () => {
  const mod = await needModule();
  if (!mod) return;
  diffs.textContent = "";
  const rows: string[] = [];
  const allN: number[] = [];
  const allP: number[] = [];
  const allF: number[] = [];
  // JIT warm-up on one set, so the first rows aren't penalized.
  for (const i of ICONS.values())
    if (i.set === "lucide/stroke") mod.resampleRegion(mod.toRegion(i.icon));
  for (const key of SET_KEYS) {
    benchStatus.textContent = `timing ${key}…`;
    await sleep(0);
    const list = [...ICONS.values()].filter((i) => i.set === key);
    const norm: number[] = [];
    const res: number[] = [];
    const plans: number[] = [];
    const frames: number[] = [];
    let maxC = 0;
    const sampled = list.map((i) => {
      let r!: IconNode;
      norm.push(
        time(() => {
          r = mod.toRegion(i.icon, { strokeWidth: i.sw });
        }, 3),
      );
      let s = mod.resampleRegion(r);
      res.push(time(() => (s = mod.resampleRegion(r)), 3));
      maxC = Math.max(maxC, s.length);
      return s;
    });
    // pairs: each icon → the next concept of the same set, and → the same
    // concept in the next set (cross-library)
    const next = SET_KEYS[(SET_KEYS.indexOf(key) + 1) % SET_KEYS.length];
    const pairs: Array<[ReturnType<RegionModule["resampleRegion"]>, IconInput]> = [];
    sampled.forEach((s, k) => {
      pairs.push([s, list[(k + 1) % list.length].icon]);
      const other = ICONS.get(`${next}:${list[k].concept}`);
      if (other) pairs.push([s, other.icon]);
    });
    for (const [s, dstIcon] of pairs) {
      const dst = mod.resampleRegion(mod.toRegion(dstIcon));
      let plan = mod.buildRegionPlan(s, dst);
      plans.push(time(() => (plan = mod.buildRegionPlan(s, dst)), 3));
      const out = allocOutputs(plan);
      const closed = plan.items.map((it) => it.closed);
      frames.push(
        time(() => {
          for (let r = 0; r < 50; r++) {
            interpPolar(plan, 0.37, out);
            serialize(out, closed);
          }
        }, 3) * 20, // µs per frame
      );
    }
    allN.push(...norm);
    allP.push(...plans);
    allF.push(...frames);
    const cls = (x: number, warn: number, bad: number) =>
      x > bad ? "bad" : x > warn ? "warn" : "";
    rows.push(
      `<tr><td>${setLabel(key)}</td><td>${list.length}</td><td>${fmt(median(norm))}</td><td class="${cls(pct(norm, 0.95), 4, 8)}">${fmt(pct(norm, 0.95))}</td><td class="${cls(Math.max(...norm), 6, 12)}">${fmt(Math.max(...norm))}</td><td>${fmt(median(res), 3)}</td><td>${fmt(median(plans), 3)}</td><td>${fmt(Math.max(...plans), 3)}</td><td>${fmt(median(frames), 1)}</td><td>${maxC}</td></tr>`,
    );
  }
  rows.push(
    `<tr><td><b>all</b></td><td>${allN.length}</td><td>${fmt(median(allN))}</td><td>${fmt(pct(allN, 0.95))}</td><td>${fmt(Math.max(...allN))}</td><td></td><td>${fmt(median(allP), 3)}</td><td>${fmt(Math.max(...allP), 3)}</td><td>${fmt(median(allF), 1)}</td><td></td></tr>`,
  );
  benchOut.innerHTML = `<table><thead><tr><th>set</th><th>icons</th><th>normalize med ms</th><th>p95</th><th>max</th><th>resample ms</th><th>plan med ms</th><th>plan max</th><th>frame µs</th><th>max contours</th></tr></thead><tbody>${rows.join("")}</tbody></table>
  <div class="note" style="margin-top:8px">normalize = toRegion (SDF + marching squares + simplify), paid ONCE per icon reference (cached by the driver). plan = once per pair (cached). frame = interpPolar + serialize, paid every animation frame (budget: 16 667 µs). UA: ${navigator.userAgent}</div>`;
  benchStatus.textContent = "timing done";
});

// Fidelity: original SVG (browser raster) vs normalized region (Path2D).
const RES = 192;
async function rasterOriginal(i: Ico): Promise<Uint8ClampedArray> {
  const markup = i.svg.replace(
    "<svg",
    `<svg xmlns="http://www.w3.org/2000/svg" width="${RES}" height="${RES}" color="#000"`,
  );
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  await img.decode();
  const c = new OffscreenCanvas(RES, RES);
  const ctx = c.getContext("2d") as OffscreenCanvasRenderingContext2D;
  ctx.drawImage(img, 0, 0, RES, RES);
  return ctx.getImageData(0, 0, RES, RES).data;
}
function rasterRegion(d: string): Uint8ClampedArray {
  const c = new OffscreenCanvas(RES, RES);
  const ctx = c.getContext("2d") as OffscreenCanvasRenderingContext2D;
  ctx.scale(RES / 24, RES / 24);
  ctx.fillStyle = "#000";
  ctx.fill(new Path2D(d), "nonzero");
  return ctx.getImageData(0, 0, RES, RES).data;
}

$("benchFid").addEventListener("click", async () => {
  const mod = await needModule();
  if (!mod) return;
  const results: Array<{
    i: Ico;
    iou: number;
    a: Uint8ClampedArray;
    b: Uint8ClampedArray;
  }> = [];
  const list = [...ICONS.values()];
  for (const [k, i] of list.entries()) {
    if (k % 20 === 0) {
      benchStatus.textContent = `fidelity ${k}/${list.length}…`;
      await sleep(0);
    }
    const a = await rasterOriginal(i);
    const d = String(mod.toRegion(i.icon, { strokeWidth: i.sw })[0][1].d);
    const b = rasterRegion(d);
    let inter = 0;
    let uni = 0;
    for (let p = 3; p < a.length; p += 4) {
      const x = a[p] >= 128;
      const y = b[p] >= 128;
      if (x && y) inter++;
      if (x || y) uni++;
    }
    results.push({ i, iou: uni ? inter / uni : 1, a, b });
  }
  const bySet = new Map<string, number[]>();
  for (const r of results) {
    const l = bySet.get(r.i.set) ?? [];
    l.push(r.iou);
    bySet.set(r.i.set, l);
  }
  const rows = [...bySet].map(([key, xs]) => {
    const mn = Math.min(...xs);
    return `<tr><td>${setLabel(key)}</td><td>${xs.length}</td><td>${fmt(median(xs), 4)}</td><td class="${mn < 0.9 ? "bad" : mn < 0.95 ? "warn" : ""}">${fmt(mn, 4)}</td><td>${xs.filter((x) => x < 0.95).length}</td></tr>`;
  });
  const all = results.map((r) => r.iou);
  benchOut.innerHTML = `<table><thead><tr><th>set</th><th>icons</th><th>IoU median</th><th>IoU min</th><th>&lt; 0.95</th></tr></thead><tbody>${rows.join("")}<tr><td><b>all</b></td><td>${all.length}</td><td>${fmt(median(all), 4)}</td><td>${fmt(Math.min(...all), 4)}</td><td>${all.filter((x) => x < 0.95).length}</td></tr></tbody></table>
  <div class="note" style="margin-top:8px">IoU at ${RES}×${RES} px (alpha ≥ 50%) between the ORIGINAL svg as this browser renders it (its own caps, joins, fill rules, opacity) and the normalized region the morph rests on. Anti-aliasing alone costs ≈0.5–1.5% on thin shapes. Worst 16 below: <span class="legend"><span style="background:#999"></span>both<span style="background:#e5534b"></span>original only<span style="background:#539bf5"></span>region only</span></div>`;
  diffs.textContent = "";
  for (const r of results.sort((x, y) => x.iou - y.iou).slice(0, 16)) {
    const c = document.createElement("canvas");
    c.width = RES;
    c.height = RES;
    const ctx = c.getContext("2d") as CanvasRenderingContext2D;
    const img = ctx.createImageData(RES, RES);
    for (let p = 0; p < img.data.length; p += 4) {
      const x = r.a[p + 3] >= 128;
      const y = r.b[p + 3] >= 128;
      const [R, G, B] =
        x && y
          ? [150, 150, 150]
          : x
            ? [229, 83, 75]
            : y
              ? [83, 155, 245]
              : [255, 255, 255];
      img.data[p] = R;
      img.data[p + 1] = G;
      img.data[p + 2] = B;
      img.data[p + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const fig = document.createElement("figure");
    const cap = document.createElement("figcaption");
    cap.textContent = `${r.i.id} · IoU ${r.iou.toFixed(4)}`;
    fig.append(c, cap);
    diffs.append(fig);
  }
  benchStatus.textContent = "fidelity done";
});

// Load cost: Resource Timing of the chunk + fresh re-imports (cache-busted
// URL = new fetch + parse + evaluate, the true cold cost on this device).
$("benchLoad").addEventListener("click", async () => {
  diffs.textContent = "";
  benchStatus.textContent = "load cost…";
  const manifest = (await (await fetch("/__manifest.json")).json()) as {
    files: Array<{ path: string; kind: string; raw: number; gzip: number; br: number }>;
  };
  const lazy = manifest.files.filter((f) => f.kind === "lazy");
  const rows: string[] = [];
  for (const f of manifest.files) {
    if (!f.path.endsWith(".js")) continue;
    rows.push(
      `<tr><td>${f.path}</td><td>${f.kind}</td><td>${fmt(f.raw / 1024)}</td><td>${fmt(f.gzip / 1024)}</td><td>${fmt(f.br / 1024)}</td></tr>`,
    );
  }
  const runs: string[] = [];
  for (const f of lazy) {
    const fetchMs: number[] = [];
    const evalMs: number[] = [];
    const totalMs: number[] = [];
    for (let r = 0; r < 5; r++) {
      const url = new URL(
        `/${f.path.replace(/^\.?\//, "")}?bust=${Date.now()}-${r}`,
        location.href,
      ).href;
      const t0 = performance.now();
      try {
        await import(/* @vite-ignore */ url);
      } catch (e) {
        runs.push(
          `<div class="note">${f.path}: import failed (${(e as Error).message}) — network mode?</div>`,
        );
        break;
      }
      const t1 = performance.now();
      const entry = performance.getEntriesByName(url)[0] as
        | PerformanceResourceTiming
        | undefined;
      totalMs.push(t1 - t0);
      if (entry) {
        fetchMs.push(entry.responseEnd - entry.startTime);
        evalMs.push(t1 - entry.responseEnd);
      }
    }
    if (totalMs.length)
      runs.push(
        `<tr><td>${f.path}</td><td>${fmt(median(fetchMs), 1)}</td><td>${fmt(median(evalMs), 2)}</td><td>${fmt(median(totalMs), 1)}</td></tr>`,
      );
  }
  const first = performance
    .getEntriesByType("resource")
    .filter((e) =>
      lazy.some((f) => e.name.split("?")[0].endsWith(f.path.replace(/^\.?\//, ""))),
    )
    .filter((e) => !e.name.includes("bust="))[0] as PerformanceResourceTiming | undefined;
  benchOut.innerHTML = `<table><thead><tr><th>build output</th><th>kind</th><th>raw KB</th><th>gzip KB</th><th>brotli KB</th></tr></thead><tbody>${rows.join("")}</tbody></table>
  <div class="note" style="margin:10px 0 6px">The page bundle includes the playground + 318 vendored SVGs; the morphicons-only split is in the CLI benchmark. The <b>lazy</b> row is the region chunk exactly as an app downloads it.</div>
  <table><thead><tr><th>fresh re-import (×5, median)</th><th>fetch ms</th><th>parse+eval ms</th><th>total ms</th></tr></thead><tbody>${runs.join("")}</tbody></table>
  <div class="note" style="margin-top:8px">${
    first
      ? `first real load this session: fetch ${fmt(first.responseEnd - first.startTime, 1)} ms, transfer ${first.transferSize} B, encoded ${first.encodedBodySize} B, decoded ${first.decodedBodySize} B`
      : "the chunk has not been loaded by a morph yet in this session"
  } · network mode: <b id="benchNet"></b> (applies to the re-imports too)</div>`;
  // Text node, not markup: the select's value never reaches innerHTML.
  const net = benchOut.querySelector("#benchNet");
  if (net) net.textContent = netSel.value;
  benchStatus.textContent = "load cost done";
});

// ---------------------------------------------------------------------------
// Network lab (?lab): one stroke icon, nothing filled mounted, so nothing
// prefetches — the first stroke→fill morph meets the network as it is.

function initLab(): void {
  const st = $("labStage");
  const p = new Player(st, ico("lucide/stroke:menu"));
  const path = st.querySelector("path") as SVGPathElement;
  let t0 = 0;
  let label = "";
  let bursts = 0;
  let burst: { start: number; n: number } | null = null;
  let quiet = 0;
  let watchdog = 0;
  new MutationObserver((recs) => {
    if (!t0) return;
    for (const r of recs) {
      if (r.attributeName !== "d") continue;
      clearTimeout(watchdog);
      burst ??= { start: performance.now() - t0, n: 0 };
      burst.n++;
    }
    clearTimeout(quiet);
    quiet = window.setTimeout(() => {
      if (!burst) return;
      const what =
        burst.n > 1
          ? `FLIGHT (${burst.n} frames)`
          : bursts === 0
            ? "JUMP (instant, no flight)"
            : "rest upgrade (exact region)";
      log(`${label} · +${burst.start.toFixed(0)} ms → ${what}`, burst.n > 1 ? "g" : "");
      bursts++;
      burst = null;
    }, 250);
  }).observe(path, { attributes: true });
  const go = (id: string, text: string) => {
    t0 = performance.now();
    label = text;
    bursts = 0;
    burst = null;
    clearTimeout(watchdog);
    watchdog = window.setTimeout(
      () => log(`${label} · nothing painted after 1 s (stuck?)`, "e"),
      1000,
    );
    p.to(ico(id));
  };
  $("labFill").addEventListener("click", () => go("material-symbols/line:x", "→ fill"));
  $("labStroke").addEventListener("click", () => go("lucide/stroke:x", "→ stroke x"));
  $("labMenu").addEventListener("click", () => go("lucide/stroke:menu", "→ stroke menu"));
  $("labPre").addEventListener("click", () => {
    preloadRegion().catch(() => {});
  });
}

if (new URLSearchParams(location.search).has("lab")) {
  for (const el of document.querySelectorAll<HTMLElement>(".full")) el.hidden = true;
  $("labSec").hidden = false;
  $("labLink").hidden = true;
  log("network lab: nothing prefetched; pick a mode, reload cold, click a target");
  initLab();
} else {
  initCards();
  initExplorer();
  initWall();
}
