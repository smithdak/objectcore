# Plan 016: agentic demo studio — `@objectcore/demo` engine + `demo-studio` plugin

> **Research basis**: an external research brief (2026-07-26), checked in verbatim at
> `plans/notes/016-demo-studio-research.md` and cited inline below as 【R】. Its
> plugin-mechanic claims are stamped as-of 2026-07-26 and its pricing/licensing figures are
> self-rated medium-confidence — **re-verify both at build time** (the plan-015 discipline:
> never encode a platform or vendor claim from memory).
>
> **Executor**: read this plan fully before starting, run the drift check first, honor the
> per-phase STOPs, and update the row in `plans/README.md` when done.

## Context

The research brief at `plans/notes/016-demo-studio-research.md` proposes a "world-class
agentic demo studio": a coordinated team of subagents that turns a one-paragraph brief into
BOTH a polished deck and a live, observable agentic demo. Its central finding is that the
quality bar is **transparency, not spectacle** — the Devin launch failed because it was an
opaque pre-recorded reel; the Code-w/-Claude-2026 demo landed because it showed a real repo,
real tool calls, and a recoverable on-stage bug. Its named enemy is "AI slop": output that
looks professional but carries no verifiable substance.

That maps almost 1:1 onto a shape ObjectCore already operates. "Substantive, verifiable, free
of buzzword filler" is not a prose aspiration here — it is **a deterministic gate**, exactly
like `design:check`'s contrast gate. The brief calls for a "de-slop critic pass"; the factory
answer is a pure `deriveDemo` seam with a deterministic gate underneath it and a judged
advisory layer on top, the same split as `@objectcore/design`.

Two decisions taken with the maintainer: **v1 builds the full studio including the video
track** (Remotion/remocn + tldraw), and **the subagent roster is settled during `/forge`'s
grill phase** under a cap this plan sets. All four learning loops are in scope — the point of
this plan is not just to ship a plugin, it is that the factory gets measurably better for
having built it.

Out of scope for this repo: §5 of the brief (monetization, pricing, private-marketplace
licensing). It is a business track, not a factory change. What *is* in scope is recording the
third-party license obligations it surfaces as a checked-in decision (P6).

## Why this fits ObjectCore

| ObjectCore primitive | This subsystem |
|---|---|
| `@objectcore/design` (pure, zero-dep engine) | `@objectcore/demo` — spec types, schema floor, narrative model, gate, sinks |
| `deriveDesignSystem(source, opts)` — the seam | **`deriveDemo(spec, opts)`** — pure: resolve beats → apply audience/brand context → emit views |
| `TokenSource` / `TokenSink` ports | `DemoSource` / `DemoSink` (deck, runbook, storyboard, evidence, canvas) |
| `validateSchema` (zero-dep, reject-unknown) | `validateDemoSpec` — the strict spec floor |
| the deterministic contrast gate | the deterministic **de-slop / evidence / live-safety gate** |
| `proof.ts` — gate ≡ proof (same math renders the artifact) | `evidence.ts` — the same function that gates unsupported claims renders the demo's evidence appendix |
| `DesignJudge` (Mock/Anthropic, advisory) | `DemoJudge` — "is it substantive and retellable?", advisory, key-gated |
| plan 014 seeded presets, AAA-verified by the gate's own math | curated **demo archetypes**, gate-verified at instantiation |
| `design-forge` (runbook meta-plugin over the engine) | `demo-studio` (the `/demo` command + craft skills + role agents) |

