import type { Metadata } from "next";
import { ShowcaseCanvas } from "@/components/showcase-canvas";
import { ShowcaseShell } from "@/components/showcase-shell";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { SnippetBlock } from "@/components/snippet-block";

export const metadata: Metadata = {
	title: "Canvas adapter",
	description:
		"canvasTarget turns any canvas or 2D context into a morph target: icons as pixels you own. A Mapbox map whose pins morph through interaction states, and a streaming chart whose trend icon rides the data.",
	alternates: { canonical: "/showcase/canvas" },
};

const SNIPPET = `import { createMorph } from "morphicons/dom";
import { canvasTarget } from "morphicons/adapters";
import { Flag, MapPin } from "lucide"; // data, not components

const sprite = document.createElement("canvas");
sprite.width = sprite.height = 64;

const morph = createMorph(
  canvasTarget(sprite, { color: "#fff", onWrite: () => map.triggerRepaint() }),
  MapPin,
);
morph.morphTo(Flag, "smooth");

// the canvas is pixels you own: a Mapbox StyleImage, a chart badge,
// a WebGL texture, a favicon, an OffscreenCanvas in a worker
`;

export default function CanvasShowcasePage() {
	return (
		<div className="flex flex-1 flex-col">
			<SiteHeader />

			<ShowcaseShell
				active="canvas"
				lede={
					<>
						canvasTarget draws the morph into any canvas or 2D context: a
						texture inside a map, a sprite in a chart, a favicon, an
						OffscreenCanvas in a worker.
					</>
				}
				traits={[
					{
						label: "Why this path",
						body: "Icons where the DOM can't reach: WebGL scenes, canvas charts, workers. Every icon shares the driver's single rAF.",
					},
					{
						label: "How it works",
						body: "Each frame is one stroke() of a Path2D. Hosts with their own render loop give the icon a small canvas of its own and composite it; onWrite says when to repaint.",
					},
					{
						label: "The tradeoff",
						body: "You own resolution and devicePixelRatio, and it draws strokes only. Color is fixed at target creation, so a live tint happens at composite time (both demos below do that). canvasTarget itself is 0.5 KB gzip.",
					},
				]}
			>
				<ShowcaseCanvas />

				<div className="mx-auto mt-12 w-full max-w-[1200px] px-6">
					<h2 className="text-lg font-semibold tracking-[-0.02em] text-ink">
						The whole integration
					</h2>
					<p className="mb-4 mt-1.5 text-sm leading-6 text-body">
						One adapter call around the DOM driver. The rest of the demos above
						is the host compositing these pixels.
					</p>
					<SnippetBlock label="morphicons/adapters" code={SNIPPET} />
					<p className="mt-4 text-[13px] leading-6 text-mute">
						Mapbox GL and the chart runtime load only when their card scrolls
						into view. The save wave is Canvas UI&apos;s Ripple shader (MIT +
						Commons Clause).
					</p>
				</div>
			</ShowcaseShell>

			<SiteFooter />
		</div>
	);
}
