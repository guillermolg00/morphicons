/* The layout-effect shim, pinned per runtime (raised in the review of issue
   #25's fix). The binding's pre-paint work — the driver's birth and the Fabric
   repair — has to run INSIDE the commit on a device, and a real React Native
   runtime has no `document` there: probing for it would silently demote both
   to passive effects that land after the `d` React just reconciled is already
   on screen. `window` is the probe that tells a server apart from a device.
   Each case re-imports the module with one runtime's globals (the query suffix
   makes a fresh specifier, so the ternary is evaluated again). */

import { describe, expect, test } from "bun:test";
import { useEffect, useLayoutEffect } from "react";
import { registerDom } from "../client-dom";

registerDom();

const g = globalThis as unknown as Record<string, unknown>;
const realWindow = g.window;
const realDocument = g.document;

/** The shim as the module resolves it with the given globals present. */
async function shimUnder(
  env: { window: boolean; document: boolean },
  tag: string,
): Promise<unknown> {
  g.window = env.window ? (realWindow ?? {}) : undefined;
  g.document = env.document ? (realDocument ?? {}) : undefined;
  try {
    const mod = await import(`../../src/react-native/iso-layout-effect?${tag}`);
    return mod.useIsoLayoutEffect;
  } finally {
    g.window = realWindow;
    g.document = realDocument;
  }
}

describe("useIsoLayoutEffect (React Native)", () => {
  test("on a device (window, no document): a real layout effect", async () => {
    expect(await shimUnder({ window: true, document: false }, "device")).toBe(
      useLayoutEffect,
    );
  });

  test("in a browser (window + document): a real layout effect", async () => {
    expect(await shimUnder({ window: true, document: true }, "browser")).toBe(
      useLayoutEffect,
    );
  });

  test("on the server (neither): the passive effect, no useLayoutEffect warning", async () => {
    expect(await shimUnder({ window: false, document: false }, "server")).toBe(useEffect);
  });
});
