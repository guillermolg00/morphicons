/* Icon registry for the studio: a curated Lucide set imported live from the
   `lucide` data package, plus Heroicons outline extracted from the `heroicons`
   npm package (v2.2.0 MIT) and Tabler icons vendored from the morphicons
   playground (v3.46.0 MIT). All three draw on a 24x24 grid, which is why
   cross-library morphs just work. */

import {
  Activity,
  Aperture,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bell,
  Bookmark,
  Calendar,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  Cloud,
  Code,
  Copy,
  Diamond,
  Download,
  Eye,
  EyeOff,
  Folder,
  Gift,
  GitBranch,
  Globe,
  Heart,
  House,
  Info,
  Layers,
  LayoutGrid,
  List,
  Lock,
  LockOpen,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  Mic,
  Minus,
  Moon,
  Package,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Repeat,
  Search,
  Send,
  Settings,
  Shuffle,
  Square,
  Star,
  Sun,
  Terminal,
  ThumbsUp,
  Trash2,
  TrendingUp,
  Triangle,
  Upload,
  User,
  Users,
  Volume2,
  Wifi,
  X,
  Zap,
} from "lucide";
import type { IconInput, IconNode } from "morphicons";
import { cubicsToPathD, iconToCubics } from "morphicons";

export type Lib = "lucide" | "heroicons" | "tabler";

export interface IconEntry {
  id: string;
  /** Searchable, human name ("arrow-right"). */
  label: string;
  lib: Lib;
  data: IconInput;
}

const LUCIDE: Record<string, IconInput> = {
  menu: Menu,
  x: X,
  check: Check,
  plus: Plus,
  minus: Minus,
  "arrow-right": ArrowRight,
  "arrow-down": ArrowDown,
  "arrow-left": ArrowLeft,
  "arrow-up": ArrowUp,
  "chevron-down": ChevronDown,
  "chevron-right": ChevronRight,
  square: Square,
  circle: Circle,
  diamond: Diamond,
  triangle: Triangle,
  heart: Heart,
  star: Star,
  bell: Bell,
  settings: Settings,
  camera: Camera,
  sun: Sun,
  moon: Moon,
  search: Search,
  play: Play,
  pause: Pause,
  aperture: Aperture,
  house: House,
  zap: Zap,
  copy: Copy,
  download: Download,
  upload: Upload,
  trash: Trash2,
  pencil: Pencil,
  eye: Eye,
  "eye-off": EyeOff,
  lock: Lock,
  "lock-open": LockOpen,
  mail: Mail,
  user: User,
  users: Users,
  calendar: Calendar,
  clock: Clock,
  cloud: Cloud,
  wifi: Wifi,
  bookmark: Bookmark,
  folder: Folder,
  send: Send,
  "thumbs-up": ThumbsUp,
  "message-circle": MessageCircle,
  info: Info,
  "map-pin": MapPin,
  globe: Globe,
  refresh: RefreshCw,
  volume: Volume2,
  mic: Mic,
  repeat: Repeat,
  shuffle: Shuffle,
  terminal: Terminal,
  code: Code,
  "git-branch": GitBranch,
  package: Package,
  gift: Gift,
  "trending-up": TrendingUp,
  activity: Activity,
  layers: Layers,
  "layout-grid": LayoutGrid,
  list: List,
};

/* Extracted from the `heroicons` npm package, 24/outline set. Heroicons
   v2.2.0 (MIT), by Tailwind Labs. */
const HEROICONS: Record<string, IconNode> = {
  camera: [
    ["path", { d: "M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" }],
    ["path", { d: "M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" }],
  ],
  cog: [
    ["path", { d: "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" }],
    ["path", { d: "M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" }],
  ],
  scissors: [
    ["path", { d: "m7.848 8.25 1.536.887M7.848 8.25a3 3 0 1 1-5.196-3 3 3 0 0 1 5.196 3Zm1.536.887a2.165 2.165 0 0 1 1.083 1.839c.005.351.054.695.14 1.024M9.384 9.137l2.077 1.199M7.848 15.75l1.536-.887m-1.536.887a3 3 0 1 1-5.196 3 3 3 0 0 1 5.196-3Zm1.536-.887a2.165 2.165 0 0 0 1.083-1.838c.005-.352.054-.695.14-1.025m-1.223 2.863 2.077-1.199m0-3.328a4.323 4.323 0 0 1 2.068-1.379l5.325-1.628a4.5 4.5 0 0 1 2.48-.044l.803.215-7.794 4.5m-2.882-1.664A4.33 4.33 0 0 0 10.607 12m3.736 0 7.794 4.5-.802.215a4.5 4.5 0 0 1-2.48-.043l-5.326-1.629a4.324 4.324 0 0 1-2.068-1.379M14.343 12l-2.882 1.664" }],
  ],
  wifi: [
    ["path", { d: "M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 0 1 1.06 0Z" }],
  ],
  sparkles: [
    ["path", { d: "M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" }],
  ],
  fire: [
    ["path", { d: "M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z" }],
    ["path", { d: "M12 18a3.75 3.75 0 0 0 .495-7.468 5.99 5.99 0 0 0-1.925 3.547 5.975 5.975 0 0 1-2.133-1.001A3.75 3.75 0 0 0 12 18Z" }],
  ],
  rocket: [
    ["path", { d: "M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.631 8.41m5.96 5.96a14.926 14.926 0 0 1-5.841 2.58m-.119-8.54a6 6 0 0 0-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 0 0-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 0 1-2.448-2.448 14.9 14.9 0 0 1 .06-.312m-2.24 2.39a4.493 4.493 0 0 0-1.757 4.306 4.493 4.493 0 0 0 4.306-1.758M16.5 9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" }],
  ],
  beaker: [
    ["path", { d: "M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 0-6.23-.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0 1 12 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" }],
  ],
};

