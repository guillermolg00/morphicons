import type { IconEntry } from "@/lib/icons";
import { dOf } from "@/lib/icons";

/* Non-animated icon rendered straight from the pure core (cubicsToPathD).
   Usable from server and client components alike; no runtime, no rAF. */
export function StaticIcon({
  entry,
  size = 20,
  strokeWidth = 2,
  className,
}: {
  entry: IconEntry;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={dOf(entry)} suppressHydrationWarning />
    </svg>
  );
}
