/* Preloaded before every test file (bunfig.toml): vue captures `document` at
   import time, so the happy-dom globals must exist before ANY suite loads.
   The dom driver suite still proves itself against fake elements and its own
   injected rAF — see client-dom.ts and the hybrid rule in CLAUDE.md. */
import { registerDom } from "./client-dom";

registerDom();
