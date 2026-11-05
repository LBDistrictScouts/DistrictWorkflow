# Stately Sketch renderer

Read-only adaptation of https://github.com/statelyai/sketch at
`a29bbd11662e1a64efca9e14e604adf25e9705a4` (MIT; see LICENSE).

Sources: `src/lib/machine.ts` (graph conversion and target formatting),
`src/components/{MachineViz,StateNodeViz,TransitionViz}.tsx`, and the
`tree-edge` rules from `src/styles.css`.

The renderer preserves Sketch’s recursive state cards, ordering by graph distance,
initial/final/parallel/history/choice markers, and transition trees with guards,
events, actions and linked targets. Local changes remove editor/simulation stores
and timers, replace Tailwind/icon dependencies with scoped site CSS and symbols,
and scope fragment IDs per diagram. It runs as server components and never starts
workflow actors. The graph converter is preserved from upstream; no code parsing or
evaluation features are included. The graph dependency is pinned to Sketch’s 0.5.0
API. To update, compare these files against the recorded upstream revision.

`components/training-fund/flow.tsx` computes the static definition graph at module
load and reuses it per server process. A deployment or module reload refreshes it.
Authenticated workflow pages retain their existing private/no-store policy; this
cache contains the machine definition only, with no application or member data.
