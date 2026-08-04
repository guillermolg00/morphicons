/* Snippet generators for the showcase (app/showcase): every recipe as a
   ready-to-paste component in React, Vue or Svelte, parameterized by the
   sidebar controls. Lucide snippets import icon data from the `lucide`
   package; Heroicons and Tabler ship as raw `d` strings, which morphicons
   consumes directly — no adapter layer, so the copied code is exactly what
   the library supports. Button/Input imports point at the shadcn ports
   (shadcn/ui, shadcn-vue, shadcn-svelte), whose APIs match on purpose. */

import type { SpringPreset } from "morphicons";
import { byId, dOf, type Lib } from "./icons";

export type Framework = "react" | "vue" | "svelte";

export type RecipeId =
  | "copy"
  | "password"
  | "theme"
  | "player"
  | "validation"
  | "tree";

export interface SnippetOpts {
  lib: Lib;
  framework: Framework;
  spring: SpringPreset;
  strokeWidth: number;
}

export const FRAMEWORK_LABEL: Record<Framework, string> = {
  react: "React",
  vue: "Vue",
  svelte: "Svelte",
};

/* Icon label → the identifier used in every template (Lucide's export name,
   so the same body works for the import and the d-string variants). */
const IDENT: Record<string, string> = {
  copy: "Copy",
  check: "Check",
  x: "X",
  eye: "Eye",
  "eye-off": "EyeOff",
  sun: "Sun",
  moon: "Moon",
  play: "Play",
  pause: "Pause",
  volume: "Volume2",
  "volume-x": "VolumeX",
  folder: "Folder",
  "folder-open": "FolderOpen",
};

const LIB_TITLE: Record<Lib, string> = {
  lucide: "Lucide",
  heroicons: "Heroicons 24/outline",
  tabler: "Tabler Icons outline",
};

/* The icon-data block at the top of a snippet: an import for Lucide, raw
   path data for the packs that publish icons as SVG files. */
function iconBlock(lib: Lib, labels: string[]): string {
  if (lib === "lucide") {
    const names = labels.map((l) => IDENT[l]).sort();
    return `import { ${names.join(", ")} } from "lucide"; // icon data, not components`;
  }
  const consts = labels
    .map((l) => {
      const entry = byId.get(`${lib}:${l}`);
      if (!entry) throw new Error(`showcase icon missing: ${lib}:${l}`);
      return `const ${IDENT[l]} = "${dOf(entry)}";`;
    })
    .join("\n");
  return `/* ${LIB_TITLE[lib]} geometry as raw path data — morphicons takes \`d\` strings as-is. */\n${consts}`;
}

/* Extra MorphIcon props from the sidebar. Stroke 2 is the default, so it is
   only emitted when it differs. */
const jsxProps = (o: SnippetOpts): string =>
  ` spring="${o.spring}"` +
  (o.strokeWidth === 2 ? "" : ` strokeWidth={${o.strokeWidth}}`);

const vueProps = (o: SnippetOpts): string =>
  ` spring="${o.spring}"` +
  (o.strokeWidth === 2 ? "" : ` :stroke-width="${o.strokeWidth}"`);

const indent = (s: string, pad: string): string =>
  s
    .split("\n")
    .map((l) => (l ? pad + l : l))
    .join("\n");

interface Ctx {
  icons: string;
  props: string;
  vProps: string;
}

type Recipe = Record<Framework, (c: Ctx) => string>;

