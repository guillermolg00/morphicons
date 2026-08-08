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
						canvasTarget turns any canvas or 2D context into a morph target.
						The icon stops being a DOM node and becomes pixels you own: a GPU
						texture inside a map, a sprite composited into a chart, a favicon,
						an OffscreenCanvas in a worker.
					</>
				}
				traits={[
					{
						label: "Why this path",
						body: "Icons that live where the DOM cannot reach: WebGL scenes, canvas charts, workers, video frames. However many icons fly at once, they share the driver's single rAF.",
					},
					{
						label: "How it works",
						body: "Path2D parses each frame's geometry, so a write is one stroke() call. Hosts with their own render loop never hand over their context: the icon draws on a small dedicated canvas, the host composites the pixels, and onWrite is the dirty signal.",
					},
					{
						label: "The tradeoff",
						body: "You own resolution and devicePixelRatio. Color is fixed at target creation, so a live tint happens at composite time (both demos below do exactly that). And the heavy megabytes are the hosts, not the adapter: canvasTarget is 0.5 KB gzip.",
					},
				]}
			>
				<ShowcaseCanvas />

				<div className="mx-auto mt-12 w-full max-w-[1200px] px-6">
					<h2 className="text-lg font-semibold tracking-[-0.02em] text-ink">
						The whole integration
					</h2>
					<p className="mb-4 mt-1.5 text-sm leading-6 text-body">
						One adapter call around the plain DOM driver. Everything else in
						the demos above (tinting, dirty flags, StyleImage plumbing) is
						host-side compositing of the pixels this produces.
					</p>
					<SnippetBlock label="morphicons/adapters" code={SNIPPET} />
					<p className="mt-4 text-[13px] leading-6 text-mute">
						Mapbox GL and the chart runtime load only inside this tab, and
						only as their card scrolls into view: the core showcase stays as
						light as the library it demos. The save wave is Canvas UI&apos;s
						Ripple shader (MIT + Commons Clause), adapted to sample the
						map&apos;s own canvas.
					</p>
				</div>
			</ShowcaseShell>

			<SiteFooter />
		</div>
	);
}
