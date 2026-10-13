/* Regions: any pair with a fill icon flies as filled surfaces. Pinned here:
   construction independence (two overlapping rects ≡ one outline), holes
   that close (ring → disc) without ever painting, pieces that divide
   (play → pause), stroke ↔ fill across libraries, locked winding, and the
   driver's lazy chunk under slow, failed and superseded loads. */

import { afterEach, describe, expect, test } from "bun:test";
import { svgToIcon } from "../src/adapters/index";
import { allocOutputs, interpPolar } from "../src/core/interpolate";
import type { MorphPlan } from "../src/core/plan";
import { paintOf, signedArea } from "../src/core/region";
import type { IconNode } from "../src/core/types";
import { createMorph, preloadRegion, setRegionLoader } from "../src/dom/index";
import * as region from "../src/region/index";
import {
  buildRegionPlan,
  regionContours,
  resampleRegion,
  toRegion,
} from "../src/region/index";
import { frame, pendingFrames, registerDom, settleAll } from "./client-dom";

registerDom();

const CROSS_RECTS: IconNode = [
  ["rect", { x: 10, y: 4, width: 4, height: 16, fill: "currentColor" }],
  ["rect", { x: 4, y: 10, width: 16, height: 4, fill: "currentColor" }],
];
const CROSS_OUTLINE: IconNode = [
  ["path", { d: "M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z", fill: "currentColor" }],
];
const RING: IconNode = [
  [
    "path",
    {
      d: "M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20zM12 6a6 6 0 1 1 0 12a6 6 0 1 1 0-12z",
      "fill-rule": "evenodd",
      fill: "currentColor",
    },
  ],
];
const DISC: IconNode = [["circle", { cx: 12, cy: 12, r: 10, fill: "currentColor" }]];
const PLAY: IconNode = [["path", { d: "M7 4l13 8-13 8z", fill: "currentColor" }]];
const PAUSE: IconNode = [
  ["rect", { x: 5, y: 4, width: 5, height: 16, fill: "currentColor" }],
  ["rect", { x: 14, y: 4, width: 5, height: 16, fill: "currentColor" }],
];
// lucide `x` (stroke data) and Material Symbols `close` (fill markup).
const LUCIDE_X: IconNode = [
  ["path", { d: "M18 6 6 18" }],
  ["path", { d: "m6 6 12 12" }],
];
const MATERIAL_CLOSE = svgToIcon(
  '<svg viewBox="0 -960 960 960"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg>',
);

const regionPlan = (a: IconNode | string, b: IconNode | string) =>
  buildRegionPlan(resampleRegion(toRegion(a)), resampleRegion(toRegion(b)));

const frameAt = (plan: MorphPlan, t: number) => {
  const out = allocOutputs(plan);
  interpPolar(plan, t, out);
  return out;
};

// Nonzero winding of a frame at (x, y) — what the renderer paints.
const windingAt = (contours: readonly Float64Array[], x: number, y: number): number => {
  let w = 0;
  for (const p of contours) {
    const n = p.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const yi = p[2 * i + 1];
      const yj = p[2 * j + 1];
      if (yj <= y !== yi <= y) {
        const xc = p[2 * j] + ((y - yj) * (p[2 * i] - p[2 * j])) / (yi - yj);
        if (xc > x) w += yi > yj ? 1 : -1; // outers (signedArea > 0) wind +1
      }
    }
  }
  return w;
};

// Off-lattice probe grid over the 24 box.
const GRID: Array<[number, number]> = [];
for (let y = 0.37; y < 24; y += 0.5)
  for (let x = 0.61; x < 24; x += 0.5) GRID.push([x, y]);

// No probe winds negative at any t: a hole never paints outside its surface.
const neverNegative = (plan: MorphPlan) => {
  for (let t = 0; t <= 1; t += 0.125) {
    const f = frameAt(plan, t);
    for (const [x, y] of GRID) expect(windingAt(f, x, y)).toBeGreaterThanOrEqual(0);
  }
};

// The plan's t = 1 paints exactly the target region (probe by probe).
const endsAs = (plan: MorphPlan, b: IconNode) => {
  const f = frameAt(plan, 1);
  const target = resampleRegion(toRegion(b)).map((s) => s.pts);
  for (const [x, y] of GRID)
    expect(windingAt(f, x, y) !== 0).toBe(windingAt(target, x, y) !== 0);
};

