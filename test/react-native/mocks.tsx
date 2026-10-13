/* Module mocks for the React Native binding suites: react-native-svg and
   react-native don't run outside a native host, so both are replaced via
   mock.module BEFORE the binding is imported (test files import this module
   statically and load the binding with a dynamic import). The mocks are
   faithful where it matters: Path is a class component whose ref exposes
   setNativeProps writing straight to the rendered element (d and paint) —
   the exact contract the binding's PathEl shim relies on — and
   AccessibilityInfo is
   fully controllable (initial query + reduceMotionChanged subscription). */

import { mock } from "bun:test";
import { Component, createElement, type ReactNode } from "react";
import { registerDom } from "../client-dom";

registerDom();

/** Reduced-motion switchboard: tests flip it and fire the subscription. */
export const rm = {
  enabled: false,
  queries: 0,
  subscriptions: 0,
  listener: null as ((value: boolean) => void) | null,
};

/** Flips the OS setting and notifies the binding like the bridge would. */
export function fireReduceMotion(value: boolean): void {
  rm.enabled = value;
  rm.listener?.(value);
}

interface MockPathProps {
  d?: string;
  fill?: string;
  stroke?: string;
  fillRule?: string;
}

// Native prop → the attribute the suites assert (react-dom spelling).
const ATTR: Record<string, string> = { fillRule: "fill-rule" };
const PAINT = ["fill", "stroke", "fillRule"] as const;

class MockPath extends Component<MockPathProps> {
  el: Element | null = null;

  setNativeProps(props: Record<string, unknown>): void {
    for (const key of Object.keys(props)) this.write(key, props[key]);
  }

  write(key: string, value: unknown): void {
    if (value === undefined) this.el?.removeAttribute(ATTR[key] ?? key);
    else this.el?.setAttribute(ATTR[key] ?? key, String(value));
  }

  /* Fabric fidelity (issue #25): on the New Architecture every commit rebuilds
     the native path from React's props, so whatever setNativeProps wrote is
     dropped unless the declarative value matches. react-dom instead diffs the
     prop and skips an unchanged `d`, which is why the reset never shows up on
     the web — the reconciliation is replayed here on every update. */
  override componentDidUpdate(): void {
    this.el?.setAttribute("d", String(this.props.d ?? ""));
    // paint too: an undeclared prop resets to the default (inherit)
    for (const key of PAINT) this.write(key, this.props[key]);
  }

  override render(): ReactNode {
    return createElement("path", {
      d: this.props.d,
      fill: this.props.fill,
      stroke: this.props.stroke,
      "fill-rule": this.props.fillRule,
      ref: (el: Element | null) => {
        this.el = el;
      },
    });
  }
}

/* Svg renders a real <svg> so the suites assert attributes exactly like the
   web ones. RN-only props react-dom would warn about are dropped. */
function MockSvg(props: Record<string, unknown>): ReactNode {
  const { children, hitSlop: _hitSlop, testID, ...rest } = props;
  return createElement("svg", { ...rest, "data-testid": testID }, children as ReactNode);
}

const AccessibilityInfo = {
  isReduceMotionEnabled: (): Promise<boolean> => {
    rm.queries++;
    return Promise.resolve(rm.enabled);
  },
  addEventListener: (event: string, cb: (value: boolean) => void) => {
    rm.subscriptions++;
    if (event === "reduceMotionChanged") rm.listener = cb;
    return {
      remove: () => {
        if (rm.listener === cb) rm.listener = null;
      },
    };
  },
};

mock.module("react-native-svg", () => ({ default: MockSvg, Path: MockPath }));
mock.module("react-native", () => ({ AccessibilityInfo }));
