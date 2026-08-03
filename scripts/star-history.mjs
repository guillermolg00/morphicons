#!/usr/bin/env bun
/* Generates assets/star-history-{light,dark}.svg from the repo's REAL
   stargazer timeline (GitHub API, `starred_at` per gazer).

   Why self-hosted: third-party chart services (star-history.com,
   starchart.cc) rate-limit their shared GitHub tokens and answer 503, and
   GitHub's camo proxy caches that failure — the README ends up showing a
   broken image. An SVG committed in this repo always loads.

   Zero dependencies, like the library. Auth: GITHUB_TOKEN / GH_TOKEN, or
   the `gh` CLI's token as a fallback.

   Usage: bun run stars */

import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const REPO = process.env.STAR_REPO ?? "guillermolg00/morphicons";
const OUT = new URL("../assets/", import.meta.url);

// Palette mirrored from website/app/globals.css (the site's design tokens).
const THEMES = {
  light: {
    canvas: "#ffffff",
    ink: "#171717",
    body: "#4d4d4d",
    mute: "#888888",
    hairline: "#ebebeb",
    accent: "#0070f3",
  },
  dark: {
    canvas: "#101010",
    ink: "#ededed",
    body: "#a1a1a1",
    mute: "#7d7d7d",
    hairline: "#262626",
    accent: "#52a8ff",
  },
};

const W = 840;
const H = 340;
const PAD = { top: 74, right: 28, bottom: 44, left: 58 };
const PLOT = {
  x0: PAD.left,
  x1: W - PAD.right,
  y0: PAD.top,
  y1: H - PAD.bottom,
};

function token() {
  const env = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (env) return env;
  try {
    return execSync("gh auth token", { encoding: "utf8" }).trim();
  } catch {
    throw new Error("No GitHub token: set GITHUB_TOKEN or run `gh auth login`.");
  }
}

/** Every star's timestamp, oldest first. */
async function fetchStars() {
  const headers = {
    // star+json is what turns each gazer into { starred_at, user }.
    accept: "application/vnd.github.star+json",
    authorization: `Bearer ${token()}`,
    "user-agent": "morphicons-star-history",
  };
  const dates = [];
  for (let page = 1; page <= 40; page++) {
    const url = `https://api.github.com/repos/${REPO}/stargazers?per_page=100&page=${page}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
    const batch = await res.json();
    if (batch.length === 0) break;
    for (const s of batch) dates.push(new Date(s.starred_at).getTime());
    if (batch.length < 100) break;
  }
  return dates.sort((a, b) => a - b);
}

/** Round axis maximum to a 1/2/2.5/5/10 step so the ticks read cleanly. */
function niceAxis(max, targetTicks = 5) {
  const raw = max / targetTicks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v));
  return { top, ticks };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Short label whose precision follows the window's span. */
function labelFor(ms, spanDays) {
  const d = new Date(ms);
  const day = `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  if (spanDays <= 4) {
    const hh = String(d.getUTCHours()).padStart(2, "0");
    return `${day}, ${hh}:00`;
  }
  if (spanDays <= 400) return day;
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const r1 = (n) => Math.round(n * 10) / 10;

function buildSvg(dates, theme, palette) {
  const c = palette;
  const total = dates.length;
  const t0 = dates[0];
  const t1 = dates[total - 1];
  const span = Math.max(t1 - t0, 1);
  const spanDays = span / 86_400_000;
  const { top: yTop, ticks: yTicks } = niceAxis(total);

  const sx = (ms) => PLOT.x0 + ((ms - t0) / span) * (PLOT.x1 - PLOT.x0);
  const sy = (v) => PLOT.y1 - (v / yTop) * (PLOT.y1 - PLOT.y0);

  // One point per star (cumulative), plus the origin so the curve starts at 0.
  const pts = [[sx(t0), sy(0)]];
  for (let i = 0; i < total; i++) pts.push([sx(dates[i]), sy(i + 1)]);

  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${r1(x)} ${r1(y)}`).join("");
  const area = `${line}L${r1(pts[pts.length - 1][0])} ${r1(PLOT.y1)}L${r1(pts[0][0])} ${r1(PLOT.y1)}Z`;

  const grid = yTicks
    .map((v) => {
      const y = r1(sy(v));
      return (
        `<line x1="${PLOT.x0}" y1="${y}" x2="${PLOT.x1}" y2="${y}" stroke="${c.hairline}" stroke-width="1"/>` +
        `<text x="${PLOT.x0 - 12}" y="${y + 4}" text-anchor="end" class="tick">${v}</text>`
      );
    })
    .join("");

  const xTickCount = 4;
  const xAxis = Array.from({ length: xTickCount + 1 }, (_, i) => {
    const ms = t0 + (span * i) / xTickCount;
    const x = r1(sx(ms));
    const anchor = i === 0 ? "start" : i === xTickCount ? "end" : "middle";
    return `<text x="${x}" y="${PLOT.y1 + 26}" text-anchor="${anchor}" class="tick">${labelFor(ms, spanDays)}</text>`;
  }).join("");

  const [lastX, lastY] = pts[pts.length - 1];

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(REPO)} star history: ${total} stars">
  <title>${esc(REPO)} — ${total} stars over time</title>
  <defs>
    <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${c.accent}" stop-opacity="0.26"/>
      <stop offset="100%" stop-color="${c.accent}" stop-opacity="0"/>
    </linearGradient>
    <style>
      .t{font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Helvetica,Arial,sans-serif}
      .tick{font-size:11px;fill:${c.mute}}
      .count{font-size:34px;font-weight:600;fill:${c.ink};letter-spacing:-0.02em}
      .unit{font-size:13px;fill:${c.body}}
      .meta{font-size:11.5px;fill:${c.mute};letter-spacing:0.02em}
      /* Deliberately static. An entrance animation renders as a BLANK chart
         in anything that snapshots at t=0 (QuickLook, npm's README preview,
         social cards) — a README image must always be visible. */
      .line{fill:none;stroke:${c.accent};stroke-width:2.25;stroke-linecap:round;stroke-linejoin:round}
    </style>
  </defs>
  <rect width="${W}" height="${H}" rx="10" fill="${c.canvas}"/>
  <g class="t">
    <g class="head">
      <text x="${PAD.left - 12}" y="46" class="count">${total}</text>
      <text x="${PAD.left - 12 + String(total).length * 21 + 10}" y="46" class="unit">stars</text>
      <text x="${PLOT.x1}" y="46" text-anchor="end" class="meta">${esc(REPO)}</text>
    </g>
    ${grid}
    <path class="area" d="${area}" fill="url(#fill)"/>
    <path class="line" d="${line}"/>
    <g class="tip">
      <circle cx="${r1(lastX)}" cy="${r1(lastY)}" r="7" fill="${c.accent}" opacity="0.18"/>
      <circle cx="${r1(lastX)}" cy="${r1(lastY)}" r="3.5" fill="${c.accent}" stroke="${c.canvas}" stroke-width="2"/>
    </g>
    ${xAxis}
  </g>
</svg>
`;
}

const dates = await fetchStars();
if (dates.length === 0) throw new Error(`${REPO} has no stargazers yet.`);

for (const [theme, palette] of Object.entries(THEMES)) {
  const file = new URL(`star-history-${theme}.svg`, OUT);
  writeFileSync(file, buildSvg(dates, theme, palette));
  console.log(`assets/star-history-${theme}.svg — ${dates.length} stars`);
}
