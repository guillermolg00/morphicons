# morphicons

Universal morphing library for stroke-based icons: any icon morphs into any other, with rotations that emerge from the math. Single context; this file is the glossary of the project's language.

## Language

**Format adapter**:
Converts a foreign icon representation into a core contract. Keyed to a construction model (SVG markup, CSS mask), never to a vendor or icon library, and never replaces the host model's own rendering mechanism: it bridges into it.
_Avoid_: library adapter, parser, bridge, integration

**Adapters entry**:
The single opt-in subpath (`morphicons/adapters`) where every format adapter lives, each as an independently tree-shakeable export.
_Avoid_: gordito, extras, utils

**Input contract**:
What the core accepts as icon geometry: an `IconNode` or a raw `d` string (the `IconInput` type). Frozen: new representations adapt to it; it never grows toward them.
_Avoid_: markup input, icon prop shapes

**Write contract**:
The structural surface a morph writes through (the `PathEl` type: anything with `setAttribute`). Output adapters produce write contracts; the driver never knows what is behind one.
_Avoid_: write target, sink, renderer

**Unit of payment**:
The subpath import. A capability's bundle cost is charged only to code that imports it, never to every consumer.
_Avoid_: runtime opt-in

**Gate**:
A gzip size tripwire in CI with ~10% headroom: one per entry, plus one per named export inside the adapters entry. Renegotiated consciously, never grown silently.
_Avoid_: size budget, limit

**Binding controller**:
The lifecycle contract as framework-neutral code (`src/dom/controller.ts`): mount, prop watch, controlled seek with re-basing and the imperative surface, all over `PathEl`. Svelte and the custom element consume it directly; React and Vue keep hook/watch ports of the same logic, pinned by mirrored suites.
_Avoid_: state machine, manager, shared hooks

**Shell**:
A logic-free component file shipped as source and compiled by the consumer's toolchain (`MorphIcon.svelte`, `MorphIcon.astro`): it only wires a reactive surface to typechecked logic, so it contains nothing that can be wrong on its own — which is what makes never typechecking it acceptable.
_Avoid_: wrapper, thin component (as a name; as a description it's fine)
