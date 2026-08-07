# Frozen core contracts: foreign formats live in morphicons/adapters

Icons exist in the wild in representations the core doesn't speak natively: raw SVG markup as input, CSS-mask elements as a render target. There are two viable homes for supporting a new representation: inside the core's own input/write paths, where every consumer pays the bytes unconditionally (measured at decision time: ~+0.6 KB gzip on core, ~+1.15 KB on every binding), or behind opt-in entries. We decided the unit of payment is the subpath import: the core input surface is frozen at `IconNode` + `d` string, `PathEl` stays the only write contract the driver knows, and every other representation, input or output, enters through a single `morphicons/adapters` entry as an independently tree-shakeable export with its own named-import size gate.

## Considered Options

1. **Runtime opt-in inside core.** Best DX: foreign formats work in the `icon` prop of every binding and `createMorph` auto-detects its write strategy. Rejected: the cost lands on all consumers whether they use it or not, and the argument repeats for every future format; there is no structural brake against parser accumulation in core.
2. **One fine-grained subpath per capability.** Rejected: entry proliferation, a naming debate for every new format, worse discoverability.
3. **Single adapters entry with per-export gates (chosen).** One standing answer for every future format; tree-shaking makes the aggregate entry cost per-export in real apps, and size-limit's named-import measurement turns that shakeability into CI instead of vigilance.

## Consequences

- The bindings' `icon` prop never accepts foreign formats directly; users call the input adapter once at module scope. Validation of incompatible icons is eager (throws at init, not mid-render).
- The adapters entry's aggregate gate grows over time by design; the honest per-user number is the per-export gate.
- Vendor-branded entries stay banned regardless of where they would live: adapters are per format (construction model), never per icon library.