const circle = (cx: number, cy: number, r: number, cw = false) =>
  `M${cx} ${cy - r}a${r} ${r} 0 1 ${cw ? 1 : 0} 0 ${2 * r}a${r} ${r} 0 1 ${cw ? 1 : 0} 0 ${-2 * r}z`;
const starPath = (R: number, r: number, turn: number) =>
  `${Array.from({ length: 10 }, (_, i) => {
    const a = turn + (i * Math.PI) / 5 - Math.PI / 2;
    const d = i % 2 ? r : R;
    return `${i ? "L" : "M"}${(12 + d * Math.cos(a)).toFixed(4)} ${(12 + d * Math.sin(a)).toFixed(4)}`;
  }).join("")}Z`;
const evenodd = (d: string): IconNode => [
  ["path", { d, "fill-rule": "evenodd", fill: "currentColor" }],
];

const inside = (x: number, y: number, p: Float64Array): boolean => {
  let c = false;
  const n = p.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const yi = p[2 * i + 1];
    const yj = p[2 * j + 1];
    if (
      yi > y !== yj > y &&
      x < ((p[2 * j] - p[2 * i]) * (y - yi)) / (yj - yi) + p[2 * i]
    )
      c = !c;
  }
  return c;
};

describe("normalizer (toRegion)", () => {
  test("construction independence: two overlapping rects ≡ one outline, exactly", () => {
    expect(toRegion(CROSS_RECTS)[0][1].d).toBe(toRegion(CROSS_OUTLINE)[0][1].d);
    // corners are rebuilt: a 12-vertex cross with area 112
    const [c] = regionContours(CROSS_RECTS);
    expect(c.length / 2).toBe(12);
    expect(signedArea(c)).toBeCloseTo(112, 6);
  });

  test("the morph between the two constructions does not move", () => {
    const plan = regionPlan(CROSS_RECTS, CROSS_OUTLINE);
    const a = frameAt(plan, 0);
    for (const t of [0.25, 0.5, 0.75, 1]) {
      const f = frameAt(plan, t);
      for (let k = 0; k < f.length; k++)
        for (let i = 0; i < f[k].length; i++)
          expect(Math.abs(f[k][i] - a[k][i])).toBeLessThan(1e-9);
    }
  });

  test("fill rules are honored per element: evenodd ring has a hole", () => {
    const cs = regionContours(RING);
    expect(cs.length).toBe(2);
    const areas = cs.map(signedArea).sort((x, y) => y - x);
    expect(areas[0]).toBeCloseTo(Math.PI * 100, 0); // outer, positive
    expect(areas[1]).toBeCloseTo(-Math.PI * 36, 0); // hole, negative
  });

  test("stroke icons outline with round caps/joins (lucide x ≈ 2 capsules)", () => {
    const [c, ...rest] = regionContours(LUCIDE_X, { strokeWidth: 2 });
    expect(rest.length).toBe(0);
    // two 2×17 capsules (round caps) minus their 2×2 overlap ≈ 70
    expect(signedArea(c)).toBeGreaterThan(68);
    expect(signedArea(c)).toBeLessThan(72);
  });

  test("idempotent on regions, and paint is read correctly", () => {
    const r = toRegion(DISC);
    expect(toRegion(r)).toBe(r);
    expect(paintOf(LUCIDE_X)).toBe("stroke");
    expect(paintOf(MATERIAL_CLOSE)).toBe("fill");
    expect(paintOf("M0 0h4")).toBe("stroke");
  });

  test("a mixed icon (filled shape + stroked mark) unions both", () => {
    const mixed: IconNode = [
      ["circle", { cx: 12, cy: 12, r: 10, fill: "currentColor", stroke: "none" }],
      [
        "path",
        { d: "M12 2v-2", fill: "none", stroke: "currentColor", "stroke-width": 2 },
      ],
    ];
    const cs = regionContours(mixed);
    expect(cs.length).toBe(1); // the stub sticks out of the disc, one surface
    expect(signedArea(cs[0])).toBeGreaterThan(Math.PI * 100);
  });
});

