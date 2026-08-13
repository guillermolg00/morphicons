/* <morph-icon> custom element: the binding for hosts without a component
   runtime — Astro, plain HTML, HTMX, server-rendered anything. Same three
   modes and the same lifecycle contract as the framework bindings (mirrored
   mount suite), reached through attributes for HTML authoring and through
   properties/methods for scripts. If the element already contains a
   server-rendered <svg><path> (the Astro shell, or any SSR'd markup) it is
   adopted verbatim — the element never rewrites SSR bytes at rest; otherwise
   the element renders its own <svg> on connect.

   The module is safe to import during SSR even though the class is DOM-only:
   it extends a lazy base, so evaluating it without HTMLElement never throws —
   defining and upgrading are what need a browser. */

import type { SpringPreset } from "../core/spring";
import type { IconInput } from "../core/types";
import { computeInitialD, createController, type MorphHandle } from "../dom/controller";
import type { MorphOptions, PathEl, ReducedMotionMode } from "../dom/index";

const SVG_NS = "http://www.w3.org/2000/svg";

type Controller = ReturnType<typeof createController>;

interface Props {
  icon?: IconInput;
  from?: IconInput;
  to?: IconInput;
  progress?: number;
  spring?: SpringPreset | MorphOptions;
  reducedMotion?: ReducedMotionMode;
}

const REACTIVE = ["icon", "from", "to", "progress", "spring", "reducedMotion"] as const;
const PRESENTATION = new Set([
  "size",
  "color",
  "stroke-width",
  "absolute-stroke-width",
  "label",
]);

/* SSR-safe base: the class body needs HTMLElement only in a browser. */
const Base: typeof HTMLElement =
  typeof HTMLElement === "undefined"
    ? (class {} as unknown as typeof HTMLElement)
    : HTMLElement;

export class MorphIconElement extends Base implements MorphHandle {
  static observedAttributes = [
    "icon",
    "from",
    "to",
    "progress",
    "spring",
    "reduced-motion",
    "size",
    "color",
    "stroke-width",
    "absolute-stroke-width",
    "label",
  ];

  #props: Props = {};
  #ctrl: Controller | null = null;
  #path: SVGPathElement | null = null;
  // First-mount bookkeeping: #adopted marks that #path came from server
  // markup; #preConnectDirty that a script moved the props away from that
  // markup before upgrade (property writes or imperative calls — attributes
  // ARE the markup and stay trusted). Together they decide whether the first
  // mount may swallow the driver's initialization writes (see the gate in
  // connectedCallback).
  #adopted = false;
  #preConnectDirty = false;
  // Presentation state; defaults mirror the framework bindings.
  #size = "24";
  #color = "currentColor";
  #strokeWidth = "2";
  #absoluteStrokeWidth = false;
  #label: string | null = null;

  // -- reactive properties: the full-JS surface (IconNode, custom springs) --

  get icon(): IconInput | undefined {
    return this.#props.icon;
  }
  set icon(v: IconInput | undefined) {
    this.#props.icon = v;
    this.#watch();
  }

  get from(): IconInput | undefined {
    return this.#props.from;
  }
  set from(v: IconInput | undefined) {
    this.#props.from = v;
    this.#watch();
  }

  get to(): IconInput | undefined {
    return this.#props.to;
  }
  set to(v: IconInput | undefined) {
    this.#props.to = v;
    this.#watch();
  }

  get progress(): number | undefined {
    return this.#props.progress;
  }
  set progress(v: number | undefined) {
    this.#props.progress = v;
    this.#watch();
  }

  get spring(): SpringPreset | MorphOptions | undefined {
    return this.#props.spring;
  }
  set spring(v: SpringPreset | MorphOptions | undefined) {
    this.#props.spring = v;
    this.#watch();
  }

  get reducedMotion(): ReducedMotionMode | undefined {
    return this.#props.reducedMotion;
  }
  set reducedMotion(v: ReducedMotionMode | undefined) {
    this.#props.reducedMotion = v;
    this.#watch();
  }

