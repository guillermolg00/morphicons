/* Custom element binding: <morph-icon> upgraded for real on happy-dom.
   Pins the lifecycle contract shared by the bindings: lazy driver on
   iconless mounts, controlled-wins precedence and pair invalidation when
   leaving controlled mode. Mirror of test/react/mount.test.tsx,
   test/vue/mount.test.ts and test/svelte/mount.test.ts — the element has no
   batched updates, so "the same update" means consecutive property
   assignments in program order (policy first, then icon). On top of the
   shared contract it pins what only exists here: attribute-driven usage and
   verbatim adoption of server-rendered markup. */

import { afterEach, describe, expect, test } from "bun:test";
import type { IconInput } from "../../src/core/types";
import { defineMorphIcon, MorphIconElement } from "../../src/element/index";
import { frame, pendingFrames, registerDom, settleAll } from "../client-dom";
import { ICONS } from "../helpers";

registerDom();
defineMorphIcon();

interface Initial {
  icon?: IconInput;
  from?: IconInput;
  to?: IconInput;
  progress?: number;
  reducedMotion?: "never" | "user" | "always";
}

const cleanups: Array<() => void> = [];

function mountIcon(initial: Initial) {
  const el = document.createElement("morph-icon");
  Object.assign(el, initial); // pre-connect: seeds props, nothing runs yet
  document.body.appendChild(el);
  const api = {
    el,
    d: (): string => el.querySelector("path")?.getAttribute("d") ?? "",
    update: (next: Initial): void => {
      Object.assign(el, next);
    },
    unmount: (): void => {
      el.remove();
    },
  };
  cleanups.push(api.unmount);
  return api;
}

/** Reference d of a clean controlled mount at `progress` (deterministic). */
function controlledD(progress: number): string {
  const m = mountIcon({ from: ICONS.menu, to: ICONS.x, progress });
  const d = m.d();
  m.unmount();
  return d;
}

afterEach(() => {
  settleAll(5000);
  for (const dispose of cleanups.splice(0)) dispose();
});

describe("MorphIcon (custom element client)", () => {
  test("mount paints the canonical d and prop changes fly to the target", () => {
    const m = mountIcon({ icon: ICONS.menu });
    expect(m.d()).toBe(ICONS.menu);
    m.update({ icon: ICONS.x });
    frame(16);
    frame(16);
    const mid = m.d();
    expect(mid.startsWith("M")).toBe(true);
    expect(mid).toContain("L");
    expect(mid).not.toBe(ICONS.menu);
    settleAll();
    expect(m.d()).toBe(ICONS.x);
    expect(pendingFrames()).toBe(0);
  });

  test("#1 lazy driver: iconless mount + imperative set", () => {
    const m = mountIcon({});
    expect(m.d()).toBe("");
    m.el.set(ICONS.menu);
    expect(m.d()).toBe(ICONS.menu);
    expect(pendingFrames()).toBe(0);
  });

  test("#1 lazy driver: iconless mount + imperative morphTo behaves as set", () => {
    const m = mountIcon({});
    m.el.morphTo(ICONS.x);
    expect(m.d()).toBe(ICONS.x);
    expect(pendingFrames()).toBe(0);
  });

  test("#1 lazy driver: an icon arriving late paints without animating", () => {
    const m = mountIcon({});
    m.update({ icon: ICONS.menu });
    expect(m.d()).toBe(ICONS.menu);
    expect(pendingFrames()).toBe(0);
    // and the driver is live from then on
    m.update({ icon: ICONS.x });
    settleAll();
    expect(m.d()).toBe(ICONS.x);
  });

  test("#1 lazy driver: a controlled pair arriving late seeks like a clean mount", () => {
    const reference = controlledD(0.5);
    const m = mountIcon({});
    m.update({ from: ICONS.menu, to: ICONS.x, progress: 0.5 });
    expect(m.d()).toBe(reference);
    expect(pendingFrames()).toBe(0);
  });

  test("#2 leaving controlled mode invalidates the pair (re-base on return)", () => {
    const reference = controlledD(0.25);
    const m = mountIcon({ from: ICONS.menu, to: ICONS.x, progress: 0.5 });
    m.el.set(ICONS.check);
    expect(m.d()).toBe(ICONS.check);
    m.update({ from: ICONS.menu, to: ICONS.x, progress: 0.25 });
    expect(m.d()).toBe(reference);
  });

  test("#3 controlled wins: icon changes are ignored while the pair is active", () => {
    const m = mountIcon({
      icon: ICONS.menu,
      from: ICONS.menu,
      to: ICONS.x,
      progress: 0.5,
    });
    const frozen = m.d();
    m.update({ icon: ICONS.check });
    expect(m.d()).toBe(frozen);
    expect(pendingFrames()).toBe(0);
  });

  test("mode transition: dropping the pair hands the path back to icon", () => {
    const m = mountIcon({ from: ICONS.menu, to: ICONS.x, progress: 0.5 });
    m.update({ from: undefined, to: undefined, icon: ICONS.check });
    settleAll();
    expect(m.d()).toBe(ICONS.check);
  });

  test("mode transition: adding a pair takes over from icon", () => {
    const reference = controlledD(0.5);
    const m = mountIcon({ icon: ICONS.menu });
    m.update({ from: ICONS.menu, to: ICONS.x, progress: 0.5 });
    expect(m.d()).toBe(reference);
    expect(pendingFrames()).toBe(0);
  });

  test("unmount mid-flight destroys the driver and stops the scheduler", () => {
    const m = mountIcon({ icon: ICONS.menu });
    m.update({ icon: ICONS.x });
    frame(16);
    m.unmount();
    expect(pendingFrames()).toBe(0);
  });
});

