---
name: choosing-a-demo-archetype
description: Pick a READY-MADE demo archetype instead of authoring one — the curated inventory (enterprise-agentic = a transparent live agentic build; platform-migration = agent-assisted migration of one module) and when an archetype beats a custom grill. Use when the user wants a quick-start demo, an off-the-shelf presentation to adapt, or asks which demo archetype fits their audience. This is about DEMOS, not design themes — seeded design/color presets are choosing-a-seeded-theme.
---
# Choosing a demo archetype

A curated archetype is a complete, checked-in demo you instantiate and edit — a starting
position, not a privileged one. It runs the same seam, the same gate, and the same sinks
as one you author from scratch. Every archetype's gate-green claim is re-measured by the
test suite on each CI run, so a starting point can actually be trusted.

## The inventory

**`enterprise-agentic`** — 20 minutes. An agent does a real, non-trivial task on a real
repo with its planning, tool calls, and one genuine failure on screen. Reach for it with
a senior technical audience that has seen polished AI reels and did not believe them.

**`platform-migration`** — 30 minutes. Agent-assisted migration of one module, where the
valuable artifact is not the diff but the list of call sites it flagged as uncertain.
Reach for it with a delivery-accountable audience weighing a multi-quarter migration
they cannot staff.

```
bun run demo:seed --list                          # the inventory
bun run demo:seed enterprise-agentic --name acme  # instantiate under your own name
```

## Archetype or author from scratch?

Take an archetype when the *shape* of your demo matches one of the above and only the
specifics differ. Author from scratch (`bun run demo:scaffold`) when the audience, the
arc, or the artifact is genuinely different — forcing an ill-fitting archetype produces a
demo about the archetype.

## After instantiating

Every archetype ships `REPLACE ME` fields — the repo, and metric refs pointing at your
own numbers. Replace them before you present: a demo citing a placeholder is exactly the
unbacked claim the evidence gate exists to catch. Then `bun run demo:check`.

This is not the design-system preset chooser. Seeded *design themes* (inkwell, cathode)
are a different plugin's territory — see `choosing-a-seeded-theme`.
