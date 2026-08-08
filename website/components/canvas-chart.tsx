"use client";

import { areaY, d3Curve, defineChart, lineY } from "@tanstack/charts";
import { mountCanvasChart } from "@tanstack/charts/canvas";
import { scaleLinear } from "d3-scale";
import { curveMonotoneX } from "d3-shape";
import { Minus, TrendingDown, TrendingUp } from "lucide";
import type { IconInput } from "morphicons";
import { useEffect, useRef } from "react";
import { iconSprite } from "@/lib/icon-sprite";

/* canvasTarget in a chart: the icon as a LIVE READING of a datum.

   A datum that flips sign should not swap icons cold. Here the trend
   indicator is a morph: when the series turns, trending-up becomes
   trending-down with spring physics, and the transition reads as part of the
   data, not as an image swap. Icon, line and area share one accent, so the
   state reads at a glance.

   The icon is NOT a node in TanStack's scene (its scene model is declarative
   and has no images; and handing it our context would fight its render
   clock). It lives on its own small canvas, composited into the badge, with
   `onWrite` as the dirty signal: no write, no frame.

   Data: a drifting random walk, with the drift on two buttons. A real market
   feed was tried here and cut: BTC barely moves inside a one-minute window,
   so the icon sat flat. The walk turns often on its own, and the nudges put
   the flip on demand, which is the whole demo. */

const CURVE = d3Curve(curveMonotoneX);

const WINDOW = 72;
const TICK_MS = 110;
const CHART_H = 260;
const BADGE_CSS = 30;
const SPRITE_PX = 60; // 2x the CSS box, so Retina composites stay crisp

/* Deadband for the trend over the last 16 samples: without it the icon
   would flicker on noise. */
const TREND_N = 16;
const TREND_DEADBAND = 0.8;

interface Row {
  id: number;
  t: number;
  v: number;
}

interface Accents {
  up: string;
  down: string;
  flat: string;
}

const DARK_ACCENTS: Accents = { up: "#3fb950", down: "#f85149", flat: "#8b949e" };
const LIGHT_ACCENTS: Accents = { up: "#16a34a", down: "#dc2626", flat: "#737373" };

function domainOf(data: Row[]): [number, number] {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const r of data) {
    if (r.v < lo) lo = r.v;
    if (r.v > hi) hi = r.v;
  }
  // areaY anchors its fill at 0; pinning the domain to the visible range (and
  // clipping) is what keeps the series from flattening against the top.
  const pad = (hi - lo) * 0.18 || 1;
  return [lo - pad, hi + pad];
}

const buildDefinition = (data: Row[], color: string) =>
  defineChart({
    marks: [
      areaY(data, {
        id: "fill",
        x: "t",
        y: "v",
        key: "id",
        fill: color,
        fillOpacity: 0.12,
        curve: CURVE,
      }),
      lineY(data, {
        id: "series",
        x: "t",
        y: "v",
        key: "id",
        stroke: color,
        strokeWidth: 2,
        curve: CURVE,
      }),
    ],
    x: { scale: scaleLinear, axis: false, grid: false },
    y: { scale: scaleLinear().domain(domainOf(data)), grid: true },
    clip: true,
    margin: { top: 16, right: 16, bottom: 12, left: 56 },
  });