describe("MorphIcon (custom element attributes)", () => {
  test("attributes drive the element: icon paints, changing it flies", () => {
    const el = document.createElement("morph-icon");
    el.setAttribute("icon", ICONS.menu);
    document.body.appendChild(el);
    cleanups.push(() => el.remove());
    expect(el.querySelector("path")?.getAttribute("d")).toBe(ICONS.menu);
    el.setAttribute("icon", ICONS.x);
    settleAll();
    expect(el.querySelector("path")?.getAttribute("d")).toBe(ICONS.x);
  });

  test("a controlled pair rides attributes as d strings", () => {
    const reference = controlledD(0.5);
    const el = document.createElement("morph-icon");
    el.setAttribute("from", ICONS.menu);
    el.setAttribute("to", ICONS.x);
    el.setAttribute("progress", "0.5");
    document.body.appendChild(el);
    cleanups.push(() => el.remove());
    expect(el.querySelector("path")?.getAttribute("d")).toBe(reference);
    expect(pendingFrames()).toBe(0);
  });

  test("presentation attributes patch the svg without touching the driver", () => {
    const m = mountIcon({ icon: ICONS.menu });
    const svg = m.el.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("24");
    m.el.setAttribute("size", "32");
    m.el.setAttribute("color", "tomato");
    expect(svg?.getAttribute("width")).toBe("32");
    expect(svg?.getAttribute("stroke")).toBe("tomato");
    expect(m.d()).toBe(ICONS.menu);
    expect(pendingFrames()).toBe(0);
  });

  test("a11y: label swaps role='img' + <title> for aria-hidden, live", () => {
    const m = mountIcon({ icon: ICONS.menu });
    const svg = m.el.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.querySelector("title")).toBeNull();
    m.el.setAttribute("label", "Menu");
    expect(svg?.getAttribute("role")).toBe("img");
    expect(svg?.getAttribute("aria-hidden")).toBeNull();
    expect(svg?.querySelector("title")?.textContent).toBe("Menu");
    m.el.removeAttribute("label");
    expect(svg?.getAttribute("role")).toBeNull();
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.querySelector("title")).toBeNull();
  });
});

describe("MorphIcon (custom element pre-connect imperative)", () => {
  test("set() before connect exits controlled mode: the pair does not win the mount", () => {
    const el = document.createElement("morph-icon");
    el.from = ICONS.menu;
    el.to = ICONS.x;
    el.progress = 0.5;
    el.set(ICONS.check);
    document.body.appendChild(el);
    cleanups.push(() => el.remove());
    expect(el.querySelector("path")?.getAttribute("d")).toBe(ICONS.check);
    expect(pendingFrames()).toBe(0);
    // and re-entering the same pair re-bases exactly like a clean mount
    const reference = controlledD(0.25);
    el.progress = 0.25;
    el.from = ICONS.menu;
    el.to = ICONS.x;
    expect(el.querySelector("path")?.getAttribute("d")).toBe(reference);
    expect(pendingFrames()).toBe(0);
  });

  test("morphTo() before connect behaves as set and exits controlled mode", () => {
    const el = document.createElement("morph-icon");
    el.from = ICONS.menu;
    el.to = ICONS.x;
    el.progress = 0.5;
    el.morphTo(ICONS.check);
    document.body.appendChild(el);
    cleanups.push(() => el.remove());
    expect(el.querySelector("path")?.getAttribute("d")).toBe(ICONS.check);
    expect(pendingFrames()).toBe(0);
  });
});