/* Tabler Icons v3.46.0 (MIT). */
const TABLER: Record<string, IconNode> = {
  cat: [
    ["path", { d: "M20 3v10a8 8 0 1 1 -16 0v-10l3.432 3.432a7.963 7.963 0 0 1 4.568 -1.432c1.769 0 3.403 .574 4.728 1.546l3.272 -3.546" }],
    ["path", { d: "M2 16h5l-4 4" }],
    ["path", { d: "M22 16h-5l4 4" }],
    ["path", { d: "M11 16a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" }],
    ["path", { d: "M9 11v.01" }],
    ["path", { d: "M15 11v.01" }],
  ],
  ghost: [
    ["path", { d: "M5 11a7 7 0 0 1 14 0v7a1.78 1.78 0 0 1 -3.1 1.4a1.65 1.65 0 0 0 -2.6 0a1.65 1.65 0 0 1 -2.6 0a1.65 1.65 0 0 0 -2.6 0a1.78 1.78 0 0 1 -3.1 -1.4v-7" }],
    ["path", { d: "M10 10l.01 0" }],
    ["path", { d: "M14 10l.01 0" }],
    ["path", { d: "M10 14a3.5 3.5 0 0 0 4 0" }],
  ],
  planet: [
    ["path", { d: "M18.816 13.58c2.292 2.138 3.546 4 3.092 4.9c-.745 1.46 -5.783 -.259 -11.255 -3.838c-5.47 -3.579 -9.304 -7.664 -8.56 -9.123c.464 -.91 2.926 -.444 5.803 .805" }],
    ["path", { d: "M5 12a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" }],
  ],
  rocket: [
    ["path", { d: "M4 13a8 8 0 0 1 7 7a6 6 0 0 0 3 -5a9 9 0 0 0 6 -8a3 3 0 0 0 -3 -3a9 9 0 0 0 -8 6a6 6 0 0 0 -5 3" }],
    ["path", { d: "M7 14a6 6 0 0 0 -3 6a6 6 0 0 0 6 -3" }],
    ["path", { d: "M14 9a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" }],
  ],
  bolt: [["path", { d: "M13 3l0 7l6 0l-8 11l0 -7l-6 0l8 -11" }]],
  "brand-github": [
    ["path", { d: "M9 19c-4.3 1.4 -4.3 -2.5 -6 -3m12 5v-3.5c0 -1 .1 -1.4 -.5 -2c2.8 -.3 5.5 -1.4 5.5 -6a4.6 4.6 0 0 0 -1.3 -3.2a4.2 4.2 0 0 0 -.1 -3.2s-1.1 -.3 -3.5 1.3a12.3 12.3 0 0 0 -6.2 0c-2.4 -1.6 -3.5 -1.3 -3.5 -1.3a4.2 4.2 0 0 0 -.1 3.2a4.6 4.6 0 0 0 -1.3 3.2c0 4.6 2.7 5.7 5.5 6c-.6 .6 -.6 1.2 -.5 2v3.5" }],
  ],
  bike: [
    ["path", { d: "M2 18a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" }],
    ["path", { d: "M16 18a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" }],
    ["path", { d: "M12 19v-4l-3 -3l5 -4l2 3h3" }],
    ["path", { d: "M13.007 5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" }],
  ],
  "moon-stars": [
    ["path", { d: "M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454l0 .008" }],
    ["path", { d: "M17 4a2 2 0 0 0 2 2a2 2 0 0 0 -2 2a2 2 0 0 0 -2 -2a2 2 0 0 0 2 -2" }],
    ["path", { d: "M19 11h2m-1 -1v2" }],
  ],
};

export const ICONS: IconEntry[] = [
  ...Object.entries(LUCIDE).map(([label, data]) => ({
    id: `lucide:${label}`,
    label,
    lib: "lucide" as const,
    data,
  })),
  ...Object.entries(HEROICONS).map(([label, data]) => ({
    id: `heroicons:${label}`,
    label,
    lib: "heroicons" as const,
    data,
  })),
  ...Object.entries(TABLER).map(([label, data]) => ({
    id: `tabler:${label}`,
    label,
    lib: "tabler" as const,
    data,
  })),
];

export const byId = new Map(ICONS.map((e) => [e.id, e]));

/* Canonical `d` per entry, straight from the pure core (no DOM, SSR-safe).
   Numbers are quantized to 4 decimals: arc normalization uses trig whose last
   ulp can differ between the server's V8 and the browser's, and hydration
   compares the attribute byte by byte. 1e-4 on a 24px grid is far below
   anything visible. */
const q = (d: string): string =>
  d.replace(/-?\d+\.\d+(?:e-?\d+)?/gi, (n) => String(Number(Number(n).toFixed(4))));

const dCache = new Map<string, string>();
export function dOf(entry: IconEntry): string {
  let d = dCache.get(entry.id);
  if (!d) {
    d =
      typeof entry.data === "string"
        ? entry.data
        : q(cubicsToPathD(iconToCubics(entry.data)));
    dCache.set(entry.id, d);
  }
  return d;
}