Hard rules respected: the engine core stays dependency-free; all demo derivation goes through
one pure `deriveDemo` (never a second path); plugin components live at the plugin root with
`evals/` as the ObjectCore convention; the plugin enters the catalog only after validation AND
its activation + delegation evals pass (rule #5). `deriveCatalog` and the
`/v1/marketplace.json` seam are never touched.

## Status

- **Priority**: P2 (new capability / maintainer-requested product direction; not on the
  registry critical path).
- **Effort**: L — a multi-phase epic, phases independently shippable, STOP + checkpoint
  between each.
- **Risk**: LOW to the core, MEDIUM at two edges — (1) the new trigger surfaces will perturb
  catalog-wide judge routing (KB gotcha `judge-pool-distractor`); (2) the plugin bundles MCP,
  which trips the publish-time provenance gate.
- **Depends on**: nothing in flight. Conditional on plan 015 WP2 **only if** the grill wants a
  hook event outside the currently encoded set — `SubagentStop` (which the brief's handoff
  hook needs) is already encoded in `packages/forge/src/scaffold.ts:58`, so the default path
  is unblocked.
- **Drift check (run first)**: `bun run check` green + `git status` clean. Re-read
  `packages/design/src/{derive,gate,proof,sinks,presets}.ts` (this plan deliberately mirrors
  all five), `packages/forge/src/{types,scaffold}.ts`, and `scripts/_finalize.ts`.
- **Built on**: branch `feat/016-demo-studio`.

## Phases

### P0 — Spec floor: `DemoSpec` types + strict schema

New package `packages/demo/` (`@objectcore/demo`, zero-dep, mirrors `packages/design`).

- `src/spec.ts` — the domain types. A `DemoSpec` = brief + audience personas + `beats[]`.
  A `Beat` carries `id`, `kind` (`opener` | `what-is` | `what-could-be` | `live-demo` |
  `star` | `tell-show-tell` | `close`), `role` (which persona's "so what?" it answers),
  `durationSec`, `claims[]`, `evidence[]`, and for live beats `fallback` + `checkpoint`.
  Doc-comment the sourcing (Duarte Sparkline, DevRel micro-structure) the way
  `registry-core/types.ts` doc-comments spec MUSTs.
- `src/schema.ts` — `validateDemoSpec(spec)`: required fields, enum membership, reject
  unknown keys. The `validateSchema` stance, hand-rolled to keep the core zero-dep.
- Tests: a valid spec, one failure per field shape, unknown-key rejection.
- **STOP** + checkpoint: `bun test packages/demo` green.

### P1 — The seam: `deriveDemo` + the deck and runbook sinks

- `src/derive.ts` — **`deriveDemo(spec, opts)`**: pure. Resolve beat ordering → apply the
  audience/brand context → emit views through `DemoSink`s. No I/O.
- `src/sources.ts` / `src/sinks.ts` — `FileDemoSource` (read `demos/<name>/`); sinks:
  - `SlidevSink` — the deck (Slidev markdown; Marp/PPTX export stays Slidev's job).
  - `RunbookSink` — the live-demo choreography: environment prep, the scripted-but-real
    steps, human-in-the-loop checkpoints, the fallback path, and the deliberate recoverable-
    failure beat. This is the artifact that makes the demo *transparent* rather than a reel.
  - `EvidenceSink` — the claims→sources appendix (see P2; gate ≡ proof).
- Tests: one spec derives a deck and a runbook whose beat counts and ordering agree; the
  derivation is pure (same input → byte-identical output).
- **STOP** + checkpoint.

### P2 — The deterministic gate (the "de-slop critic", made mechanical)

`src/gate.ts` + `src/evidence.ts` + `src/deslop.ts`. All pure, all deterministic — determinism
is what makes a check gate-safe (KB: the retrieval-eval lesson).

- **Evidence gate** (`evidence.ts`) — every `claim` must resolve to an `evidence` entry.
  **`proveEvidence` is the single source**: `demo:check`'s verdict and `EvidenceSink`'s
  rendered appendix are literally the same evaluation, the `design/proof.ts` discipline.
  **This is the reusable primitive** (learning loop L4) — export it shaped for reuse beyond
  demos.
- **Structure gate** — the Sparkline: the beat sequence must open on a limbic hook, oscillate
  `what-is` ⇄ `what-could-be`, contain a STAR moment, and end on a value close.
- **De-slop lint** (`deslop.ts`) — buzzword/filler density over a checked-in banned-phrase
  list, vague-quantifier detection ("dramatically", "seamlessly"), and an unsupported-
  superlative check. Hard-fails above a declared threshold.
- **Live-safety gate** — every `live-demo` beat MUST declare a `fallback` and at least one
  `checkpoint`; a demo with zero live beats fails (a fully pre-recorded demo is the Devin
  failure mode, and this gate is where that lesson is enforced rather than described).
- **Runtime budget** — beat durations sum within tolerance of the declared target.
- Tests: a passing demo, one failure per check.
- **STOP** + checkpoint.

### P3 — Judged advisory layer + scaffold + archetypes

- `src/judge.ts` / `src/evaluate.ts` — `DemoJudge` with `MockDemoJudge` (offline, gate-safe)
  and an Anthropic adapter; asks "substantive? retellable? transferable takeaway?". Advisory,
  key-gated, reported as skipped without a key — never silently passed.
- `src/scaffold.ts` — `scaffoldDemo(brief)`: a **credible-by-construction** spec skeleton
  (structure gate satisfied, live beat with fallback pre-wired, claims stubbed but flagged).
- `src/presets.ts` + `packages/demo/presets/` — curated **demo archetypes**, e.g.
  `enterprise-agentic` (the Code-w/-Claude pattern), `platform-migration`, `exec-briefing`.
  Checked-in engine-native specs, **verified by the gate's own math in `presets.test.ts`** —
  the plan-014 discipline: measured, not promised.
- CLIs `scripts/demo-{scaffold,seed,check,build}.ts` → `bun run demo:scaffold|seed|check|build`;
  **wire `demo:check` into `bun run check`** alongside `design:check`.
- **STOP** + checkpoint: `bun run check` green with a committed archetype instance.

### P4 — The `demo-studio` plugin (through `/forge`, gap report mandatory)

Built via `/forge` — grill → plan → scaffold → gate — **not hand-written**. The grill settles
the roster; this plan sets the constraints it must satisfy:

- **Cap: ≤4 subagents.** Agents only where isolated context genuinely pays — orchestration
  (showrunner), live-demo choreography, and an adversarial critic are the defensible three.
  The brief's other five roles (Narrative Architect, Technical Content Curator, Executive-
  Outcomes Translator, Deck Designer, Motion-Graphics Producer) are **durable craft → Skills**,
  which is what the brief's own "encode craft as Skills, roles as Subagents" division implies.
- **Disjointness rule**: every agent `description` and skill frontmatter must be separable by
  a reader who sees only the descriptions. Overlapping prose is what breaks the judge.
- Each agent needs a positive **and** a negative delegation case; each skill a positive and a
  negative activation case (readiness layer), including a **confusability negative** against
  `design-forge` (both talk about "design") and `plugin-forge`.
- Hooks: `SubagentStop` to surface the next handoff; a `Stop` de-slop gate hook that refuses
  completion while `demo:check` is red (the reflection-plugin hook pattern, self-gating).
- `/demo` command forks quick-start-from-archetype vs full grill — the plan-014 lesson
  "quick-start is a fork inside the command, not a second command".
- **STOP** + checkpoint: offline gate green; activation + delegation evals run with the key.

### P5 — The video + canvas track (Remotion/remocn + tldraw) and MCP

- `StoryboardSink` — a deterministic Remotion scene manifest (remocn component names, props,
  frame ranges). Lint the generated scenes for `Math.random()`/`Date.now()` — the determinism
  trap the brief names; nondeterministic scenes fail the gate.
- `TldrawSink` — a canvas document for the animated architecture beat.
- `packages/demo-mcp` — the render server (the `@objectcore/knowledge-mcp` precedent: the
  only package depending on the render toolchain, keeping the core zero-dep), exposed to the
  Motion-Graphics skill; the plugin ships `.mcp.json` at its root.
- **Constraint to plan around, not discover**: bundling MCP trips `release:publish`'s
  provenance gate. The plugin can only be published from CI (`release.yml` attests); a local
  `release:publish` will refuse by design. Verify this end-to-end before P6.
- Video renders the **frame** only — opener, transitions, B-roll. The substantive middle stays
  a live terminal. Rendering the agentic demo itself reproduces the Devin failure mode; encode
  that as a gate rule, not a comment.
- **STOP** + checkpoint.

### P6 — Dogfood, decisions, release

- Produce ObjectCore's own demo from the engine (the `design/objectcore` dogfood precedent).
- Decision record + `decision` KB entry for the third-party license obligations the brief
  surfaces: Remotion is source-available with paid tiers at productization and mandatory
  `licenseKey` telemetry from v5; tldraw needs a business license to remove the watermark;
  remocn/Slidev/Marp are MIT. **Re-verify each against the vendor's live pricing page before
  encoding** — the brief itself rates these "medium confidence, verify at build time".
- Changesets for every touched plugin, `bun run check`, release.

## Learning loops (cross-phase, not a final step)

- **L1 — forge gap report.** P4 is a deliberate spike: record every place `PluginSpec` /
  `scaffoldPlugin` couldn't express what the plugin needed, into
  `plans/notes/016-demo-studio-forge-gaps.md` (the plan-003 pattern). Feed it to
  `bun run forge:suggest` / `forge:improve`, and open plan-015 WPs for anything that is
  platform drift rather than a forge gap.
- **L2 — KB per phase boundary.** `bun run kb:search` first, then `kb:add` — supersede a wrong
  prior entry rather than duplicating it. Expected entries: the transparency-as-a-gate pattern,
  the ≤4-agent roster lesson, the MCP-provenance-publishes-from-CI-only gotcha.
- **L3 — graded-gate trend.** `bun run eval:record` immediately **before** P4 merges and again
  **after**, then `bun run eval:trend`. This plugin adds the largest trigger-surface batch the
  catalog has taken at once; the delta measures whether it degraded catalog-wide routing. If it
  did, tighten the new descriptions — never weaken existing cases.
- **L4 — reusable primitive.** `evidence.ts`'s `proveEvidence` (gate ≡ proof) and the de-slop
  lint are designed for reuse, not as demo-local helpers. If a second consumer appears, they
  promote to a shared package; the export shape should already allow it.

## Critical files

New: `packages/demo/src/{spec,schema,derive,sources,sinks,gate,evidence,deslop,judge,evaluate,scaffold,presets}.ts`,
`packages/demo/presets/`, `packages/demo-mcp/`, `plugins/demo-studio/`,
`scripts/demo-{scaffold,seed,check,build}.ts`, `plans/016-agentic-demo-studio.md`,
`plans/notes/016-demo-studio-{research,forge-gaps}.md`.

Modified: `package.json` (the `demo:*` scripts + `demo:check` inside `check`),
`.claude-plugin/marketplace.json` (derived — never hand-edited), `CLAUDE.md`,
`plans/README.md` (status row), `knowledge/` (via `kb:add`), `.changeset/`.

Reuse rather than reinvent: `packages/design/src/proof.ts` (gate ≡ proof), `presets.ts` +
`presets.test.ts` (curated-claims-verified-by-the-gate), `judge.ts` (Mock/Anthropic port
shape), `scripts/_finalize.ts`'s `syncAndGate`, `packages/eval/src/judge.ts`'s `routeExpecting`.

## Verification

1. `bun test packages/demo` — per-phase, green at every STOP.
2. `bun run demo:seed enterprise-agentic && bun run demo:check` — an archetype instantiates and
   gates green; `bun run demo:build` emits deck + runbook + evidence appendix into `dist/`.
3. Negative proof: hand-edit the instance to strip a live beat's `fallback`, drop a claim's
   evidence, and inject a banned phrase — `demo:check` must fail on each, distinctly.
4. `bun run check` — full gate green, including `demo:check` and the catalog byte-match.
5. With `ANTHROPIC_API_KEY`: activation + delegation evals for `demo-studio` pass, and **no
   existing plugin's cases regress** (the judge-pool check).
6. `bun run eval:record` before/after + `bun run eval:trend` — the score did not regress.
7. P5 only: a real render through the MCP server, and a **dry-run `release:publish` that
   refuses** the MCP-bundling plugin locally — proving the provenance gate fires as designed.
8. Install the built plugin from the local registry
   (`claude --plugin-url http://localhost:8787/v1/marketplace.json`) and drive one real brief
   end to end.
