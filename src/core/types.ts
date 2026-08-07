/** Attributes of an icon node (values as Lucide exports them: string or
 *  number). `undefined` is allowed on purpose — lucide's SVGProps includes it
 *  and the runtime treats an undefined attr as absent (fallback). */
export type IconNodeAttrs = Record<string, string | number | undefined>;

/** Lucide-style icon data: a `[tag, attrs]` list. Structurally typed —
 *  Lucide is neither a dependency nor a peer; Feather/Tabler/custom paths
 *  work just the same. */
export type IconNode = ReadonlyArray<readonly [string, IconNodeAttrs]>;

/** Input accepted by the core: an IconNode, a raw `d` attribute, or an SVG
 *  markup string (an Iconify body, a full `<svg>`, a shadcn `<path>` …).
 *  A markup string is disambiguated from a `d` by its leading "<": it is
 *  parsed, scanned for morphability and re-gridded onto 24 via its viewBox.
 *  (SVGElement is resolved in the dom layer — the core never touches DOM.) */
export type IconInput = IconNode | string;

/** Normalized subpath: a chain of cubics packed as points
 *  [p0, c1, c2, p1, c1', c2', p2, …] → Float64Array of length 2·(3m+1),
 *  with m = number of segments. Consecutive segments share an endpoint. */
export interface CubicPath {
  pts: Float64Array;
  closed: boolean;
}

/** Subpath sampled at N points by arc length + its topology. It is the
 *  currency between resample and plan; an intermediate shape (interruption)
 *  is also a list of Sampled. */
export interface Sampled {
  pts: Float64Array;
  closed: boolean;
}

/** Number of cubic segments in a CubicPath. */
export function segCount(path: CubicPath): number {
  return (path.pts.length / 2 - 1) / 3;
}
