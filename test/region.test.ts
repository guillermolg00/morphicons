/* Regions: any pair with a fill icon flies as filled surfaces. Pinned here:
   construction independence (two overlapping rects ≡ one outline), holes
   that close (ring → disc) without ever painting, pieces that divide
   (play → pause), stroke ↔ fill across libraries, locked winding, and the
   driver's lazy chunk under slow, failed and superseded loads. */

import { afterEach, describe, expect, test } from "bun:test";
import { svgToIcon } from "../src/adapters/index";
import { allocOutputs, interpPolar } from "../src/core/interpolate";
import { iconToCubics } from "../src/core/normalize";
import type { MorphPlan } from "../src/core/plan";
import { paintOf, signedArea } from "../src/core/region";
import type { IconNode } from "../src/core/types";
import {
  canonicalD,
  createMorph,
  preloadRegion,
  restAttrs,
  setRegionLoader,
} from "../src/dom/index";
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

// A 24-tooth gear: 96 corners, more than 64 samples can land on.
const GEAR: IconNode = [
  [
    "path",
    {
      d: `${Array.from({ length: 96 }, (_, k) => {
        const a = (k * Math.PI) / 48;
        const r = k % 4 < 2 ? 10 : 8;
        return `${k ? "L" : "M"}${(12 + r * Math.cos(a)).toFixed(3)} ${(12 + r * Math.sin(a)).toFixed(3)}`;
      }).join("")}Z`,
      fill: "currentColor",
    },
  ],
];

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
    // corners are rebuilt: a 12-vertex cross with area 112 (edges on the
    // grid sit a micro-unit inside, so contours never touch)
    const [c] = regionContours(CROSS_RECTS);
    expect(c.length / 2).toBe(12);
    expect(signedArea(c)).toBeCloseTo(112, 3);
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

  test("a shape touching its hole's edge is still an outer (MDI camera-enhance lens)", () => {
    // the sparkle's top tip lies on the lens hole: nesting by that one
    // vertex was a coin flip, and the sparkle came out wound as a hole
    const lens: IconNode = [
      [
        "path",
        {
          fill: "currentColor",
          d: "m12 10l-.94 2.06L9 13l2.06.94L12 16l.94-2.06L15 13l-2.06-.94zM12 8a5 5 0 0 0-5 5a5 5 0 0 0 5 5a5 5 0 0 0 5-5a5 5 0 0 0-5-5m0 8a3 3 0 0 1-3-3a3 3 0 0 1 3-3a3 3 0 0 1 3 3a3 3 0 0 1-3 3",
        },
      ],
    ];
    const cs = regionContours(lens);
    for (const [x, y] of GRID) expect(windingAt(cs, x, y)).toBeGreaterThanOrEqual(0);
    expect(windingAt(cs, 12.01, 13.01)).toBe(1); // the sparkle paints
  });

  test("pieces meeting on whole units never touch (MingCute projector-screen-line)", () => {
    // integer edges land on grid nodes: two contours shared those points,
    // and every vertex vote on them was a coin flip
    const screen: IconNode = [
      [
        "path",
        {
          fill: "currentColor",
          d: "M13 15a1 1 0 1 0-2 0zM6 6V5H5v1zm12 0h1V5h-1zm0 9v1h1v-1zM6 15H5v1h1zM4 3V2a1 1 0 0 0-1 1zm16 0h1a1 1 0 0 0-1-1zm0 3v1a1 1 0 0 0 1-1zM4 6H3a1 1 0 0 0 1 1zm0 8a1 1 0 1 0 0 2zm16 2a1 1 0 1 0 0-2zm-8-1h-1v3h2v-3zM6 6v1h12V5H6zm12 0h-1v9h2V6zm0 9v-1H6v2h12zM6 15h1V6H5v9zM4 3v1h16V2H4zm16 0h-1v3h2V3zm0 3V5H4v2h16zM4 6h1V3H3v3zm9.5 13.5h-1a.5.5 0 0 1-.5.5v2a2.5 2.5 0 0 0 2.5-2.5zM12 21v-1a.5.5 0 0 1-.5-.5h-2A2.5 2.5 0 0 0 12 22zm-1.5-1.5h1a.5.5 0 0 1 .5-.5v-2a2.5 2.5 0 0 0-2.5 2.5zM12 18v1a.5.5 0 0 1 .5.5h2A2.5 2.5 0 0 0 12 17zm-8-3v1h16v-2H4z",
        },
      ],
    ];
    const cs = regionContours(screen);
    let bad = 0;
    for (let y = 0.05; y < 24; y += 0.1)
      for (let x = 0.07; x < 24; x += 0.1) {
        const w = windingAt(cs, x, y);
        if (w < 0 || w > 1) bad++;
      }
    expect(bad).toBe(0);
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

  test("a fill icon with a stroke at the inherited width caches per width", () => {
    const wallet: IconNode = [
      ["path", { d: "M3 7h18v13H3z", fill: "none", stroke: "currentColor" }],
      ["circle", { cx: 16.5, cy: 13.5, r: 1, fill: "currentColor" }],
    ];
    expect(region.regionOf(wallet, 2)).not.toBe(region.regionOf(wallet, 6));
    expect(region.regionOf(wallet, 2)).toBe(region.regionOf(wallet, 2));
    // a pure fill icon: one form for every width
    expect(region.regionOf(RING, 2)).toBe(region.regionOf(RING, 6));
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

  test("a vanishing hole rides its outer's deformation, not only its similarity", () => {
    // a slab with a low window → an arch: held still, the window would
    // close (or open) in the doorway the arch's blend opens under it
    const SLAB = evenodd("M3 3h15v14H3zM8 12h5v4H8z");
    const ARCH = evenodd("M4 2h14v18h-4V9H8v11H4z");
    for (const [a, b] of [
      [SLAB, ARCH],
      [ARCH, SLAB],
    ] as const) {
      const plan = regionPlan(a, b);
      endsAs(plan, b);
      neverNegative(plan);
    }
  });

  test("a matched hole its outer's blend would uncover is unpaired: it closes, then opens", () => {
    // a ring on a stand → a ring: the outer's samples slide toward the
    // stand and pinch its sides mid-flight, while the round hole holds
    const webcam: IconNode = [
      [
        "path",
        {
          d: `${circle(12, 10, 8)}${circle(12, 10, 7)}`,
          "fill-rule": "evenodd",
          fill: "currentColor",
        },
      ],
      ["rect", { x: 11.5, y: 17.5, width: 1, height: 3, fill: "currentColor" }],
      ["rect", { x: 3, y: 19.5, width: 18, height: 1.5, fill: "currentColor" }],
    ];
    const RING9 = evenodd(`${circle(12, 12, 9)}${circle(12, 12, 7.5)}`);
    for (const [a, b] of [
      [webcam, RING9],
      [RING9, webcam],
    ] as const) {
      const plan = regionPlan(a, b);
      endsAs(plan, b);
      neverNegative(plan);
      expect(plan.items.filter((it) => it.hole).map((h) => h.half)).toEqual([0, 1]);
    }
  });

  test("a matched hole never sweeps over a hole that is still closing", () => {
    // two panes → one: the wide pane growing into the big one would cover
    // the narrow pane before it is gone (two holes on one spot wind −1)
    const TWO = evenodd("M3 3h18v18H3zM5 5h7v14H5zM13 5h2v14h-2z");
    const ONE = evenodd("M3 3h18v18H3zM5 5h14v14H5z");
    for (const [a, b] of [
      [TWO, ONE],
      [ONE, TWO],
    ] as const) {
      const plan = regionPlan(a, b);
      endsAs(plan, b);
      neverNegative(plan);
      expect(plan.items.some((it) => it.hole && it.half === undefined)).toBe(false);
    }
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

  test("an outer whose best offset folds mid-flight takes the next one that doesn't", () => {
    // heroicons plus-20-solid → arrow-small-up: the best-scoring offset
    // twists the plus into a bow-tie at t ≈ ½ (4.8% of ink wound negative)
    const plus = svgToIcon(
      '<svg viewBox="0 0 20 20"><path fill="currentColor" d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5z"/></svg>',
    );
    const arrow = svgToIcon(
      '<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 19.5v-15m0 0l-6.75 6.75M12 4.5l6.75 6.75"/></svg>',
    );
    neverNegative(regionPlan(plus, arrow));
  });

  test("an icon 64 points can't follow samples at 128; a mixed pair flies at 128", () => {
    expect(resampleRegion(toRegion(GEAR))[0].pts.length).toBe(256);
    expect(resampleRegion(toRegion(PLAY))[0].pts.length).toBe(128);
    const plan = regionPlan(PLAY, GEAR);
    expect(plan.n).toBe(128);
    for (const t of [0, 0.5, 1])
      for (const f of frameAt(plan, t)) {
        expect(f.length).toBe(256);
        for (const v of f) expect(Number.isFinite(v)).toBe(true);
      }
    // the doubled side keeps its shape: every start point lies on the play
    const [a] = resampleRegion(toRegion(PLAY));
    const start = frameAt(plan, 0)[0];
    for (let i = 0; i < 256; i += 4) {
      const k = i / 2;
      expect(start[i]).toBeCloseTo(a.pts[k], 9);
      expect(start[i + 1]).toBeCloseTo(a.pts[k + 1], 9);
    }
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

  test("a failed chunk load flies the fallback, and a later need retries", async () => {
    let attempt = 0;
    setRegionLoader(() =>
      ++attempt === 1 ? Promise.reject(new Error("offline")) : Promise.resolve(region),
    );
    const p = fake();
    const m = createMorph(p.el, LUCIDE_X);
    m.morphTo(DISC);
    await flush();
    expect(pendingFrames()).toBeGreaterThan(0); // animates, doesn't jump
    settleAll();
    expect(p.attrs.get("fill")).toBe("currentColor"); // rests on the fill icon
    expect(attempt).toBe(1); // the fallback did not fire a second request
    createMorph(fake().el, DISC).destroy(); // nor does a fill mount (no storm)
    await new Promise((r) => setTimeout(r, 250)); // past the idle prefetch
    expect(attempt).toBe(1);
    m.morphTo(LUCIDE_X);
    await flush();
    expect(attempt).toBe(2); // retried, not cached as failed
    settleAll();
    m.destroy();
  });

  test("a chunk slower than the budget: the fallback flies now, rest upgrades when it lands", async () => {
    const d = deferred();
    setRegionLoader(() => d.promise);
    const p = fake();
    const m = createMorph(p.el, LUCIDE_X);
    const before = p.attrs.get("d");
    m.morphTo(DISC);
    expect(p.attrs.get("d")).toBe(before); // within the budget: still waiting
    await new Promise((r) => setTimeout(r, 130)); // hang past REGION_WAIT_MS
    expect(pendingFrames()).toBeGreaterThan(0); // flying the fallback, not stuck
    settleAll();
    expect(p.attrs.get("fill")).toBe("currentColor");
    const landed = p.attrs.get("d");
    expect(landed).not.toBe(before);
    d.resolve(region); // arrives late
    await flush();
    await flush();
    expect(pendingFrames()).toBe(0); // the stale flight is NOT replayed
    expect(p.attrs.get("d")).not.toBe(landed); // rest upgraded to the exact region
    m.morphTo(LUCIDE_X); // the next morph flies
    expect(pendingFrames()).toBeGreaterThan(0);
    settleAll();
    m.destroy();
  });

  test("a load already older than the budget isn't waited for again", async () => {
    const d = deferred();
    setRegionLoader(() => d.promise);
    const p = fake();
    const m = createMorph(p.el, LUCIDE_X);
    m.morphTo(DISC);
    await new Promise((r) => setTimeout(r, 130)); // the hang blew the budget
    settleAll();
    m.morphTo(LUCIDE_X);
    expect(pendingFrames()).toBeGreaterThan(0); // flies at once, no 100 ms wait
    settleAll();
    expect(p.attrs.get("stroke")).toBe("inherit");
    m.destroy();
  });

  test("the fallback shrinks the old shape, then grows the new one in its own paint", async () => {
    setRegionLoader(() => Promise.reject(new Error("offline")));
    const p = fake();
    const m = createMorph(p.el, LUCIDE_X);
    m.seek(DISC, 0.25);
    await flush();
    // first half: lucide x (2 strokes), stroke paint, shrinking
    expect((p.attrs.get("d") ?? "").match(/M/g)?.length).toBe(2);
    expect(p.attrs.get("fill")).toBeUndefined(); // still the svg's stroke
    m.seek(DISC, 0.75);
    // second half: the disc (1 contour), its fill paint
    expect((p.attrs.get("d") ?? "").match(/M/g)?.length).toBe(1);
    expect(p.attrs.get("fill")).toBe("currentColor");
    m.seek(DISC, 0.5); // the crossover: both sides collapsed to their centroids
    const xs = (p.attrs.get("d") ?? "").match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(0.01);
    // interrupted mid-fallback: it chains from what is on screen
    m.morphTo(PAUSE);
    frame(16);
    expect(p.attrs.get("d")).not.toMatch(/NaN|undefined/);
    settleAll();
    expect(p.attrs.get("fill")).toBe("currentColor");
    expect((p.attrs.get("d") ?? "").match(/M/g)?.length).toBe(2); // the two bars
    m.destroy();
  });

  test("after a failed import() whose URL is cached as failed, the retry re-runs the chunk under a fresh module-map key", async () => {
    const url = "https://cdn.example/assets/region-abc.js";
    let imports = 0;
    setRegionLoader(() => {
      imports++;
      return Promise.reject(
        new TypeError(`Failed to fetch dynamically imported module: ${url}`),
      );
    });
    const scripts: Array<{ type: string; src: string; onload: (() => void) | null }> = [];
    const doc = (globalThis as unknown as { document: unknown }).document as {
      createElement: unknown;
      head: { append: unknown };
    };
    const create = doc.createElement;
    const append = doc.head.append;
    doc.createElement = () => ({
      type: "",
      src: "",
      onload: null,
      onerror: null,
      removed: false,
      remove() {
        this.removed = true;
      },
    });
    doc.head.append = (s: (typeof scripts)[number]) => scripts.push(s);
    try {
      const p = fake();
      const m = createMorph(p.el, LUCIDE_X);
      m.morphTo(DISC); // import() fails → fallback
      await flush();
      settleAll();
      expect(imports).toBe(1);
      expect(scripts.length).toBe(0); // no second request in the same instant
      m.morphTo(LUCIDE_X); // the next need retries: import() fails at once again
      await flush();
      expect(imports).toBe(2);
      expect(scripts.length).toBe(1);
      expect(scripts[0].type).toBe("module");
      // same URL for the server (CDN cache, signed URLs), new key for the
      // module map: Chromium 152 refetches a fragment-only variant
      expect(scripts[0].src).toMatch(
        /^https:\/\/cdn\.example\/assets\/region-abc\.js#\d+$/,
      );
      scripts[0].onload?.(); // the chunk ran: it registered its hooks
      expect((scripts[0] as unknown as { removed: boolean }).removed).toBe(true); // no tag left behind
      await flush();
      settleAll();
      m.morphTo(DISC);
      expect(pendingFrames()).toBeGreaterThan(0); // flies a region plan now
      settleAll();
      expect(p.attrs.get("fill")).toBe("currentColor");
      m.destroy();
    } finally {
      doc.createElement = create;
      doc.head.append = append;
    }
  });

  test("Safari names no URL: the retry reads it off the loader's source", async () => {
    let imports = 0;
    const offline = () =>
      Promise.reject(new TypeError("Importing a module script failed."));
    // (`offline()` is truthy: the import below is source text, never run)
    setRegionLoader(() => {
      imports++;
      // @ts-expect-error — a URL, as a bundler emits it
      return (offline() || import("https://cdn.example/assets/region-abc.js")) as never;
    });
    const scripts: Array<{ src: string; onload: (() => void) | null }> = [];
    const doc = (globalThis as unknown as { document: unknown }).document as {
      createElement: unknown;
      head: { append: unknown };
    };
    const create = doc.createElement;
    const append = doc.head.append;
    doc.createElement = () => ({
      type: "",
      src: "",
      onload: null,
      onerror: null,
      removed: false,
      remove() {
        this.removed = true;
      },
    });
    doc.head.append = (s: (typeof scripts)[number]) => scripts.push(s);
    try {
      await preloadRegion().catch(() => {});
      expect(scripts.length).toBe(0);
      const retry = preloadRegion();
      await flush();
      expect(imports).toBe(2); // a plain import() first (Safari ≤26.1 fetches again)
      expect(scripts.length).toBe(1);
      expect(scripts[0].src).toMatch(
        /^https:\/\/cdn\.example\/assets\/region-abc\.js#\d+$/,
      );
      scripts[0].onload?.();
      expect((await retry).regionPlan).toBe(region.regionPlan); // its hooks
    } finally {
      doc.createElement = create;
      doc.head.append = append;
    }
  });

  test("a loader that names no URL anywhere (webpack) just retries import()", async () => {
    let imports = 0;
    setRegionLoader(() =>
      ++imports === 1
        ? Promise.reject(new Error("Loading chunk 7 failed."))
        : Promise.resolve(region),
    );
    await preloadRegion().catch(() => {});
    expect(await preloadRegion()).toBe(region);
    expect(imports).toBe(2);
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

  test("back to the current icon while the chunk is on the wire cancels the request", async () => {
    const d = deferred();
    setRegionLoader(() => d.promise);
    const p = fake();
    const m = createMorph(p.el, LUCIDE_X);
    const rest = p.attrs.get("d");
    m.morphTo(DISC); // hover: needs the chunk → pending
    m.morphTo(LUCIDE_X); // un-hover within the budget: already there
    d.resolve(region);
    await flush();
    expect(pendingFrames()).toBe(0); // the stale DISC request did not fire
    expect(p.attrs.get("d")).toBe(rest);
    expect(p.attrs.get("fill")).toBeUndefined();
    m.destroy();
  });

  test("repeated requests don't stretch the budget past the load's start", async () => {
    const d = deferred();
    setRegionLoader(() => d.promise);
    const m = createMorph(fake().el, LUCIDE_X);
    m.morphTo(DISC);
    await new Promise((r) => setTimeout(r, 60));
    m.morphTo(DISC); // same request again: the 100 ms run from the load, not from here
    await new Promise((r) => setTimeout(r, 60));
    expect(pendingFrames()).toBeGreaterThan(0); // the fallback flies at ~100 ms, not ~160
    settleAll();
    d.resolve(region);
    await flush();
    m.destroy();
  });

  test("destroy while the chunk is on the wire: nothing writes after", async () => {
    const d = deferred();
    setRegionLoader(() => d.promise);
    const p = fake();
    const m = createMorph(p.el, LUCIDE_X);
    m.morphTo(DISC);
    m.destroy();
    const n = p.writes.length;
    d.resolve(region);
    await flush();
    await new Promise((r) => setTimeout(r, 130)); // past the budget too
    expect(p.writes.length).toBe(n);
    expect(pendingFrames()).toBe(0);
  });

  test("a scrub that blew the budget takes the region morph once the chunk lands", async () => {
    const d = deferred();
    setRegionLoader(() => d.promise);
    const p = fake();
    const m = createMorph(p.el, LUCIDE_X);
    m.seek(DISC, 0.2);
    await new Promise((r) => setTimeout(r, 130)); // fallback installed
    m.seek(DISC, 0.6);
    const fallback = p.attrs.get("d");
    d.resolve(region);
    await flush();
    m.seek(DISC, 0.6); // same pair, same t: now the region morph
    const fresh = fake();
    const ref = createMorph(fresh.el, LUCIDE_X);
    ref.seek(DISC, 0.6);
    expect(p.attrs.get("d")).toBe(fresh.attrs.get("d"));
    expect(p.attrs.get("d")).not.toBe(fallback);
    m.destroy();
    ref.destroy();
  });

  test("a load from a loader replaced mid-flight is ignored", async () => {
    const old = deferred();
    setRegionLoader(() => old.promise);
    const first = preloadRegion();
    const fresh = { ...region };
    setRegionLoader(async () => fresh as typeof region);
    old.resolve(region);
    await first;
    expect(await preloadRegion()).toBe(fresh as typeof region);
  });

  test("stroke flight retargeted to a fill icon before its first frame doesn't throw", async () => {
    await preloadRegion();
    const p = fake();
    const m = createMorph(p.el, LUCIDE_X);
    m.morphTo("M4 6h16M4 12h16M4 18h16");
    expect(() => m.morphTo(PAUSE)).not.toThrow(); // same tick, buffers never drawn
    frame(16);
    expect(p.attrs.get("d")).not.toMatch(/NaN|undefined/);
    settleAll();
    expect((p.attrs.get("d") ?? "").match(/M/g)?.length).toBe(2);
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
    expect(p.attrs.get("d")).not.toMatch(/NaN|undefined/);
    settleAll();
    expect(p.attrs.get("fill")).toBe("currentColor");
    m.destroy();
  });

  test("a driver born on an element an earlier driver painted repaints its stroke", async () => {
    await preloadRegion();
    const p = fake();
    const first = createMorph(p.el, LUCIDE_X);
    first.morphTo(PAUSE);
    frame(16);
    frame(16);
    first.destroy(); // mid-flight: the element is painted filled
    expect(p.attrs.get("fill")).toBe("currentColor");
    // a reconnected <morph-icon>, a React effect run again on the same <path>
    const next = createMorph(p.el, LUCIDE_X);
    expect(p.attrs.get("d")).toBe(canonicalD(LUCIDE_X));
    expect(p.attrs.get("fill")).toBe("none");
    expect(p.attrs.get("stroke")).toBe("inherit");
    next.destroy();
  });

  test("a driver born on a painted element writes its own paint, whatever is there now", async () => {
    await preloadRegion();
    const p = fake();
    createMorph(p.el, PAUSE).destroy();
    // the caller restores its stroke template between the two drivers
    p.el.setAttribute("fill", "none");
    p.el.setAttribute("stroke", "currentColor");
    const next = createMorph(p.el, PAUSE);
    expect(p.attrs.get("fill")).toBe("currentColor");
    expect(p.attrs.get("stroke")).toBe("none");
    next.destroy();
  });

  test("a 128-point flight interrupted after the chunk is gone falls back without NaN", async () => {
    await preloadRegion();
    const p = fake();
    const m = createMorph(p.el, PLAY);
    m.morphTo(GEAR);
    frame(16);
    frame(16);
    setRegionLoader(() => Promise.reject(new Error("offline")));
    m.morphTo(PAUSE);
    await flush();
    for (const t of [16, 16, 16, 300]) {
      frame(t);
      expect(p.attrs.get("d")).not.toMatch(/NaN|undefined/);
    }
    settleAll();
    expect((p.attrs.get("d") ?? "").match(/M/g)?.length).toBe(2);
    m.destroy();
  });

  test("a fill icon at mount paints filled (holes wound) and prefetches on idle", async () => {
    let loads = 0;
    setRegionLoader(async () => {
      loads++;
      return region;
    });
    const idle: Array<() => void> = [];
    const g = globalThis as { requestIdleCallback?: (cb: () => void) => void };
    g.requestIdleCallback = (cb) => idle.push(cb);
    try {
      const p = fake();
      const heroSolid: IconNode = [
        [
          "path",
          { d: "M4 4h16v16H4zM8 8h8v8H8z", "fill-rule": "evenodd", fill: "currentColor" },
        ],
      ];
      const m = createMorph(p.el, heroSolid);
      // nonzero, the evenodd hole wound against its outer
      expect(p.attrs.get("fill-rule")).toBe("nonzero");
      const rest = iconToCubics(String(p.attrs.get("d"))).map((c) => c.pts);
      expect(Math.abs(windingAt(rest, 6, 6))).toBe(1);
      expect(windingAt(rest, 12, 12)).toBe(0);
      await flush();
      expect(loads).toBe(0); // not on the critical path
      for (const cb of idle) cb();
      await flush();
      expect(loads).toBe(1);
      await flush();
      // and the icon now rests on its exact region
      expect(p.attrs.get("d")).toBe(canonicalD(region.regionOf(heroSolid, 2)));
      expect(p.attrs.get("fill-rule")).toBe("nonzero");
      m.destroy();
    } finally {
      delete g.requestIdleCallback;
    }
  });

  test("Save-Data: no prefetch; the first morph that needs the chunk loads it", async () => {
    let loads = 0;
    setRegionLoader(async () => {
      loads++;
      return region;
    });
    const nav = globalThis.navigator as { connection?: { saveData: boolean } };
    nav.connection = { saveData: true };
    try {
      const m = createMorph(fake().el, DISC);
      await new Promise((r) => setTimeout(r, 250));
      expect(loads).toBe(0);
      m.morphTo(LUCIDE_X);
      await flush();
      expect(loads).toBe(1);
      settleAll();
      m.destroy();
    } finally {
      delete nav.connection;
    }
  });
});

describe("pre-chunk rest: the closest single look", () => {
  // a line icon with a filled dot (Iconoir wallet): the dot's outline covers it
  const WALLET: IconNode = [
    ["path", { d: "M3 7h18v13H3z", fill: "none", stroke: "currentColor" }],
    [
      "circle",
      { cx: 16.5, cy: 13.5, r: 0.5, fill: "currentColor", stroke: "currentColor" },
    ],
  ];
  // filled and stroked (Iconoir solid): the stroke fattens the fill
  const STAR: IconNode = [
    [
      "path",
      {
        d: "M12 3l3 6 6 1-4.5 4 1 6-5.5-3-5.5 3 1-6L3 10l6-1z",
        fill: "currentColor",
        stroke: "currentColor",
      },
    ],
  ];
  // a pupil (nonzero) inside an evenodd ring (Heroicons eye-16-solid)
  const EYE: IconNode = [
    ["circle", { cx: 12, cy: 12, r: 2, fill: "currentColor" }],
    [
      "path",
      {
        d: "M2 12a10 7 0 1 0 20 0a10 7 0 1 0-20 0zM8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0z",
        "fill-rule": "evenodd",
        fill: "currentColor",
      },
    ],
  ];

  // a filled envelope with a stroked arrow (iconoir mail-out): the arrow
  // encloses next to nothing, so both, not an outlined envelope
  const MAIL: IconNode = [
    ["path", { d: "M2 6h14v13H2z", fill: "currentColor" }],
    ["path", { d: "M19 9V2m-3 3 3-3 3 3", fill: "none", stroke: "currentColor" }],
  ];
  // two overlapping evenodd elements (bi music-note): their union, not a XOR
  const NOTE: IconNode = [
    ["path", { d: "M3 3h12v12H3z", "fill-rule": "evenodd", fill: "currentColor" }],
    ["path", { d: "M9 9h12v12H9z", "fill-rule": "evenodd", fill: "currentColor" }],
  ];
  const restWinding = (icon: IconNode, x: number, y: number): number =>
    windingAt(
      iconToCubics(canonicalD(icon)).map((c) => c.pts),
      x,
      y,
    );

  test("SSR / first paint: stroke, both or fill, always nonzero", () => {
    expect(restAttrs(WALLET)).toEqual({ fill: "none", stroke: "inherit" });
    const both = { fill: "currentColor", stroke: "inherit", "fill-rule": "nonzero" };
    expect(restAttrs(STAR)).toEqual(both);
    expect(restAttrs(MAIL)).toEqual(both);
    const fill = { fill: "currentColor", stroke: "none", "fill-rule": "nonzero" };
    expect(restAttrs(DISC)).toEqual(fill);
    expect(restAttrs(EYE)).toEqual(fill);
    expect(restAttrs(NOTE)).toEqual(fill);
  });

  test("evenodd elements are wound for nonzero: holes stay holes, overlaps add up", () => {
    expect(restWinding(EYE, 12, 12)).not.toBe(0); // the pupil, in the iris hole
    expect(restWinding(EYE, 14.5, 12)).toBe(0); // the hole
    expect(restWinding(EYE, 19, 12)).not.toBe(0); // the white of the eye
    expect(restWinding(NOTE, 12, 12)).not.toBe(0); // the overlap paints
    expect(restWinding(NOTE, 6, 6)).not.toBe(0);
    expect(restWinding(NOTE, 18, 18)).not.toBe(0);
  });

  test("the driver rests on that look until the chunk, then on the region", async () => {
    const d = deferred();
    setRegionLoader(() => d.promise as Promise<typeof region>);
    const p = fake();
    const m = createMorph(p.el, WALLET);
    expect(p.attrs.get("fill")).toBeUndefined(); // the <svg>'s stroke, as markup
    m.set(STAR);
    expect(p.attrs.get("stroke")).toBe("inherit");
    expect(p.attrs.get("fill")).toBe("currentColor");
    d.resolve(region);
    await flush();
    await flush();
    expect(p.attrs.get("stroke")).toBe("none");
    expect(p.attrs.get("d")).toBe(canonicalD(region.regionOf(STAR, 2)));
    m.destroy();
  });

  test("an icon mounted once the chunk is around rests on its region at once", async () => {
    await preloadRegion();
    const p = fake();
    createMorph(p.el, EYE).destroy();
    expect(p.attrs.get("d")).toBe(canonicalD(region.regionOf(EYE, 2)));
    expect(p.attrs.get("fill-rule")).toBe("nonzero");
  });
});

describe("duotone and caches", () => {
  const DUOTONE: IconNode = [
    ["path", { d: "M4 4h16v16H4z", opacity: "0.2", fill: "currentColor" }],
    ["path", { d: "M8 8h8v8H8z", fill: "currentColor" }],
  ];

  test("a duotone icon rests without its translucent layer, before and after the chunk", async () => {
    // one subpath: the 0.2 layer is not painted opaque under the solid one
    expect(canonicalD(DUOTONE).match(/M/g)?.length).toBe(1);
    expect(restAttrs(DUOTONE)?.fill).toBe("currentColor");
    await preloadRegion();
    const p = fake();
    const m = createMorph(p.el, PLAY);
    m.morphTo(DUOTONE);
    settleAll();
    const xs = (p.attrs.get("d") ?? "").match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
    expect(Math.min(...xs)).toBeGreaterThan(7.9); // the 8..16 square only
    expect(Math.max(...xs)).toBeLessThan(16.1);
    m.destroy();
  });

  test("icons rebuilt on every render reuse one region, its samples and its plans", () => {
    const make = (): IconNode => [
      ["circle", { cx: 12, cy: 12, r: 9, fill: "currentColor" }],
    ];
    const a = make();
    const b = make();
    expect(a).not.toBe(b);
    expect(region.regionOf(a, 2)).toBe(region.regionOf(b, 2));
    expect(region.regionPlan(a, PLAY, 2)).toBe(region.regionPlan(b, PLAY, 2));
    // a stroke icon keys by width too
    const x = (): IconNode => LUCIDE_X.map(([t, at]) => [t, { ...at }] as const);
    expect(region.regionOf(x(), 2)).toBe(region.regionOf(x(), 2));
    expect(region.regionOf(x(), 2)).not.toBe(region.regionOf(x(), 3));
  });
});