describe("region plans", () => {
  test("winding is locked: outers stay positive, holes negative, at every t", () => {
    for (const [a, b] of [
      [RING, DISC],
      [DISC, RING],
      [PLAY, PAUSE],
      [LUCIDE_X, MATERIAL_CLOSE],
    ] as const) {
      const plan = regionPlan(a, b);
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        frameAt(plan, t).forEach((f, k) => {
          const ar = signedArea(f);
          if (plan.items[k].hole) expect(ar).toBeLessThanOrEqual(1e-9);
          else expect(ar).toBeGreaterThanOrEqual(-1e-9);
        });
      }
    }
  });

  test("ring → disc: the hole closes to a point inside the surface", () => {
    const plan = regionPlan(RING, DISC);
    const holes = plan.items.map((it, k) => [it, k] as const).filter(([it]) => it.hole);
    expect(holes.length).toBe(1);
    const k = holes[0][1];
    // it closes on the first half of the flight (gone by t = ½)
    const areas = [0, 0.25, 0.5, 1].map((t) => Math.abs(signedArea(frameAt(plan, t)[k])));
    expect(areas[0]).toBeGreaterThan(100);
    expect(areas[1]).toBeLessThan(areas[0]);
    expect(areas[1]).toBeGreaterThan(0);
    expect(areas[2]).toBeLessThan(1e-9);
    expect(areas[3]).toBeLessThan(1e-9);
    // at every t the hole's points stay inside the outer
    const outer = plan.items.findIndex((it) => !it.hole);
    for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const f = frameAt(plan, t);
      for (let i = 0; i < f[k].length; i += 2)
        expect(inside(f[k][i], f[k][i + 1], f[outer])).toBe(true);
    }
  });

  test("disc → ring: the hole grows from a point (no duplicate holes)", () => {
    const plan = regionPlan(DISC, RING);
    expect(plan.items.filter((it) => it.hole).length).toBe(1);
    const k = plan.items.findIndex((it) => it.hole);
    expect(Math.abs(signedArea(frameAt(plan, 0)[k]))).toBeLessThan(1e-9);
  });

  test("two pieces → a ring: the ring is never duplicated, its hole never paints", () => {
    // a solid bell (body + clapper) → an outline bell: duplicating the ring
    // onto both pieces would wind +2 under its −1 hole and paint it
    const BELL: IconNode = [
      ["circle", { cx: 12, cy: 11, r: 8, fill: "currentColor" }],
      ["circle", { cx: 12, cy: 21.5, r: 1.5, fill: "currentColor" }],
    ];
    for (const [a, b] of [
      [BELL, RING],
      [RING, BELL],
    ] as const) {
      const plan = regionPlan(a, b);
      endsAs(plan, b);
      neverNegative(plan);
    }
    expect(windingAt(frameAt(regionPlan(BELL, RING), 1), 12, 12)).toBe(0);
  });

  test("a piece that vanishes takes its holes along, nested at every t", () => {
    const TWO_RINGS = evenodd(
      `${circle(6, 12, 5)}${circle(6, 12, 2.5)}${circle(18, 12, 5)}${circle(18, 12, 2.5)}`,
    );
    const ONE_RING = evenodd(`${circle(6, 12, 5)}${circle(6, 12, 2.5)}`);
    for (const [a, b] of [
      [TWO_RINGS, ONE_RING],
      [ONE_RING, TWO_RINGS],
    ] as const) {
      const plan = regionPlan(a, b);
      endsAs(plan, b);
      neverNegative(plan);
    }
  });

  test("a hole belongs to the outer its contour lies in, not the one under its centroid", () => {
    // camera: the body's window is centered on the lens; the window's
    // centroid sits inside the lens, its contour inside the body
    const camera = (w: number, lens: number): IconNode => [
      [
        "path",
        {
          d: `M2 5h20v15H2z${circle(12, 12.5, w)}`,
          "fill-rule": "evenodd",
          fill: "currentColor",
        },
      ],
      ["circle", { cx: 12, cy: 12.5, r: lens, fill: "currentColor" }],
    ];
    const plan = regionPlan(camera(6, 3.5), camera(5, 2.5));
    const hole = plan.items.find((it) => it.hole);
    const outers = plan.items.filter((it) => !it.hole);
    const body = outers.reduce((x, y) =>
      Math.abs(signedArea(x.a)) > Math.abs(signedArea(y.a)) ? x : y,
    );
    expect(hole?.ca).toEqual(body.ca); // flies in the body's frame
    endsAs(plan, camera(5, 2.5));
    neverNegative(plan);
  });

  test("a matched hole flies in its outer's frame: a turned star ring never leaks", () => {
    const ring = (turn: number) =>
      evenodd(`${starPath(11, 5, turn)}${starPath(8, 3.4, turn)}`);
    for (const turn of [Math.PI / 5, 0.3]) {
      const plan = regionPlan(ring(0), ring(turn));
      const [outer, hole] = plan.items;
      expect(hole.hole).toBe(true);
      expect(hole.theta).toBe(outer.theta);
      expect(hole.lnSigma).toBe(outer.lnSigma);
      endsAs(plan, ring(turn));
      neverNegative(plan);
    }
  });

  test("holes that don't overlap don't pair: one closes, then the other opens", () => {
    const slot = (d: string) => evenodd(`M3 3h18v18H3z${d}`);
    const TOP = slot("M5 5h14v2H5z");
    const SIDE = slot("M5 10h2v9H5z");
    const plan = regionPlan(TOP, SIDE);
    const holes = plan.items.filter((it) => it.hole);
    expect(holes.map((h) => h.half).sort()).toEqual([0, 1]);
    const mid = frameAt(plan, 0.5);
    plan.items.forEach((it, k) => {
      if (it.hole) expect(Math.abs(signedArea(mid[k]))).toBeLessThan(1e-9);
    });
    endsAs(plan, SIDE);
    neverNegative(plan);
  });

  test("play → pause: one piece divides into two", () => {
    const plan = regionPlan(PLAY, PAUSE);
    expect(plan.items.length).toBe(2);
    expect(plan.items.every((it) => !it.hole && it.closed)).toBe(true);
  });

  test("exact endpoints and no NaN for stroke ↔ fill across libraries", () => {
    const plan = regionPlan(LUCIDE_X, MATERIAL_CLOSE);
    for (const t of [0, 0.5, 1, 1.2])
      for (const f of frameAt(plan, t))
        for (const v of f) expect(Number.isFinite(v)).toBe(true);
    const end = frameAt(plan, 1);
    plan.items.forEach((it, k) => {
      for (let i = 0; i < it.bO.length; i++)
        expect(Math.abs(end[k][i] - it.bO[i])).toBeLessThan(1e-9);
    });
  });
});

