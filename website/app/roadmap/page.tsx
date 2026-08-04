import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";

export const metadata: Metadata = {
	title: "Roadmap",
	description:
		"Where morphicons is heading: hardened public boundaries, a component showcase, SVG Doctor, a shareable Studio and a custom animation editor.",
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
				title: "Universal morphing core — v1.0",
				note: "Any stroke icon morphs into any other: optimal rotation in closed form, spring physics, zero dependencies. DOM and React drivers included.",
			},
			{
				title: "morphicons.com",
				note: "The interactive Studio: every pair, every library, scrubbable mid-flight.",
			},
			{
				title: "React, Vue and Svelte drivers",
				note: (
					<>
						<Code>morphicons/react</Code> <Code>morphicons/vue</Code>{" "}
						<Code>morphicons/svelte</Code>: <Code>MorphIcon</Code> experience: SSR first
						paint, accessibility included
					</>
				),
			},
			{
				title: "React, Vue and Svelte lifecycle hardening",
				note: "One documented contract for the three drivers — icons that arrive late, explicit mode precedence, clean re-entry — pinned by real client-mount tests.",
			},
			{
				title: "React Native driver",
				note: (
					<>
						<Code>morphicons/react-native</Code>: the DOM-free core beyond the browser —
						the same <Code>MorphIcon</Code> over react-native-svg, same lifecycle
						contract, reduced motion from the OS setting
					</>
				),
			},
			{
				title: "Component showcase",
				note: "The icon swaps that show up most in real shadcn/ui apps, as copy-paste components: pick the library, framework, spring and stroke.",
			},
		],
	},
	{
		label: "Up next",
		dot: "border border-ink bg-canvas",
		items: [
			{
				title: "Bulletproof inputs",
				note: "Clear errors at every public boundary, malformed paths, invalid springs, mismatched sample sizes.",
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
				note: "The full morph state, pair, spring, progress, serialized in the URL.",
			},
		],
	},
	{
		label: "Exploring",
		dot: "border border-hairline bg-canvas",
		items: [
			{
				title: "Custom Animation Studio",
				note: "A timeline editor for choreographies beyond the automatic morph, shipped as a separate package.",
			}
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
					Where morphicons is heading — hardening and new capabilities,
					interleaved. No dates: things ship when they feel right.
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