/* Shared SSR fixture markup (what the Astro shell emits, minus noise). */
const SVG_OPEN =
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" ` +
  `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ` +
  `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">`;

/** Replaces the path's setAttribute with a spy that records `d` writes. */
function instrumentD(path: Element): string[] {
  const writes: string[] = [];
  const orig = path.setAttribute.bind(path);
  path.setAttribute = (name: string, value: string): void => {
    if (name === "d") writes.push(value);
    orig(name, value);
  };
  return writes;
}

describe("MorphIcon (custom element verbatim adoption: zero d writes)", () => {
  test("upgrading an adopted uncontrolled icon writes NOTHING until a real change", () => {
    const host = document.createElement("div");
    host.innerHTML = `<morph-icon>${SVG_OPEN}<path d="${ICONS.menu}"></path></svg></morph-icon>`;
    const path = host.querySelector("path") as Element;
    const writes = instrumentD(path);
    document.body.appendChild(host);
    cleanups.push(() => host.remove());
    expect(writes.length).toBe(0);
    expect(path.getAttribute("d")).toBe(ICONS.menu);
    // the driver is live regardless: the first real change writes normally
    (host.querySelector("morph-icon") as MorphIconElement).morphTo(ICONS.x);
    settleAll();
    expect(writes.length).toBeGreaterThan(0);
    expect(path.getAttribute("d")).toBe(ICONS.x);
  });

  test("define-after-parse upgrade (the real Astro order) also writes nothing", () => {
    const host = document.createElement("div");
    host.innerHTML = `<morph-icon-ssr>${SVG_OPEN}<path d="${ICONS.menu}"></path></svg></morph-icon-ssr>`;
    document.body.appendChild(host); // connected while still an unknown element
    cleanups.push(() => host.remove());
    const path = host.querySelector("path") as Element;
    const writes = instrumentD(path);
    defineMorphIcon("morph-icon-ssr"); // upgrade happens HERE
    expect(writes.length).toBe(0);
    expect(path.getAttribute("d")).toBe(ICONS.menu);
    const el = host.querySelector("morph-icon-ssr") as MorphIconElement;
    el.morphTo(ICONS.x);
    settleAll();
    expect(path.getAttribute("d")).toBe(ICONS.x);
  });

  test("a server-frozen string pair stays controlled: zero writes, then scrubbing seeks", () => {
    const frozen = controlledD(0.5);
    const host = document.createElement("div");
    host.innerHTML =
      `<morph-icon from="${ICONS.menu}" to="${ICONS.x}" progress="0.5">` +
      `${SVG_OPEN}<path d="${frozen}"></path></svg></morph-icon>`;
    const path = host.querySelector("path") as Element;
    const writes = instrumentD(path);
    document.body.appendChild(host);
    cleanups.push(() => host.remove());
    expect(writes.length).toBe(0);
    expect(path.getAttribute("d")).toBe(frozen);
    // scrubbing the SAME pair seeks in place: no re-basing, no frames
    const el = host.querySelector("morph-icon") as MorphIconElement;
    el.progress = 0.25;
    expect(path.getAttribute("d")).toBe(controlledD(0.25));
    expect(pendingFrames()).toBe(0);
  });

  test("a pre-upgrade property write disables the gate: mount paints the request", () => {
    const host = document.createElement("div");
    host.innerHTML = `<morph-icon>${SVG_OPEN}<path d="${ICONS.menu}"></path></svg></morph-icon>`;
    const el = host.querySelector("morph-icon") as MorphIconElement;
    el.icon = ICONS.check; // a script moved the props away from the markup
    document.body.appendChild(host);
    cleanups.push(() => host.remove());
    expect(el.querySelector("path")?.getAttribute("d")).toBe(ICONS.check);
    expect(pendingFrames()).toBe(0);
  });
});

