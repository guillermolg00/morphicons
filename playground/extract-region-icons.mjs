/* Extracts the regions playground's icons from the @iconify-json sets
   installed as devDeps (real upstream data, not hand-copied). Each entry is
   the full <svg viewBox> markup, exactly what svgToIcon receives in an app.

   Variants per library, by construction model:
   - stroke: centerlines with a stroke (Lucide, Tabler, Heroicons outline, Iconoir)
   - line:   look like strokes but are FILL-drawn outlines (Material outlined,
             Phosphor regular, Remix line, MDI outline, Bootstrap, MingCute line)
   - solid:  filled silhouettes (Material, Phosphor fill, Remix fill, MDI,
             Heroicons solid, Tabler filled, Bootstrap fill, MingCute fill)
   - duotone: Phosphor duotone (a 20%-opacity layer under the line)

   Regenerate:  bun playground/extract-region-icons.mjs */

import { readFileSync, writeFileSync } from "node:fs";

const CONCEPTS = [
  "menu",
  "x",
  "check",
  "plus",
  "play",
  "pause",
  "heart",
  "home",
  "bell",
  "settings",
  "search",
  "star",
  "user",
  "trash",
  "sun",
  "moon",
  "camera",
  "lock",
  "arrow-right",
  "circle",
];

// library → variant → concept → candidate names (first existing wins)
const MAP = {
  lucide: {
    stroke: {
      menu: "menu",
      x: "x",
      check: "check",
      plus: "plus",
      play: "play",
      pause: "pause",
      heart: "heart",
      home: "house",
      bell: "bell",
      settings: "settings",
      search: "search",
      star: "star",
      user: "user",
      trash: "trash-2",
      sun: "sun",
      moon: "moon",
      camera: "camera",
      lock: "lock",
      "arrow-right": "arrow-right",
      circle: "circle",
    },
  },
  tabler: {
    stroke: {
      menu: "menu-2",
      x: "x",
      check: "check",
      plus: "plus",
      play: "player-play",
      pause: "player-pause",
      heart: "heart",
      home: "home",
      bell: "bell",
      settings: "settings",
      search: "search",
      star: "star",
      user: "user",
      trash: "trash",
      sun: "sun",
      moon: "moon",
      camera: "camera",
      lock: "lock",
      "arrow-right": "arrow-right",
      circle: "circle",
    },
    solid: {
      play: "player-play-filled",
      pause: "player-pause-filled",
      heart: "heart-filled",
      home: "home-filled",
      bell: "bell-filled",
      settings: "settings-filled",
      star: "star-filled",
      user: "user-filled",
      trash: "trash-filled",
      sun: "sun-filled",
      moon: "moon-filled",
      camera: "camera-filled",
      lock: "lock-filled",
      circle: "circle-filled",
    },
  },
  heroicons: {
    stroke: {
      menu: "bars-3",
      x: "x-mark",
      check: "check",
      plus: "plus",
      play: "play",
      pause: "pause",
      heart: "heart",
      home: "home",
      bell: "bell",
      settings: "cog-6-tooth",
      search: "magnifying-glass",
      star: "star",
      user: "user",
      trash: "trash",
      sun: "sun",
      moon: "moon",
      camera: "camera",
      lock: "lock-closed",
      "arrow-right": "arrow-right",
    },
    solid: {
      menu: "bars-3-solid",
      x: "x-mark-solid",
      check: "check-solid",
      plus: "plus-solid",
      play: "play-solid",
      pause: "pause-solid",
      heart: "heart-solid",
      home: "home-solid",
      bell: "bell-solid",
      settings: "cog-6-tooth-solid",
      search: "magnifying-glass-solid",
      star: "star-solid",
      user: "user-solid",
      trash: "trash-solid",
      sun: "sun-solid",
      moon: "moon-solid",
      camera: "camera-solid",
      lock: "lock-closed-solid",
      "arrow-right": "arrow-right-solid",
    },
  },
  iconoir: {
    stroke: {
      menu: "menu",
      x: "xmark",
      check: "check",
      plus: "plus",
      play: "play",
      pause: "pause",
      heart: "heart",
      home: "home",
      bell: "bell",
      settings: "settings",
      search: "search",
      star: "star",
      user: "user",
      trash: "trash",
      sun: "sun-light",
      moon: "half-moon",
      camera: "camera",
      lock: "lock",
      "arrow-right": "arrow-right",
      circle: "circle",
    },
  },
  "material-symbols": {
    line: {
      menu: "menu",
      x: "close",
      check: "check",
      plus: "add",
      play: "play-arrow-outline",
      pause: "pause-outline",
      heart: "favorite-outline",
      home: "home-outline",
      bell: "notifications-outline",
      settings: "settings-outline",
      search: "search",
      star: "star-outline",
      user: "person-outline",
      trash: "delete-outline",
      sun: "light-mode-outline",
      moon: "dark-mode-outline",
      camera: "photo-camera-outline",
      lock: "lock-outline",
      "arrow-right": "arrow-forward",
      circle: "circle-outline",
    },
    solid: {
      play: "play-arrow",
      pause: "pause",
      heart: "favorite",
      home: "home",
      bell: "notifications",
      settings: "settings",
      star: "star",
      user: "person",
      trash: "delete",
      sun: "light-mode",
      moon: "dark-mode",
      camera: "photo-camera",
      lock: "lock",
      circle: "circle",
    },
  },
  ph: {
    line: {
      menu: "list",
      x: "x",
      check: "check",
      plus: "plus",
      play: "play",
      pause: "pause",
      heart: "heart",
      home: "house",
      bell: "bell",
      settings: "gear",
      search: "magnifying-glass",
      star: "star",
      user: "user",
      trash: "trash",
      sun: "sun",
      moon: "moon",
      camera: "camera",
      lock: "lock",
      "arrow-right": "arrow-right",
      circle: "circle",
    },
    solid: {
      play: "play-fill",
      pause: "pause-fill",
      heart: "heart-fill",
      home: "house-fill",
      bell: "bell-fill",
      settings: "gear-fill",
      star: "star-fill",
      user: "user-fill",
      trash: "trash-fill",
      sun: "sun-fill",
      moon: "moon-fill",
      camera: "camera-fill",
      lock: "lock-fill",
      circle: "circle-fill",
    },
    duotone: {
      heart: "heart-duotone",
      home: "house-duotone",
      bell: "bell-duotone",
      settings: "gear-duotone",
      star: "star-duotone",
      sun: "sun-duotone",
      lock: "lock-duotone",
    },
  },
  ri: {
    line: {
      menu: "menu-line",
      x: "close-line",
      check: "check-line",
      plus: "add-line",
      play: "play-line",
      pause: "pause-line",
      heart: "heart-line",
      home: "home-line",
      bell: "notification-line",
      settings: "settings-line",
      search: "search-line",
      star: "star-line",
      user: "user-line",
      trash: "delete-bin-line",
      sun: "sun-line",
      moon: "moon-line",
      camera: "camera-line",
      lock: "lock-line",
      "arrow-right": "arrow-right-line",
      circle: "checkbox-blank-circle-line",
    },
    solid: {
      play: "play-fill",
      pause: "pause-fill",
      heart: "heart-fill",
      home: "home-fill",
      bell: "notification-fill",
      settings: "settings-fill",
      star: "star-fill",
      user: "user-fill",
      trash: "delete-bin-fill",
      sun: "sun-fill",
      moon: "moon-fill",
      camera: "camera-fill",
      lock: "lock-fill",
      circle: "checkbox-blank-circle-fill",
    },
  },
  mdi: {
    line: {
      menu: "menu",
      x: "close",
      check: "check",
      plus: "plus",
      play: "play-outline",
      pause: "pause",
      heart: "heart-outline",
      home: "home-outline",
      bell: "bell-outline",
      settings: "cog-outline",
      search: "magnify",
      star: "star-outline",
      user: "account-outline",
      trash: "delete-outline",
      sun: "white-balance-sunny",
      moon: "weather-night",
      camera: "camera-outline",
      lock: "lock-outline",
      "arrow-right": "arrow-right",
      circle: "circle-outline",
    },
    solid: {
      play: "play",
      heart: "heart",
      home: "home",
      bell: "bell",
      settings: "cog",
      star: "star",
      user: "account",
      trash: "delete",
      camera: "camera",
      lock: "lock",
      circle: "circle",
    },
  },
  bi: {
    line: {
      menu: "list",
      x: "x-lg",
      check: "check-lg",
      plus: "plus-lg",
      play: "play",
      pause: "pause",
      heart: "heart",
      home: "house",
      bell: "bell",
      settings: "gear",
      search: "search",
      star: "star",
      user: "person",
      trash: "trash",
      sun: "sun",
      moon: "moon",
      camera: "camera",
      lock: "lock",
      "arrow-right": "arrow-right",
      circle: "circle",
    },
    solid: {
      play: "play-fill",
      pause: "pause-fill",
      heart: "heart-fill",
      home: "house-fill",
      bell: "bell-fill",
      settings: "gear-fill",
      star: "star-fill",
      user: "person-fill",
      trash: "trash-fill",
      sun: "sun-fill",
      moon: "moon-fill",
      camera: "camera-fill",
      lock: "lock-fill",
      circle: "circle-fill",
    },
  },
  mingcute: {
    line: {
      menu: "menu-line",
      x: "close-line",
      check: "check-line",
      plus: "add-line",
      play: "play-line",
      pause: "pause-line",
      heart: "heart-line",
      home: "home-4-line",
      bell: "notification-line",
      settings: "settings-3-line",
      search: "search-line",
      star: "star-line",
      user: "user-3-line",
      trash: "delete-2-line",
      sun: "sun-line",
      moon: "moon-line",
      camera: "camera-line",
      lock: "lock-line",
      "arrow-right": "arrow-right-line",
    },
    solid: {
      play: "play-fill",
      pause: "pause-fill",
      heart: "heart-fill",
      home: "home-4-fill",
      bell: "notification-fill",
      settings: "settings-3-fill",
      star: "star-fill",
      user: "user-3-fill",
      trash: "delete-2-fill",
      sun: "sun-fill",
      moon: "moon-fill",
      camera: "camera-fill",
      lock: "lock-fill",
    },
  },
};

