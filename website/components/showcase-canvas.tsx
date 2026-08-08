"use client";

import dynamic from "next/dynamic";
import { type ReactNode, useEffect, useRef, useState } from "react";

/* The two heavy guests (Mapbox GL, the chart runtime) are why this tab is a
   route of its own: they code-split away from /showcase entirely, load
   ssr:false inside this tab, and even then only as their card scrolls into
   view. A Mapbox map load is also billable, one more reason not to spend it
   on a card nobody reached. */

function Warming({ height }: { height: number }) {
  return (
    <div
      className="flex items-center justify-center"
      style={{ height }}
      aria-hidden="true"
    >
      <span className="animate-pulse text-[13px] text-mute">
        warming up the canvas…
      </span>
    </div>
  );
}

const CanvasChart = dynamic(() => import("@/components/canvas-chart"), {
  ssr: false,
  loading: () => <Warming height={380} />,
});
const CanvasMap = dynamic(() => import("@/components/canvas-map"), {
  ssr: false,
  loading: () => <Warming height={568} />,
});

/* Mounts children the first time the box approaches the viewport. */
function LazyMount({
  minHeight,
  children,
}: {
  minHeight: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setOn(true);
          io.disconnect();
        }
      },
      { rootMargin: "240px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} style={on ? undefined : { minHeight }}>
      {on ? children : null}
    </div>
  );
}

function DemoCard({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: ReactNode;
}) {
  return (
    <article className="overflow-hidden rounded-xl border border-hairline bg-canvas shadow-card">
      <header className="border-b border-hairline px-5 py-4">
        <h3 className="text-sm font-medium text-ink">{title}</h3>
        <p className="mt-0.5 max-w-[72ch] text-[13px] text-mute">{desc}</p>
      </header>
      {children}
    </article>
  );
}

export function ShowcaseCanvas() {
  return (
    <section
      aria-label="Canvas adapter demos"
      className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-6"
    >
      <DemoCard
        title="A streaming chart · TanStack Charts"
        desc="The trend indicator is a morph riding the series: when it turns, the shape and the color turn with it, and icon, line and area share one accent driven by the data. Nudge the drift and watch the flip."
      >
        <LazyMount minHeight={380}>
          <CanvasChart />
        </LazyMount>
      </DemoCard>

      <DemoCard
        title="Map pins with states · Mapbox GL"
        desc="Every pin is a Mapbox StyleImage whose pixels come from a morphing 2D canvas: place it, watch it learn its address, hover it, save it. Saving rolls a wave through the map's own texture, pins included."
      >
        <LazyMount minHeight={568}>
          <CanvasMap />
        </LazyMount>
      </DemoCard>
    </section>
  );
}
