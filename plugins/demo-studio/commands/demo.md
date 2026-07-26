---
description: Produce a demo that is substantive and observable — quick-start from a curated archetype, or grill a brief into a full demo spec, then gate it.
---
---
description: Produce a demo that is substantive and observable — quick-start from a curated archetype, or grill a brief into a full demo spec, then gate it.
---
# /demo

Two paths, one gate. Both end at `bun run demo:check`.

## Quick start — from a curated archetype

When the shape of an existing archetype matches and only the specifics differ:

```
bun run demo:seed --list
bun run demo:seed <archetype> --name <your-demo>
```

Load `choosing-a-demo-archetype` to pick. Then replace the `REPLACE ME` fields (the repo,
your own metric refs) — a placeholder citation is exactly the unbacked claim the evidence
gate exists to catch.

## Full authoring — grill, then scaffold

When the audience, arc, or artifact is genuinely different.

**1. Grill.** Load `structuring-a-demo`. Resolve before scaffolding: who is in the room
and what each of them silently asks of every beat; the slot length; the real repo and the
real task for the live segment; what they walk away able to use. Do not proceed while any
answer is "it depends".

**2. Scaffold.** Write the brief as JSON (`name`, `title`, `brief`, `targetDurationSec`,
`audience[]`, `repo`, `task`, `takeaway`) and run:

```
bun run demo:scaffold <brief.json>
```

You get a gate-passing skeleton: the arc laid out, the live beat pre-wired with a
fallback, checkpoints, and trace surfaces, and durations summing exactly to the slot.

**3. Write the bodies.** Unwritten ones carry a visible marker and `demo:check` warns
until they are filled. Load `demoing-agents-transparently` for the live beat — delegate
to `live-demo-choreographer` if it deserves its own pass. Delegate to `evidence-hunter`
to source the claims.

**4. Gate, then critique.**

```
bun run demo:check     # structure, live safety, evidence, de-slop, budget
bun run demo:build     # deck.md, runbook.md, evidence.md + evidence-proof.json
```

Then delegate to `demo-critic` for the adversarial pass. The gate proves the demo is
sound; the critic asks whether it is worth watching.