describe("svgToIcon accepts fill-drawn icons", () => {
  test("a bare silhouette is a fill icon with its paint stamped", () => {
    const icon = svgToIcon('<path d="M4 4h16v16H4z"/>') as IconNode;
    expect(icon[0][1]).toMatchObject({ fill: "currentColor", stroke: "none" });
    expect(paintOf(icon)).toBe("fill");
  });

  test("paint inherits from <svg>, <g> and style", () => {
    const icon = svgToIcon(
      '<svg fill="currentColor"><g fill-rule="evenodd"><path d="M0 0h4v4H0z"/></g><path style="fill:none;stroke:#000;stroke-width:3" d="M0 0h4"/></svg>',
    ) as IconNode;
    expect(icon[0][1]).toMatchObject({ fill: "currentColor", "fill-rule": "evenodd" });
    expect(icon[1][1]).toMatchObject({
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "3",
    });
  });

  test("a viewBox re-grids fill icons onto 24 (material close lands inside)", () => {
    const [c] = regionContours(MATERIAL_CLOSE);
    for (let i = 0; i < c.length; i++) {
      expect(c[i]).toBeGreaterThan(-0.01);
      expect(c[i]).toBeLessThan(24.01);
    }
  });
});

// ---------------------------------------------------------------------------
// Driver: lazy chunk, paint writes, network edge cases.

const fake = () => {
  const attrs = new Map<string, string>();
  const writes: string[] = [];
  return {
    attrs,
    writes,
    el: {
      setAttribute(name: string, value: string) {
        attrs.set(name, value);
        writes.push(name);
      },
    },
  };
};

const deferred = () => {
  let resolve!: (m: typeof region) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<typeof region>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  settleAll(5000);
  setRegionLoader(async () => region);
});

