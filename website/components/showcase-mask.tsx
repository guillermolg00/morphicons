"use client";

import { Heart, Menu, Moon, Star, Sun, X } from "lucide";
import type { IconInput, IconNode } from "morphicons";
import { type MaskPathEl, maskTarget, svgToIcon } from "morphicons/adapters";
import { createMorph, type Morph } from "morphicons/dom";
import { useEffect, useRef, useState } from "react";
import { SnippetBlock } from "@/components/snippet-block";

/* The demo deliberately starts from MARKUP, not icon data: that is the mask
	 adapter's whole premise. Each lucide IconNode is serialized to the SVG an
	 Iconify pipeline would ship, and svgToIcon parses it back, exactly as a
	 consumer would hand it over. */

function toMarkup(node: IconNode): string {
	const inner = node
		.map(
			([tag, attrs]) =>
				`<${tag} ${Object.entries(attrs)
					.filter(([, v]) => v !== undefined)
					.map(([k, v]) => `${k}="${v}"`)
					.join(" ")}/>`,
		)
		.join("");
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor">${inner}</svg>`;
}

interface Shape {
	id: string;
	input: IconInput;
}

/* Parse ONCE, at module scope: reusing the references keeps the plan cache
	 and morphTo's no-op guard alive (both index by identity). */
const SHAPES: Shape[] = (
	[
		["menu", Menu],
		["x", X],
		["sun", Sun],
		["moon", Moon],
		["heart", Heart],
		["star", Star],
	] as const
).map(([id, node]) => ({
	id,
	input: svgToIcon(toMarkup(node)),
}));

const BRAND_GRADIENT =
	"linear-gradient(135deg, #007cf0 0%, #00dfd8 40%, #7928ca 70%, #ff0080 100%)";

const SNIPPET = `import { createMorph } from "morphicons/dom";
import { maskTarget, svgToIcon } from "morphicons/adapters";

// what an Iconify pipeline ships: markup, not components
const MENU = svgToIcon(
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 12h16"/><path d="M4 18h16"/><path d="M4 6h16"/></svg>',
);
const X = svgToIcon(
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
);

const target = maskTarget(el); // el: your mask-styled <span>
const morph = createMorph(target, MENU);
morph.morphTo(X, "snappy");

// on unmount: morph.destroy(); target.dispose();
`;

export function ShowcaseMask() {
	const elRef = useRef<HTMLSpanElement>(null);
	const morphRef = useRef<Morph | null>(null);
	const [shape, setShape] = useState(0);
	const [paint, setPaint] = useState<"gradient" | "ink">("gradient");
	const [auto, setAuto] = useState(true);

	useEffect(() => {
		const el = elRef.current;
		if (!el) return;
		// paint: false — the paint is this demo's OTHER control, so the element
		// keeps whatever background the React tree gives it.
		const target: MaskPathEl = maskTarget(el, { paint: false });
		const morph = createMorph(target, SHAPES[0].input);
		morphRef.current = morph;
		return () => {
			morphRef.current = null;
			morph.destroy();
			target.dispose();
		};
	}, []);

	useEffect(() => {
		morphRef.current?.morphTo(SHAPES[shape].input, "snappy");
	}, [shape]);

	/* A quiet auto-cycle sells the motion without a hand on the controls; the
		 first manual pick hands the wheel over for good. */
	useEffect(() => {
		if (!auto) return;
		const t = setInterval(() => setShape((s) => (s + 1) % SHAPES.length), 2600);
		return () => clearInterval(t);
	}, [auto]);

	const pick = (i: number) => {
		setAuto(false);
		setShape(i);
	};

	return (
		<section
			aria-label="Mask adapter demo"
			className="mx-auto w-full max-w-[1200px] px-6"
		>
			<article className="overflow-hidden rounded-xl border border-hairline bg-canvas shadow-card">
				<header className="border-b border-hairline px-5 py-4">
					<h3 className="text-sm font-medium text-ink">
						One element, no path in the DOM
					</h3>
					<p className="mt-0.5 text-[13px] text-mute">
						The shape below is a plain span: its geometry is a referenced SVG
						mask the driver rewrites per frame, and its color is just CSS
						showing through.
					</p>
				</header>

				<div className="flex flex-col md:flex-row">
					{/* The stage: the masked element itself. */}
					<div className="flex flex-1 items-center justify-center bg-canvas-soft px-6 py-14">
						<span
							ref={elRef}
							role="img"
							aria-label={`${SHAPES[shape].id} icon rendered through a CSS mask`}
							className={`block h-36 w-36 text-ink sm:h-40 sm:w-40 ${paint === "ink" ? "bg-current" : ""
								}`}
							style={
								paint === "gradient"
									? { backgroundImage: BRAND_GRADIENT }
									: undefined
							}
						/>
					</div>

					{/* Controls + the real input. */}
					<div className="flex flex-col gap-5 border-t border-hairline p-5 md:w-[340px] md:shrink-0 md:border-l md:border-t-0">
						<div>
							<span className="font-mono text-[11px] uppercase tracking-[0.08em] text-mute">
								Shape
							</span>
							<div className="mt-2 flex flex-wrap gap-1.5">
								{SHAPES.map((s, i) => (
									<button
										key={s.id}
										type="button"
										aria-pressed={i === shape}
										onClick={() => pick(i)}
										className={`h-8 rounded-md border px-3 font-mono text-xs transition-colors ${i === shape
												? "border-ink bg-ink text-canvas"
												: "border-hairline bg-canvas text-body hover:bg-canvas-soft-2 hover:text-ink"
											}`}
									>
										{s.id}
									</button>
								))}
							</div>
						</div>

						<div>
							<span className="font-mono text-[11px] uppercase tracking-[0.08em] text-mute">
								Element paint
							</span>
							<div
								role="group"
								aria-label="Element paint"
								className="mt-2 grid auto-cols-fr grid-flow-col overflow-hidden rounded-md border border-hairline bg-canvas"
							>
								{(["gradient", "ink"] as const).map((p) => (
									<button
										key={p}
										type="button"
										aria-pressed={paint === p}
										onClick={() => setPaint(p)}
										className={`flex h-8 items-center justify-center text-[13px] transition-colors ${paint === p
												? "bg-ink text-canvas"
												: "text-body hover:bg-canvas-soft-2 hover:text-ink"
											}`}
									>
										{p === "gradient" ? "Gradient" : "currentColor"}
									</button>
								))}
							</div>
							<p className="mt-2 text-[13px] leading-5 text-mute">
								The morph never touches color. A gradient, an image, plain
								currentColor: whatever paints the element shows through the
								moving mask.
							</p>
						</div>
					</div>
				</div>
			</article>

			<div className="mt-10">
				<h2 className="text-lg font-semibold tracking-[-0.02em] text-ink">
					The whole integration
				</h2>
				<p className="mb-4 mt-1.5 text-sm leading-6 text-body">
					Two adapter calls around the plain DOM driver. The element is
					anything with a box: a span from UnoCSS presetIcons, a Tailwind
					icon plugin, or your own markup.
				</p>
				<SnippetBlock label="morphicons/adapters" code={SNIPPET} />
			</div>
		</section>
	);
}