const LABEL = {
  lucide: "Lucide",
  tabler: "Tabler",
  heroicons: "Heroicons",
  iconoir: "Iconoir",
  "material-symbols": "Material Symbols",
  ph: "Phosphor",
  ri: "Remix",
  mdi: "MDI",
  bi: "Bootstrap",
  mingcute: "MingCute",
};

const out = {};
const missing = [];
let count = 0;
for (const [lib, variants] of Object.entries(MAP)) {
  const set = JSON.parse(
    readFileSync(`node_modules/@iconify-json/${lib}/icons.json`, "utf8"),
  );
  const version = JSON.parse(
    readFileSync(`node_modules/@iconify-json/${lib}/package.json`, "utf8"),
  ).version;
  const resolve = (name) => {
    let ic = set.icons[name];
    let n = name;
    const seen = new Set();
    while (!ic && set.aliases?.[n] && !seen.has(n)) {
      seen.add(n);
      n = set.aliases[n].parent;
      ic = set.icons[n];
    }
    return ic;
  };
  for (const [variant, names] of Object.entries(variants)) {
    const icons = {};
    for (const c of CONCEPTS) {
      const name = names[c];
      if (!name) continue;
      const ic = resolve(name);
      if (!ic) {
        missing.push(`${lib}:${name}`);
        continue;
      }
      const w = ic.width ?? set.width ?? 16;
      const h = ic.height ?? set.height ?? 16;
      icons[c] = { name, svg: `<svg viewBox="0 0 ${w} ${h}">${ic.body}</svg>` };
      count++;
    }
    out[`${lib}/${variant}`] = { lib, label: LABEL[lib], variant, version, icons };
  }
}

const header = `/* GENERATED by playground/extract-region-icons.mjs from @iconify-json/*
   (each set keeps its upstream license: ISC, MIT, Apache-2.0, OFL…).
   Do not edit by hand. */\n\n`;
writeFileSync(
  "playground/vendor-regions.ts",
  `${header}export const CONCEPTS = ${JSON.stringify(CONCEPTS)} as const;\n\nexport const SETS: Record<string, { lib: string; label: string; variant: "stroke" | "line" | "solid" | "duotone"; version: string; icons: Record<string, { name: string; svg: string }> }> = ${JSON.stringify(out, null, 1)};\n`,
);
console.log(`${count} icons in ${Object.keys(out).length} sets`);
if (missing.length) console.log("missing (skipped):", missing.join(", "));
