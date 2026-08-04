/* Shared harness for the BINDING client suites: happy-dom globals plus the
   same hand-pumped rAF fake as test/dom.test.ts, so frames advance
   deterministically. happy-dom is preloaded for the WHOLE run (bunfig.toml →
   register-client-dom.ts) because vue captures `document` at import time.
   The dom driver suite stays fake-only by design — it never hands the driver
   a real element, which is what keeps src/dom honest about reading globals
   at runtime; the bindings mount real components because their bugs live in
   the wiring between the framework lifecycle and the driver. */

import { GlobalRegistrator } from "@happy-dom/global-registrator";

type Cb = (ts: number) => void;

const pending = new Map<number, Cb>();
let now = 0;
let nextId = 1;

/** Installs happy-dom on globalThis (idempotent) and (re)installs the
 *  deterministic rAF on top — mount suites call it at module scope to own
 *  the frame pump even if another suite replaced it. */
export function registerDom(): void {
  if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();
  const G = globalThis as unknown as Record<string, unknown>;
  G.requestAnimationFrame = (cb: Cb): number => {
    const id = nextId++;
    pending.set(id, cb);
    return id;
  };
  G.cancelAnimationFrame = (id: number): void => {
    pending.delete(id);
  };
}

/** Live rAF callbacks — 0 means the singleton scheduler is idle. */
export const pendingFrames = (): number => pending.size;

/** Advances the clock by `ms` and fires the pending frames. */
export const frame = (ms: number): void => {
  now += ms;
  const cbs = [...pending.values()];
  pending.clear();
  for (const cb of cbs) cb(now);
};

/** Pumps 16 ms frames until the scheduler stops. Returns how many. */
export const settleAll = (maxFrames = 2000): number => {
  let n = 0;
  while (pending.size > 0 && n < maxFrames) {
    frame(16);
    n++;
  }
  return n;
};
