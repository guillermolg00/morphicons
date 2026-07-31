/* Parser for the `d` attribute (SVG path data). Resolves relative commands
   and shorthands (H/V → L, S/T → C/Q with control-point reflection) and
   returns raw subpaths with absolute commands. Supports implicit repetition,
   extra pairs after M (implicit lineto), packed arc flags and scientific
   notation. Conversion to cubics lives in normalize.ts. */

/** Raw absolute segment (shorthands already resolved), as a labeled tuple —
 *  compact in the bundle (no object keys the minifier can't mangle). */
export type RawSeg =
  | readonly ["L", x: number, y: number]
  | readonly ["C", x1: number, y1: number, x2: number, y2: number, x: number, y: number]
  | readonly ["Q", x1: number, y1: number, x: number, y: number]
  | readonly [
      "A",
      rx: number,
      ry: number,
      rotDeg: number,
      large: 0 | 1,
      sweep: 0 | 1,
      x: number,
      y: number,
    ];

export interface RawSubpath {
  x0: number;
  y0: number;
  segs: RawSeg[];
  closed: boolean;
}

const COMMANDS = "MmLlHhVvCcSsQqTtAaZz";

export function parsePath(d: string): RawSubpath[] {
  const subs: RawSubpath[] = [];
  const n = d.length;
  let i = 0;
  let cx = 0; // current point
  let cy = 0;
  let sx = 0; // start of the current subpath
  let sy = 0;
  let cur: RawSubpath | null = null;
  let cmd = "";
  let px = 0; // last control point (S/T reflection)
  let py = 0;
  let prev: "C" | "Q" | "" = "";
  let started = false; // the first command must be M/m

  const err = (msg: string): never => {
    throw new Error(`morphicons: ${msg} at d[${i}]`);
  };

  const isDigit = (c: number) => c >= 48 && c <= 57;

  const skip = () => {
    while (i < n) {
      const c = d.charCodeAt(i);
      if (c === 32 || c === 9 || c === 10 || c === 13 || c === 12 || c === 44) i++;
      else break;
    }
  };

  const num = (): number => {
    skip();
    const start = i;
    if (i < n && (d[i] === "+" || d[i] === "-")) i++;
    let dig = false;
    while (i < n && isDigit(d.charCodeAt(i))) {
      i++;
      dig = true;
    }
    if (i < n && d[i] === ".") {
      i++;
      while (i < n && isDigit(d.charCodeAt(i))) {
        i++;
        dig = true;
      }
    }
    if (!dig) err("expected number");
    if (i < n && (d[i] === "e" || d[i] === "E")) {
      const save = i;
      i++;
      if (i < n && (d[i] === "+" || d[i] === "-")) i++;
      let ed = false;
      while (i < n && isDigit(d.charCodeAt(i))) {
        i++;
        ed = true;
      }
      if (!ed) i = save; // dangling "e": not an exponent
    }
    return Number(d.slice(start, i));
  };

  // Arc flag: a single 0|1 character; accepts the packed form "011 1".
  const flag = (): 0 | 1 => {
    skip();
    const c = d[i];
    if (c === "0" || c === "1") {
      i++;
      return c === "1" ? 1 : 0;
    }
    return err("expected arc flag (0|1)");
  };

  // Subpath in progress; after Z, a drawing command opens a new one at (sx, sy).
  const open = (): RawSubpath => {
    if (!started) err("path must start with M/m");
    if (!cur) {
      cur = { x0: cx, y0: cy, segs: [], closed: false };
      subs.push(cur);
    }
    return cur;
  };

  // Relatives: nx/ny add the current point, which is not updated until the
  // command finishes — all pairs of a relative C/S/Q refer to the same origin.
  let rel = false;
  const nx = () => num() + (rel ? cx : 0);
  const ny = () => num() + (rel ? cy : 0);

  while (true) {
    skip();
    if (i >= n) break;
    const ch = d[i] as string;
    if (COMMANDS.includes(ch)) {
      cmd = ch;
      i++;
    } else if (cmd === "") {
      err("path must start with M/m");
    } else if (cmd === "M") {
      cmd = "L"; // extra pairs after M → implicit lineto
    } else if (cmd === "m") {
      cmd = "l";
    } else if (cmd === "Z" || cmd === "z") {
      err("stray data after Z");
    }
    rel = cmd >= "a";

    switch (rel ? cmd.toUpperCase() : cmd) {
      case "M": {
        started = true;
        const x = nx();
        const y = ny();
        cx = x;
        cy = y;
        sx = x;
        sy = y;
        cur = { x0: x, y0: y, segs: [], closed: false };
        subs.push(cur);
        prev = "";
        break;
      }
      case "L": {
        const x = nx();
        const y = ny();
        open().segs.push(["L", x, y]);
        cx = x;
        cy = y;
        prev = "";
        break;
      }
      case "H": {
        const x = nx();
        open().segs.push(["L", x, cy]);
        cx = x;
        prev = "";
        break;
      }
      case "V": {
        const y = ny();
        open().segs.push(["L", cx, y]);
        cy = y;
        prev = "";
        break;
      }
      case "C":
      case "S": {
        let x1: number;
        let y1: number;
        if (cmd === "C" || cmd === "c") {
          x1 = nx();
          y1 = ny();
        } else {
          x1 = prev === "C" ? 2 * cx - px : cx; // reflect previous control point
          y1 = prev === "C" ? 2 * cy - py : cy;
        }
        const x2 = nx();
        const y2 = ny();
        const x = nx();
        const y = ny();
        open().segs.push(["C", x1, y1, x2, y2, x, y]);
        px = x2;
        py = y2;
        cx = x;
        cy = y;
        prev = "C";
        break;
      }
      case "Q":
      case "T": {
        let x1: number;
        let y1: number;
        if (cmd === "Q" || cmd === "q") {
          x1 = nx();
          y1 = ny();
        } else {
          x1 = prev === "Q" ? 2 * cx - px : cx;
          y1 = prev === "Q" ? 2 * cy - py : cy;
        }
        const x = nx();
        const y = ny();
        open().segs.push(["Q", x1, y1, x, y]);
        px = x1;
        py = y1;
        cx = x;
        cy = y;
        prev = "Q";
        break;
      }
      case "A": {
        const rx = num();
        const ry = num();
        const rot = num();
        const large = flag();
        const sweep = flag();
        const x = nx();
        const y = ny();
        open().segs.push(["A", rx, ry, rot, large, sweep, x, y]);
        cx = x;
        cy = y;
        prev = "";
        break;
      }
      case "Z": {
        if (cur) {
          cur.closed = true;
          cur = null;
        }
        cx = sx;
        cy = sy;
        prev = "";
        break;
      }
      default:
        err(`unsupported command "${cmd}"`);
    }
  }

  return subs.filter((s) => s.segs.length > 0);
}