  // -- imperative surface (MorphHandle, like ref/bind:this elsewhere) --

  morphTo(icon: IconInput, spring?: SpringPreset | MorphOptions): void {
    const ctrl = this.#ctrl;
    if (!ctrl) {
      this.#imperativeBeforeDriver(icon); // pre-connect: painted on connect
      return;
    }
    ctrl.morphTo(icon, spring ?? this.#props.spring);
  }

  set(icon: IconInput): void {
    const ctrl = this.#ctrl;
    if (!ctrl) {
      this.#imperativeBeforeDriver(icon);
      return;
    }
    ctrl.set(icon);
  }

  // -- lifecycle --

  connectedCallback(): void {
    for (const key of REACTIVE) this.#upgradeProperty(key);
    if (!this.#path) this.#adoptOrRender();
    // Layout-neutral wrapper unless the author styled it (the Astro shell
    // ships display:contents in the SSR markup, so no flash either way).
    if (this.style.display === "") this.style.display = "contents";
    if (this.#path && !this.#ctrl) {
      const path = this.#path;
      // Verbatim adoption, literally: the first mount over adopted markup
      // performs ZERO d writes. The driver's initialization only re-derives
      // what the server already painted (the identical canonical d, or the
      // frozen pair shape modulo last-ulp trig), so those writes are
      // swallowed by a gated PathEl and the SSR bytes stay untouched until
      // the first real change. The gate is skipped when a pre-upgrade script
      // moved the props away from the markup (#preConnectDirty) — there the
      // mount MUST paint — and on re-mounts (reconnects repaint rest state).
      const gate = this.#adopted && !this.#preConnectDirty;
      this.#adopted = false;
      this.#ctrl = createController(this.#props);
      if (gate) {
        let armed = false;
        const gated: PathEl = {
          setAttribute(name: string, value: string): void {
            if (armed) path.setAttribute(name, value);
          },
        };
        try {
          this.#ctrl.mount(gated, this.#props);
        } finally {
          armed = true;
        }
      } else {
        this.#ctrl.mount(path, this.#props);
      }
    }
  }

  disconnectedCallback(): void {
    // Mirrors unmount in the framework bindings: mid-flight state dies with
    // the driver; a reconnect mounts a fresh controller at the rest state.
    this.#ctrl?.destroy();
    this.#ctrl = null;
  }

  attributeChangedCallback(
    name: string,
    _old: string | null,
    value: string | null,
  ): void {
    switch (name) {
      case "icon":
        this.#props.icon = value ?? undefined;
        break;
      case "from":
        this.#props.from = value ?? undefined;
        break;
      case "to":
        this.#props.to = value ?? undefined;
        break;
      case "progress": {
        const n = value === null ? Number.NaN : Number(value);
        this.#props.progress = Number.isFinite(n) ? n : undefined;
        break;
      }
      case "spring":
        this.#props.spring = (value as SpringPreset | null) ?? undefined;
        break;
      case "reduced-motion":
        this.#props.reducedMotion = (value as ReducedMotionMode | null) ?? undefined;
        break;
      case "size":
        this.#size = value ?? "24";
        break;
      case "color":
        this.#color = value ?? "currentColor";
        break;
      case "stroke-width":
        this.#strokeWidth = value ?? "2";
        break;
      case "absolute-stroke-width":
        this.#absoluteStrokeWidth = value !== null;
        break;
      case "label":
        this.#label = value;
        break;
    }
    if (!this.#path) return; // pre-connect parse: attributes only seed #props
    if (PRESENTATION.has(name)) {
      const svg = this.querySelector("svg");
      if (svg) this.#applyPresentation(svg);
      return;
    }
    this.#watch();
  }

  // -- internals --

  /** A property assigned before the element was defined lands as an own
   *  value that shadows the accessor; re-route it through the setter. */
  #upgradeProperty(key: (typeof REACTIVE)[number]): void {
    if (Object.hasOwn(this, key)) {
      const self = this as unknown as Record<string, unknown>;
      const v = self[key];
      delete self[key];
      self[key] = v;
    }
  }

  #watch(): void {
    const ctrl = this.#ctrl;
    if (!ctrl) {
      // A script mutated props while there is no driver: the SSR bytes no
      // longer describe the mount state, so the first mount must paint.
      this.#preConnectDirty = true;
      return;
    }
    ctrl.watch(this.#props);
  }

  /** Imperative call before the controller exists: adopt the icon as the
   *  mount state AND exit controlled mode — "every imperative call
   *  invalidates the frozen pair" must hold pre-connect too, or a pending
   *  pair would win the mount and silently discard this call. */
  #imperativeBeforeDriver(icon: IconInput): void {
    this.#props.icon = icon;
    this.#props.from = undefined;
    this.#props.to = undefined;
    this.#preConnectDirty = true;
  }

  /** SSR markup is adopted verbatim (the element never rewrites server bytes
   *  at rest); without it, the element renders its own <svg> like the
   *  framework shells do. */
  #adoptOrRender(): void {
    const existing = this.querySelector("path");
    if (existing) {
      this.#path = existing;
      this.#adopted = true;
      // With no icon anywhere, the server-painted d IS the at-rest icon, so
      // scripts can morph away from it without repeating themselves.
      const p = this.#props;
      if (p.icon === undefined && p.from === undefined && p.to === undefined) {
        const d = existing.getAttribute("d");
        if (d) p.icon = d;
      }
      return;
    }
    const doc = this.ownerDocument;
    const svg = doc.createElementNS(SVG_NS, "svg");
    svg.setAttribute("xmlns", SVG_NS);
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    this.#applyPresentation(svg);
    const path = doc.createElementNS(SVG_NS, "path");
    path.setAttribute("d", computeInitialD(this.#props));
    svg.appendChild(path);
    this.appendChild(svg);
    this.#path = path;
  }

  #applyPresentation(svg: SVGElement): void {
    svg.setAttribute("width", this.#size);
    svg.setAttribute("height", this.#size);
    svg.setAttribute("stroke", this.#color);
    const sw = this.#absoluteStrokeWidth
      ? String((Number(this.#strokeWidth) * 24) / Number(this.#size))
      : this.#strokeWidth;
    svg.setAttribute("stroke-width", sw);
    const label = this.#label;
    let title = svg.querySelector<SVGTitleElement>("title");
    if (label) {
      svg.setAttribute("role", "img");
      svg.removeAttribute("aria-hidden");
      if (!title) {
        title = this.ownerDocument.createElementNS(SVG_NS, "title");
        svg.insertBefore(title, svg.firstChild);
      }
      title.textContent = label;
    } else {
      svg.removeAttribute("role");
      svg.setAttribute("aria-hidden", "true");
      title?.remove();
    }
  }
}

/* A constructor registers with customElements exactly once. */
let registered = false;

/** Defines `<morph-icon>` (or a custom tag). Idempotent per tag; a no-op
 *  without a DOM (safe to call from code that also runs during SSR). */
export function defineMorphIcon(tag = "morph-icon"): void {
  if (typeof customElements === "undefined" || customElements.get(tag)) return;
  // Extra tags get a thin subclass: reusing a registered constructor throws.
  customElements.define(
    tag,
    registered ? class extends MorphIconElement {} : MorphIconElement,
  );
  registered = true;
}

declare global {
  interface HTMLElementTagNameMap {
    "morph-icon": MorphIconElement;
  }
}

export type { IconInput, IconNode, Sampled } from "../core/types";
export type { MorphHandle } from "../dom/controller";
export { computeInitialD } from "../dom/controller";
export type { Morph, MorphOptions, PathEl, ReducedMotionMode } from "../dom/index";
export type { SpringPreset };