export default function CanvasChart() {
  const hostRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLCanvasElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);

  /* The streaming state lives in one mutable ref, not React state: the
     sampler writes 9 times a second and none of it needs a render.
     `.current` is only ever touched inside effects and event handlers. */
  const stRef = useRef({
    rows: [] as Row[],
    seq: 0,
    level: 100,
    drift: 0.2,
    shown: null as IconInput | null,
    tint: "",
    dark: false,
    badgeDirty: true,
  });

  /* Theme only matters to the accents, and those are re-read every tick:
     no render needed, just the ref and a forced restate of icon + tint. */
  useEffect(() => {
    const st = stRef.current;
    const q = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      st.dark = q.matches;
      st.shown = null;
    };
    apply();
    q.addEventListener("change", apply);
    return () => q.removeEventListener("change", apply);
  }, []);

  /* Chart + sprite + sampler, mounted once. */
  useEffect(() => {
    const st = stRef.current;
    const host = hostRef.current;
    const badge = badgeRef.current;
    if (!host || !badge) return;
    const badgeCtx = badge.getContext("2d");
    if (!badgeCtx) return;

    const accents = () => (st.dark ? DARK_ACCENTS : LIGHT_ACCENTS);
    const icons: Record<string, IconInput> = {
      up: TrendingUp,
      down: TrendingDown,
      flat: Minus,
    };

    const trendOf = (data: Row[]) => {
      const take = Math.min(TREND_N, data.length);
      const a = accents();
      if (take < 2) return { icon: icons.flat, color: a.flat, pct: 0 };
      const tail = data.slice(-take);
      const from = tail[0].v;
      const pct = ((tail[take - 1].v - from) / from) * 100;
      if (pct > TREND_DEADBAND) return { icon: icons.up, color: a.up, pct };
      if (pct < -TREND_DEADBAND) return { icon: icons.down, color: a.down, pct };
      return { icon: icons.flat, color: a.flat, pct };
    };

    const nextRow = (): Row => {
      // Random walk with drift: the drift is what the nudge buttons push,
      // and it decays on its own so the series goes back to wandering.
      st.drift *= 0.985;
      if (st.level < 40) st.drift = Math.abs(st.drift) + 0.1;
      if (st.level > 170) st.drift = -Math.abs(st.drift) - 0.1;
      st.level = Math.min(
        190,
        Math.max(20, st.level + st.drift + (Math.random() - 0.5) * 1.4),
      );
      st.seq += 1;
      return { id: st.seq, t: st.seq, v: st.level };
    };

    st.rows = Array.from({ length: WINDOW }, nextRow);
    st.tint = accents().flat;

    // Declared BEFORE the sprite: createMorph paints the initial icon
    // synchronously, so onWrite runs during construction.
    st.badgeDirty = true;

    const sprite = iconSprite({
      size: SPRITE_PX,
      icon: icons.flat,
      // White: the shape lives in the alpha, the tint lands at composite
      // time (canvasTarget fixes color at creation; the data's color is
      // alive, so it is applied where it can change).
      color: "#ffffff",
      strokeWidth: 2.2,
      onWrite: () => {
        st.badgeDirty = true;
      },
    });

    const chart = mountCanvasChart<Row, number, number>(host, {
      definition: buildDefinition(st.rows, st.tint),
      height: CHART_H,
      initialWidth: 720,
      ariaLabel: "Streaming series with a morphing trend indicator",
    });

    const sizeBadge = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(BADGE_CSS * dpr);
      if (badge.width !== w) {
        badge.width = w;
        badge.height = w;
        // Explicit CSS box: a canvas is a replaced element, and without it
        // this would render at device-pixel size (2x on Retina).
        badge.style.width = `${BADGE_CSS}px`;
        badge.style.height = `${BADGE_CSS}px`;
        st.badgeDirty = true;
      }
    };

    const paintBadge = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      badgeCtx.setTransform(1, 0, 0, 1, 0, 0);
      badgeCtx.clearRect(0, 0, badge.width, badge.height);
      badgeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      badgeCtx.drawImage(sprite.canvas, 0, 0, BADGE_CSS, BADGE_CSS);
      badgeCtx.globalCompositeOperation = "source-atop";
      badgeCtx.fillStyle = st.tint;
      badgeCtx.fillRect(0, 0, BADGE_CSS, BADGE_CSS);
      badgeCtx.globalCompositeOperation = "source-over";
    };

    let raf = 0;
    const compose = () => {
      sizeBadge();
      if (sprite.consume() || st.badgeDirty) {
        st.badgeDirty = false;
        paintBadge();
      }
      raf = requestAnimationFrame(compose);
    };
    raf = requestAnimationFrame(compose);

    const tick = () => {
      st.rows = [...st.rows.slice(-(WINDOW - 1)), nextRow()];

      const { icon, color, pct } = trendOf(st.rows);
      if (icon !== st.shown) {
        st.shown = icon;
        // smooth (no overshoot): the icon rides a gliding series, and a
        // bounce here would read as a snag.
        sprite.morph.morphTo(icon, "smooth");
        st.tint = color;
        st.badgeDirty = true;
      }
      chart.update({
        definition: buildDefinition(st.rows, st.tint),
        height: CHART_H,
        initialWidth: 720,
        ariaLabel: "Streaming series with a morphing trend indicator",
      });

      if (valueRef.current)
        valueRef.current.textContent = st.rows[st.rows.length - 1].v.toFixed(1);
      if (pctRef.current) {
        pctRef.current.textContent = `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
        pctRef.current.style.color = color;
      }
    };

    const timer = setInterval(tick, TICK_MS);
    tick();

    return () => {
      clearInterval(timer);
      cancelAnimationFrame(raf);
      sprite.morph.destroy();
      chart.destroy();
    };
  }, []);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              stRef.current.drift = 0.55;
            }}
            className="h-8 rounded-md border border-hairline bg-canvas px-3 text-[13px] text-body transition-colors hover:bg-canvas-soft-2 hover:text-ink"
          >
            Nudge up
          </button>
          <button
            type="button"
            onClick={() => {
              stRef.current.drift = -0.55;
            }}
            className="h-8 rounded-md border border-hairline bg-canvas px-3 text-[13px] text-body transition-colors hover:bg-canvas-soft-2 hover:text-ink"
          >
            Nudge down
          </button>
        </div>

        {/* min-width + right alignment: the number's width changes every
            tick, and without a reserved box the badge canvas would shuffle
            sideways with it. */}
        <div className="flex items-center gap-2.5">
          <canvas ref={badgeRef} aria-hidden="true" />
          <span className="flex min-w-[76px] flex-col items-end leading-[1.15]">
            <span
              ref={valueRef}
              className="text-xl tabular-nums tracking-[-0.02em] text-ink"
            >
              …
            </span>
            <span ref={pctRef} className="text-xs tabular-nums text-mute" />
          </span>
        </div>
      </div>

      <div ref={hostRef} className="mt-2 px-2" style={{ height: CHART_H }} />

      <p className="border-t border-hairline px-5 py-3 text-[13px] text-mute">
        simulated market · one sample every {TICK_MS} ms · the icon only
        repaints when the sprite writes
      </p>
    </div>
  );
}
