"use client";

import { ArrowRight, File } from "lucide";
import { MorphIcon } from "morphicons/react";
import { useState } from "react";

/* The docs CTA: its icon morphs File → ArrowRight on hover/focus, another
	 spot where the library demos itself in the page chrome. */
export function DocsButton({ href }: { href: string }) {
	const [hovered, setHovered] = useState(false);

	return (
		<a
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			onFocus={() => setHovered(true)}
			onBlur={() => setHovered(false)}
			className="mt-8 inline-flex h-11 items-center gap-2 rounded-md bg-ink px-4 text-sm font-medium text-canvas shadow-card transition-opacity hover:opacity-90"
		>
			See the full docs
			<MorphIcon icon={hovered ? ArrowRight : File} size={16} strokeWidth={2} spring="snappy" />
		</a>
	);
}
