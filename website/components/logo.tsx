import { LOGO_PATH_D, LOGO_VIEWBOX } from "@/lib/brand";

/* Brand mark inlined as SVG so it inherits currentColor (adapts to light and
   dark themes) and costs no extra request. */
export function LogoMark({
  size = 20,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox={LOGO_VIEWBOX}
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d={LOGO_PATH_D} />
    </svg>
  );
}