describe("driver: region flights", () => {
  test("stroke-only use never loads the chunk and never writes paint", async () => {
    let loads = 0;
    setRegionLoader(async () => {
      loads++;
      return region;
    });
    const p = fake();
    const m = createMorph(p.el, LUCIDE_X);
    m.morphTo("M4 6h16M4 12h16M4 18h16");
    settleAll();
    await flush();
    expect(loads).toBe(0);
    expect(p.writes.every((w) => w === "d")).toBe(true);
    m.destroy();
  });

  test("stroke → fill waits for a slow chunk, then flies filled and rests filled", async () => {
    const d = deferred();
    setRegionLoader(() => d.promise);
    const p = fake();
    const m = createMorph(p.el, LUCIDE_X);
    const before = p.attrs.get("d");
    m.morphTo(MATERIAL_CLOSE);
    expect(pendingFrames()).toBe(0); // nothing flies while the chunk is on the wire
    expect(p.attrs.get("d")).toBe(before);
    d.resolve(region);
    await flush();
    expect(pendingFrames()).toBeGreaterThan(0);
    expect(p.attrs.get("fill")).toBe("currentColor");
    expect(p.attrs.get("stroke")).toBe("none");
    frame(16);
    frame(16);
    expect(p.attrs.get("d")).toContain("Z");
    settleAll();
    expect(p.attrs.get("fill")).toBe("currentColor");
    expect(m.progress).toBe(1);
    // and back: fill → stroke rests on the stroke paint again
    m.morphTo(LUCIDE_X);
    settleAll();
    expect(p.attrs.get("fill")).toBe("none");
    expect(p.attrs.get("stroke")).toBe("inherit");
    m.destroy();
  });

  test("a failed chunk load degrades to an instant jump, and a later need retries", async () => {
    let attempt = 0;
    setRegionLoader(() =>
      ++attempt === 1 ? Promise.reject(new Error("offline")) : Promise.resolve(region),
    );
    const p = fake();
    const m = createMorph(p.el, LUCIDE_X);
    m.morphTo(DISC);
    await flush();
    expect(pendingFrames()).toBe(0);
    expect(p.attrs.get("fill")).toBe("currentColor"); // jumped to the fill icon
    expect(attempt).toBe(1); // the jump did not fire a second request
    createMorph(fake().el, DISC).destroy(); // nor does a fill mount (no storm)
    await flush();
    expect(attempt).toBe(1);
    m.morphTo(LUCIDE_X);
    await flush();
    expect(attempt).toBe(2); // retried, not cached as failed
    settleAll();
    m.destroy();
  });

  test("a chunk slower than the budget: jump now, rest upgrades when it lands", async () => {
    const d = deferred();
    setRegionLoader(() => d.promise);
    const p = fake();
    const m = createMorph(p.el, LUCIDE_X);
    const before = p.attrs.get("d");
    m.morphTo(DISC);
    expect(p.attrs.get("d")).toBe(before); // within the budget: still waiting
    await new Promise((r) => setTimeout(r, 130)); // hang past REGION_WAIT_MS
    expect(pendingFrames()).toBe(0);
    expect(p.attrs.get("fill")).toBe("currentColor"); // jumped, not stuck
    const jumped = p.attrs.get("d");
    expect(jumped).not.toBe(before);
    d.resolve(region); // arrives late
    await flush();
    await flush();
    expect(pendingFrames()).toBe(0); // the stale flight is NOT replayed
    expect(p.attrs.get("d")).not.toBe(jumped); // rest upgraded to the exact region
    m.morphTo(LUCIDE_X); // the next morph flies
    expect(pendingFrames()).toBeGreaterThan(0);
    settleAll();
    m.destroy();
  });

  test("a superseded request is dropped when the chunk arrives late", async () => {
    const d = deferred();
    setRegionLoader(() => d.promise);
    const p = fake();
    const m = createMorph(p.el, LUCIDE_X);
    m.morphTo(DISC); // needs the chunk → pending
    m.morphTo("M4 6h16M4 12h16M4 18h16"); // stroke ↔ stroke → flies now
    settleAll();
    const rest = p.attrs.get("d");
    d.resolve(region);
    await flush();
    expect(pendingFrames()).toBe(0); // the stale DISC request did not fire
    expect(p.attrs.get("d")).toBe(rest);
    m.destroy();
  });

  test("interrupting a stroke flight toward a fill icon re-plans from the shape in flight", async () => {
    await preloadRegion();
    const p = fake();
    const m = createMorph(p.el, LUCIDE_X);
    m.morphTo("M4 6h16M4 12h16M4 18h16");
    frame(16);
    frame(16);
    m.morphTo(PAUSE);
    frame(16);
    for (const v of (p.attrs.get("d") ?? "").match(/-?\d+(\.\d+)?/g) ?? [])
      expect(Number.isFinite(Number(v))).toBe(true);
    settleAll();
    expect(p.attrs.get("fill")).toBe("currentColor");
    m.destroy();
  });

  test("a fill icon at mount paints filled (its own rule) and prefetches", async () => {
    let loads = 0;
    setRegionLoader(async () => {
      loads++;
      return region;
    });
    const p = fake();
    const heroSolid: IconNode = [
      [
        "path",
        { d: "M4 4h16v16H4zM8 8h8v8H8z", "fill-rule": "evenodd", fill: "currentColor" },
      ],
    ];
    const m = createMorph(p.el, heroSolid);
    expect(p.attrs.get("fill-rule")).toBe("evenodd");
    await flush();
    expect(loads).toBe(1);
    m.destroy();
  });
});
