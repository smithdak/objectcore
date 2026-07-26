---
id: activation-expect-constraint
type: gotcha
title: An activation case's expect must be null or a skill in the SAME plugin
tags: [forge, evals, activation]
source: packages/forge/src/scaffold.ts
created: 2026-06-26
updated: 2026-07-26
---

In a plugin's `evals/activation.json`, a case's `expect` must be either `null` or
the name of a skill declared in THAT plugin (enforced by scaffold.ts's pre-write
cross-check). You cannot assert that a prompt routes to a *sibling* plugin's skill.

So a confusability negative aimed at another plugin must be `expect: null` — a
near-miss where nothing should fire — NOT `expect: "<sibling-skill>"`. The
cross-plugin boundary is still tested, but from the sibling's own positive cases:
the activation judge picks a single skill across the whole catalog, so if the
sibling's positive passes, this plugin did not steal that prompt.

Sharpened after it was MISAPPLIED (plan 016, demo-studio): "a near-miss where nothing should fire" is the load-bearing half, and it is easy to read past. Two cases were written whose prompts were DIRECT HITS on a sibling's surface — one squarely matching another plugin's preset-chooser skill, one squarely matching the gate-failure diagnosis agent — and given `expect: null` on the theory that they tested a boundary. The judge routed both to the sibling, correctly, and the gate went red.

The test to apply before writing such a case: *if a competent router saw this prompt with the whole catalog in view, should it genuinely fire nothing?* If the honest answer is "no, it belongs to X", the case is malformed, not strict. Pick a prompt that borrows the vocabulary but not the intent. And note the boundary you wanted is already covered for free: the sibling's own positive cases passing proves your plugin did not steal those prompts.

Correcting a malformed case is not weakening the gate; deleting a case whose prompt your plugin genuinely should have won would be.