describe("MorphIcon (custom element SSR adoption)", () => {
  test("pre-rendered markup is adopted verbatim and morphs away from it", () => {
    const host = document.createElement("div");
    host.innerHTML =
      `<morph-icon style="display:contents">` +
      `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ` +
      `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ` +
      `stroke-linejoin="round" aria-hidden="true"><path d="${ICONS.menu}"></path></svg>` +
      `</morph-icon>`;
    document.body.appendChild(host);
    cleanups.push(() => host.remove());
    const el = host.querySelector("morph-icon") as MorphIconElement;
    const path = el.querySelector("path");
    // Adopted, not re-rendered: same node, same bytes, zero frames.
    expect(el.querySelectorAll("svg").length).toBe(1);
    expect(path?.getAttribute("d")).toBe(ICONS.menu);
    expect(pendingFrames()).toBe(0);
    // The server-painted d is the at-rest icon: scripts morph directly.
    el.morphTo(ICONS.x);
    settleAll();
    expect(el.querySelector("path")).toBe(path);
    expect(path?.getAttribute("d")).toBe(ICONS.x);
  });

  test("disconnect destroys the driver; reconnect mounts fresh at rest", () => {
    const m = mountIcon({ icon: ICONS.menu });
    m.update({ icon: ICONS.x });
    frame(16);
    m.el.remove();
    expect(pendingFrames()).toBe(0);
    document.body.appendChild(m.el);
    expect(m.d()).toBe(ICONS.x); // rest state of the last target
    m.update({ icon: ICONS.menu });
    settleAll();
    expect(m.d()).toBe(ICONS.menu);
  });
});

describe("MorphIcon (custom element registration)", () => {
  test("defineMorphIcon is idempotent and extra tags get a subclass", () => {
    defineMorphIcon(); // second call: no-op, no throw
    defineMorphIcon("morph-icon-alt");
    const alt = document.createElement("morph-icon-alt") as MorphIconElement;
    alt.icon = ICONS.menu;
    document.body.appendChild(alt);
    cleanups.push(() => alt.remove());
    expect(alt instanceof MorphIconElement).toBe(true);
    expect(alt.querySelector("path")?.getAttribute("d")).toBe(ICONS.menu);
  });

  test("properties assigned before definition are upgraded through setters", () => {
    defineMorphIcon("morph-icon-late");
    // Simulate the pre-upgrade shadow: an own value over the accessor.
    const el = document.createElement("morph-icon-late") as MorphIconElement;
    Object.defineProperty(el, "icon", {
      value: ICONS.menu,
      writable: true,
      configurable: true,
      enumerable: true,
    });
    document.body.appendChild(el);
    cleanups.push(() => el.remove());
    expect(el.querySelector("path")?.getAttribute("d")).toBe(ICONS.menu);
    el.icon = ICONS.x;
    settleAll();
    expect(el.querySelector("path")?.getAttribute("d")).toBe(ICONS.x);
  });
});

/** Forces the OS reduce-motion media query while `fn` runs. */
function withOsReducedMotion(fn: () => void): void {
  const G = globalThis as unknown as Record<string, unknown>;
  const prev = G.matchMedia;
  G.matchMedia = () => ({ matches: true });
  try {
    fn();
  } finally {
    G.matchMedia = prev;
  }
}

describe("MorphIcon (custom element reduced motion)", () => {
  test("default 'never': icon changes fly even with the OS setting on", () => {
    withOsReducedMotion(() => {
      const m = mountIcon({ icon: ICONS.menu });
      m.update({ icon: ICONS.x });
      expect(pendingFrames()).toBeGreaterThan(0);
      settleAll();
      expect(m.d()).toBe(ICONS.x);
    });
  });

  test("'user' honors the OS setting: icon changes jump, zero frames", () => {
    withOsReducedMotion(() => {
      const m = mountIcon({ icon: ICONS.menu, reducedMotion: "user" });
      m.update({ icon: ICONS.x });
      expect(m.d()).toBe(ICONS.x);
      expect(pendingFrames()).toBe(0);
    });
  });

  test("the policy is live: 'always' jumps mid-life, back to 'never' flies", () => {
    const m = mountIcon({ icon: ICONS.menu });
    // No batching here: assign the policy first, then the icon — the element
    // analog of "policy and icon change in the same update".
    m.update({ reducedMotion: "always", icon: ICONS.x });
    expect(m.d()).toBe(ICONS.x);
    expect(pendingFrames()).toBe(0);
    m.update({ reducedMotion: "never", icon: ICONS.check });
    expect(pendingFrames()).toBeGreaterThan(0);
    settleAll();
    expect(m.d()).toBe(ICONS.check);
  });
});
