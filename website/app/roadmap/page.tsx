import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";

export const metadata: Metadata = {
	title: "Roadmap",
	description:
		"Where morphicons is heading: filled icons in the adapters, adapter ergonomics, SVG Doctor, a shareable Studio and a custom animation editor.",
	alternates: { canonical: "/roadmap" },
};

function Code({ children }: { children: ReactNode }) {
	return (
		<code className="rounded bg-canvas-soft-2 px-1.5 py-0.5 font-mono text-[13px] text-ink">
			{children}
		</code>
	);
}

type Group = {
	label: string;
	/* Timeline dot per group: shipped is solid ink, the active band is an ink
		 ring, everything further out fades to hairline. */
	dot: string;
	items: { title: string; note: ReactNode }[];
};

const GROUPS: Group[] = [
	{
		label: "Shipped",
		dot: "bg-ink",
		items: [
			{
				title: "Core and morphicons.com",
				note: "Any icon morphs into any other: optimal rotation in closed form, spring physics, zero dependencies. The Studio scrubs every pair mid-flight.",
			},
			{
				title: "Five bindings",
				note: (
					<>
						<Code>react</Code> <Code>vue</Code> <Code>svelte</Code>{" "}
						<Code>react-native</Code> <Code>element</Code>, plus an Astro shell. One
						lifecycle contract, exact SSR, accessibility built in.
					</>
				),
			},
			{
				title: "Reduced motion as a policy",
				note: (
					<>
						<Code>{'reducedMotion: "never" | "user" | "always"'}</Code> on the driver
						and every binding.
					</>
				),
			},
			{
				title: "Format adapters",
				note: (
					<>
						<Code>svgToIcon</Code> reads SVG markup, <Code>maskTarget</Code> morphs
						CSS-mask icons, <Code>canvasTarget</Code> draws into any canvas. Each
						tree-shakes alone.
					</>
				),
			},
			{
				title: "Showcase",
				note: "Copy-paste components for the icon swaps real apps ship, in core, mask and canvas tabs.",
			},
			{
				title: "Filled icons in 2.0",
				note: "Material Symbols, Heroicons solid, Phosphor fill: stroked and filled icons morph into each other. The code loads on first use.",
			},
		],
	},
	{
		label: "Up next",
		dot: "border border-ink bg-canvas",
		items: [
			{
				title: "Filled icons in the adapters",
				note: (
					<>
						<Code>maskTarget</Code> and <Code>canvasTarget</Code> draw strokes only
						today.
					</>
				),
			},
			{
				title: "Adapter ergonomics",
				note: (
					<>
						<Code>useTarget</Code> for React lifecycles and <Code>elementToIcon</Code>{" "}
						to read the icon an element already renders.
					</>
				),
			},
			{
				title: "Bulletproof inputs",
				note: "Clear errors at every public boundary: malformed paths, invalid springs.",
			},
		],
	},
	{
		label: "Planned",
		dot: "border border-hairline bg-canvas",
		items: [
			{
				title: "SVG Doctor",
				note: "Paste any SVG: a compatibility verdict, a live morph preview and ready-to-use code.",
			},
			{
				title: "Shareable Studio",
				note: "The pair, spring and progress, serialized in the URL.",
			},
		],
	},
	{
		label: "Exploring",
		dot: "border border-hairline bg-canvas",
		items: [
			{
				title: "Custom Animation Studio",
				note: "A timeline editor for choreographies beyond the automatic morph, as a separate package.",
			},
			{
				title: "Type that morphs",
				note: "Single-stroke fonts are pure centerlines: digits first, a counter whose 3 bends into 8.",
			},
		],
	},
];

export default function Roadmap() {
	return (
		<div className="flex flex-1 flex-col">
			<SiteHeader />

			<main className="mx-auto w-full max-w-[720px] flex-1 px-6 pb-24 pt-16">
				<h1 className="text-4xl font-semibold leading-[1.05] tracking-[-0.045em] text-ink">
					Roadmap
				</h1>
				<p className="mt-4 max-w-[560px] text-lg leading-7 text-body">
					Where morphicons is heading. No dates: things ship when they
					feel right.
				</p>

				<div className="mt-14 flex flex-col gap-12">
					{GROUPS.map((g) => (
						<section key={g.label}>
							<h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-mute">
								{g.label}
							</h2>
							<ol className="mt-5 border-l border-hairline">
								{g.items.map((it) => (
									<li key={it.title} className="relative pb-8 pl-7 last:pb-0">
										<span
											aria-hidden
											className={`absolute top-[5px] -left-[5.5px] h-[10px] w-[10px] rounded-full ${g.dot}`}
										/>
										<h3 className="text-[15px] font-medium text-ink">
											{it.title}
										</h3>
										<p className="mt-1 max-w-[58ch] text-sm leading-6 text-body">
											{it.note}
										</p>
									</li>
								))}
							</ol>
						</section>
					))}
				</div>
			</main>

			<SiteFooter />
		</div>
	);
}