const RECIPES: Record<RecipeId, { labels: string[]; tpl: Recipe }> = {
  copy: {
    labels: ["copy", "check"],
    tpl: {
      react: (c) => `${c.icons}
import { MorphIcon } from "morphicons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Button variant="ghost" size="icon" onClick={copy} aria-label="Copy to clipboard">
      <MorphIcon icon={copied ? Check : Copy} size={16}${c.props} />
    </Button>
  );
}
`,
      vue: (c) => `<script setup lang="ts">
${c.icons}
import { MorphIcon } from "morphicons/vue";
import { ref } from "vue";
import { Button } from "@/components/ui/button";

const props = defineProps<{ text: string }>();
const copied = ref(false);

async function copy() {
  await navigator.clipboard.writeText(props.text);
  copied.value = true;
  setTimeout(() => (copied.value = false), 1500);
}
</script>

<template>
  <Button variant="ghost" size="icon" aria-label="Copy to clipboard" @click="copy">
    <MorphIcon :icon="copied ? Check : Copy" :size="16"${c.vProps} />
  </Button>
</template>
`,
      svelte: (c) => `<script lang="ts">
${indent(c.icons, "  ")}
  import { MorphIcon } from "morphicons/svelte";
  import { Button } from "$lib/components/ui/button";

  let { text }: { text: string } = $props();
  let copied = $state(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }
</script>

<Button variant="ghost" size="icon" aria-label="Copy to clipboard" onclick={copy}>
  <MorphIcon icon={copied ? Check : Copy} size={16}${c.props} />
</Button>
`,
    },
  },

  password: {
    labels: ["eye", "eye-off"],
    tpl: {
      react: (c) => `${c.icons}
import { MorphIcon } from "morphicons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PasswordInput() {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        type={visible ? "text" : "password"}
        placeholder="Password"
        className="pr-10"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute top-1/2 right-1 size-7 -translate-y-1/2"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
      >
        <MorphIcon icon={visible ? EyeOff : Eye} size={16}${c.props} />
      </Button>
    </div>
  );
}
`,
      vue: (c) => `<script setup lang="ts">
${c.icons}
import { MorphIcon } from "morphicons/vue";
import { ref } from "vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const visible = ref(false);
</script>

<template>
  <div class="relative">
    <Input :type="visible ? 'text' : 'password'" placeholder="Password" class="pr-10" />
    <Button
      type="button"
      variant="ghost"
      size="icon"
      class="absolute top-1/2 right-1 size-7 -translate-y-1/2"
      :aria-label="visible ? 'Hide password' : 'Show password'"
      :aria-pressed="visible"
      @click="visible = !visible"
    >
      <MorphIcon :icon="visible ? EyeOff : Eye" :size="16"${c.vProps} />
    </Button>
  </div>
</template>
`,
      svelte: (c) => `<script lang="ts">
${indent(c.icons, "  ")}
  import { MorphIcon } from "morphicons/svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";

  let visible = $state(false);
</script>

<div class="relative">
  <Input type={visible ? "text" : "password"} placeholder="Password" class="pr-10" />
  <Button
    type="button"
    variant="ghost"
    size="icon"
    class="absolute top-1/2 right-1 size-7 -translate-y-1/2"
    aria-label={visible ? "Hide password" : "Show password"}
    aria-pressed={visible}
    onclick={() => (visible = !visible)}
  >
    <MorphIcon icon={visible ? EyeOff : Eye} size={16}${c.props} />
  </Button>
</div>
`,
    },
  },

  theme: {
    labels: ["sun", "moon"],
    tpl: {
      react: (c) => `${c.icons}
import { MorphIcon } from "morphicons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  // Wire this to next-themes or your theme store.
  const [dark, setDark] = useState(false);

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={() => setDark((d) => !d)}
      aria-label="Toggle theme"
      aria-pressed={dark}
    >
      <MorphIcon icon={dark ? Moon : Sun} size={16}${c.props} />
    </Button>
  );
}
`,
      vue: (c) => `<script setup lang="ts">
${c.icons}
import { MorphIcon } from "morphicons/vue";
import { ref } from "vue";
import { Button } from "@/components/ui/button";

// Wire this to your theme store (VueUse useDark, nuxt color-mode…).
const dark = ref(false);
</script>

<template>
  <Button
    variant="outline"
    size="icon"
    aria-label="Toggle theme"
    :aria-pressed="dark"
    @click="dark = !dark"
  >
    <MorphIcon :icon="dark ? Moon : Sun" :size="16"${c.vProps} />
  </Button>
</template>
`,
      svelte: (c) => `<script lang="ts">
${indent(c.icons, "  ")}
  import { MorphIcon } from "morphicons/svelte";
  import { Button } from "$lib/components/ui/button";

  // Wire this to mode-watcher or your theme store.
  let dark = $state(false);
</script>

<Button
  variant="outline"
  size="icon"
  aria-label="Toggle theme"
  aria-pressed={dark}
  onclick={() => (dark = !dark)}
>
  <MorphIcon icon={dark ? Moon : Sun} size={16}${c.props} />
</Button>
`,
    },
  },

  player: {
    labels: ["play", "pause", "volume", "volume-x"],
    tpl: {
      react: (c) => `${c.icons}
import { MorphIcon } from "morphicons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function PlayerControls() {
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);

  return (
    <div className="flex items-center gap-1">
      <Button
        size="icon"
        onClick={() => setPlaying((p) => !p)}
        aria-label={playing ? "Pause" : "Play"}
      >
        <MorphIcon icon={playing ? Pause : Play} size={16}${c.props} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setMuted((m) => !m)}
        aria-label={muted ? "Unmute" : "Mute"}
        aria-pressed={muted}
      >
        <MorphIcon icon={muted ? VolumeX : Volume2} size={16}${c.props} />
      </Button>
    </div>
  );
}
`,
      vue: (c) => `<script setup lang="ts">
${c.icons}
import { MorphIcon } from "morphicons/vue";
import { ref } from "vue";
import { Button } from "@/components/ui/button";

const playing = ref(false);
const muted = ref(false);
</script>

<template>
  <div class="flex items-center gap-1">
    <Button
      size="icon"
      :aria-label="playing ? 'Pause' : 'Play'"
      @click="playing = !playing"
    >
      <MorphIcon :icon="playing ? Pause : Play" :size="16"${c.vProps} />
    </Button>
    <Button
      variant="ghost"
      size="icon"
      :aria-label="muted ? 'Unmute' : 'Mute'"
      :aria-pressed="muted"
      @click="muted = !muted"
    >
      <MorphIcon :icon="muted ? VolumeX : Volume2" :size="16"${c.vProps} />
    </Button>
  </div>
</template>
`,
      svelte: (c) => `<script lang="ts">
${indent(c.icons, "  ")}
  import { MorphIcon } from "morphicons/svelte";
  import { Button } from "$lib/components/ui/button";

  let playing = $state(false);
  let muted = $state(false);
</script>

<div class="flex items-center gap-1">
  <Button
    size="icon"
    aria-label={playing ? "Pause" : "Play"}
    onclick={() => (playing = !playing)}
  >
    <MorphIcon icon={playing ? Pause : Play} size={16}${c.props} />
  </Button>
  <Button
    variant="ghost"
    size="icon"
    aria-label={muted ? "Unmute" : "Mute"}
    aria-pressed={muted}
    onclick={() => (muted = !muted)}
  >
    <MorphIcon icon={muted ? VolumeX : Volume2} size={16}${c.props} />
  </Button>
</div>
`,
    },
  },

  validation: {
    labels: ["check", "x"],
    tpl: {
      react: (c) => `${c.icons}
import { MorphIcon } from "morphicons/react";
import { useState } from "react";
import { Input } from "@/components/ui/input";

const EMAIL = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;

export function EmailField() {
  const [value, setValue] = useState("");

  return (
    <div className="relative">
      <Input
        type="email"
        placeholder="you@example.com"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="pr-10"
      />
      {/* Stays mounted so valid ↔ invalid morphs instead of remounting. */}
      <MorphIcon
        icon={EMAIL.test(value) ? Check : X}
        size={16}
        className={"pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 " + (value ? "" : "opacity-0")}${c.props}
      />
    </div>
  );
}
`,
      vue: (c) => `<script setup lang="ts">
${c.icons}
import { MorphIcon } from "morphicons/vue";
import { ref } from "vue";
import { Input } from "@/components/ui/input";

const EMAIL = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
const value = ref("");
</script>

<template>
  <div class="relative">
    <Input v-model="value" type="email" placeholder="you@example.com" class="pr-10" />
    <!-- Stays mounted so valid ↔ invalid morphs instead of remounting. -->
    <MorphIcon
      :icon="EMAIL.test(value) ? Check : X"
      :size="16"
      class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2"
      :class="{ 'opacity-0': !value }"${c.vProps}
    />
  </div>
</template>
`,
      svelte: (c) => `<script lang="ts">
${indent(c.icons, "  ")}
  import { MorphIcon } from "morphicons/svelte";
  import { Input } from "$lib/components/ui/input";

  const EMAIL = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
  let value = $state("");
</script>

<div class="relative">
  <Input bind:value type="email" placeholder="you@example.com" class="pr-10" />
  <!-- Stays mounted so valid ↔ invalid morphs instead of remounting. -->
  <MorphIcon
    icon={EMAIL.test(value) ? Check : X}
    size={16}
    class={"pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 " + (value ? "" : "opacity-0")}${c.props}
  />
</div>
`,
    },
  },

  tree: {
    labels: ["folder", "folder-open"],
    tpl: {
      react: (c) => `${c.icons}
import { MorphIcon } from "morphicons/react";
import { useState, type ReactNode } from "react";

export function TreeFolder({ name, children }: { name: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
      >
        <MorphIcon icon={open ? FolderOpen : Folder} size={16}${c.props} />
        {name}
      </button>
      {open && <div className="ml-4 border-l pl-3">{children}</div>}
    </div>
  );
}
`,
      vue: (c) => `<script setup lang="ts">
${c.icons}
import { MorphIcon } from "morphicons/vue";
import { ref } from "vue";

defineProps<{ name: string }>();
const open = ref(false);
</script>

<template>
  <div>
    <button
      type="button"
      class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
      :aria-expanded="open"
      @click="open = !open"
    >
      <MorphIcon :icon="open ? FolderOpen : Folder" :size="16"${c.vProps} />
      {{ name }}
    </button>
    <div v-if="open" class="ml-4 border-l pl-3">
      <slot />
    </div>
  </div>
</template>
`,
      svelte: (c) => `<script lang="ts">
${indent(c.icons, "  ")}
  import { MorphIcon } from "morphicons/svelte";
  import type { Snippet } from "svelte";

  let { name, children }: { name: string; children?: Snippet } = $props();
  let open = $state(false);
</script>

<div>
  <button
    type="button"
    onclick={() => (open = !open)}
    aria-expanded={open}
    class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
  >
    <MorphIcon icon={open ? FolderOpen : Folder} size={16}${c.props} />
    {name}
  </button>
  {#if open}
    <div class="ml-4 border-l pl-3">{@render children?.()}</div>
  {/if}
</div>
`,
    },
  },
};

export function snippet(id: RecipeId, o: SnippetOpts): string {
  const { labels, tpl } = RECIPES[id];
  return tpl[o.framework]({
    icons: iconBlock(o.lib, labels),
    props: jsxProps(o),
    vProps: vueProps(o),
  });
}
