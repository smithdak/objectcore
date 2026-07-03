# Plan 015: Claude Code platform-capability tracking + adoption

> **What this is**: the factory currently hard-codes its knowledge of the Claude Code
> platform surface in three scattered lists (`HOOK_EVENTS` in forge, `SETTINGS_KEYS` in
> forge, `MANIFEST_FIELDS` in registry-core's strict schema) — all now **stale against
> mid-2026 Claude Code**. New platform features (`ConfigChange` + 10 more hook events,
> `defaultEnabled`/`userConfig`/`channels`/`lspServers` manifest fields, monitors, LSP
> servers, skills-directory plugins, skill overrides, the SchemaStore settings schema,
> settings hot-reload, agent teams, workflows, marketplace `relevance`) are either
> **rejected by our gate** or invisible to our agents. This plan (a) single-sources the
> encoded platform surface with a version stamp, (b) widens the gate to the current spec,
> (c) makes the new primitives forge-generatable where they earn it, and (d) installs a
> recurring platform-watch loop so this drift is detected, not rediscovered.
>
> **Research basis**: two sweeps 2026-07-03 (docs enumeration + changelog) — digest with
> per-feature config syntax and the 18-row gap table in
> `plans/notes/015-claude-code-platform-findings.md`. Version claims there are the docs';
> **every WP's step 0 re-verifies its feature against the live docs before encoding it**
> (the platform analogue of "verify curated claims with the gate's own math", KB lesson).
>
> **Drift check (run first)**: `bun run check` green + `git status` clean. Re-read
> `packages/forge/src/scaffold.ts` (HOOK_EVENTS/HOOK_ACTION_TYPES/SETTINGS_KEYS),
> `packages/registry-core/src/{types,schema,validate}.ts`, and the notes file — the WP
> specs below quote their 2026-07-03 shape.

## Status

- **Priority**: P1 for WP1–WP3 (the gate currently *fails valid plugins* that use
  documented platform features — that's hard-invariant #5 misfiring); P2/P3 for the rest.
- **Effort**: WP1 S–M, WP2 S, WP3 S–M, WP4 M, WP5 S, WP6 S, WP7 S (optional), WP8 M.
  Each WP independently shippable and gate-green on its own.
- **Risk**: LOW–MEDIUM. WP2/WP3 widen validation (additive — nothing currently passing
  can start failing). WP1 refactors where constants live (byte-identical behavior,
  covered by existing tests). WP4 adds new scaffold surface behind existing guards.
  `deriveCatalog`'s core derivation and the `/v1/marketplace.json` seam are untouched
  (WP3 adds optional pass-through fields only).
- **Depends on**: nothing in-flight. Stage 1–3 + plans 008/013/014 are the substrate.

## Why this fits ObjectCore (the mapping)

| ObjectCore primitive | This plan |
|---|---|
| `objectcore.config.json` single-sources identity | `platform.ts` single-sources the *platform surface* (events, fields, keys) — one place to update when Anthropic ships |
| `releaseTag` lives in registry-core because two consumers need it | `HOOK_EVENTS` et al. move to registry-core because forge AND schema AND prose need them |
| `marketplace.json`/`INDEX.md` are derived + byte-gated artifacts | the platform-surface reference doc is derived from `platform.ts` + byte-gated |
| meta-generator's governance archetype (`/verb` + reference skill over a rule set) | `platform-watch` — the governance meta-plugin over the tracking rule set (dogfoods `forge:meta`) |
| "verify curated claims with the gate's own math" (plan 014 lesson) | verify docs claims against live docs before encoding; never encode from memory |
| KB lifecycle: supersede, don't duplicate | plan-015 KB entries supersede any stale platform assumptions |

## The worklist

### WP1 — `platform.ts`: single-source the encoded platform surface (P1, S–M)

**Files**: `packages/registry-core/src/platform.ts` (new), `packages/forge/src/scaffold.ts`,
`packages/registry-core/src/schema.ts`, `scripts/check-catalog.ts` (or a tiny new check).

- New zero-dep module exporting the *verified* platform surface as data:
  `HOOK_EVENTS`, `HOOK_ACTION_TYPES`, `PLUGIN_SETTINGS_KEYS`, `MANIFEST_FIELDS` (names),
  `MARKETPLACE_ENTRY_FIELDS`, `COMPONENT_DIRS`, `SUBSTITUTION_VARS`, plus a stamp:
  `PLATFORM_VERIFIED = { claudeCode: "<version>", date: "YYYY-MM-DD", source: "code.claude.com/docs" }`.
- Forge and schema.ts import from it instead of re-spelling (the `releaseTag` precedent).
  Behavior byte-identical before WP2/WP3 land; existing tests prove it.
- A generated human/agent-readable view — `docs/PLATFORM.md` rendered from `platform.ts`
  (feature → status → where encoded → where we use it), byte-gated like INDEX.md so it
  can't drift from the code. CLAUDE.md gets a two-line pointer. *(If the render/gate feels
  heavy at implementation time, fall back to doc comments in `platform.ts` + the pointer —
  the single-sourcing is the load-bearing part, the doc is the view.)*

### WP2 — widen the hook-event surface (P1, S)

**Files**: `platform.ts` (or `scaffold.ts` if WP1 not yet merged), forge tests.

- Step 0: verify each event exists in the live hooks docs.
- Add (changelog-confirmed, first-appearance versions in the notes file): `ConfigChange`,
  `CwdChanged`, `TeammateIdle`, `TaskCreated`, `TaskCompleted`, `Elicitation`,
  `ElicitationResult`, `PostCompact`, `PermissionDenied`, `MessageDisplay`,
  `WorktreeCreate`. Docs-sweep-only, add ONLY if step 0 confirms them:
  `UserPromptExpansion`, `PostToolBatch`.
- Prose note (WP6 documents it): hook entries also accept `if` (permission-rule syntax),
  `args` (exec form), `continueOnBlock` — forge doesn't validate entry-level extras, so
  nothing to widen, but the runbook should mention them; matchers exact-match as of
  2.1.195 (hyphenated names no longer substring-match).
- Tests: a hooks spec using `ConfigChange` scaffolds; `"SesionStart"` still fails loudly.

### WP3 — widen manifest + marketplace-entry schema (P1, S–M)

**Files**: `packages/registry-core/src/{types,schema,derive}.ts`, `derive.test.ts`.

- Step 0: verify each field in the live plugins-reference docs.
- `PluginManifest` + `MANIFEST_FIELDS` gain: `defaultEnabled` (boolean), `userConfig`
  (object — shallow-check only, mirror docs), `channels` (array), `experimental`
  (object: `monitors`/`themes`), `lspServers` (object), `$schema` (string).
- `MarketplaceEntry` gains optional `defaultEnabled` + `relevance`; `deriveCatalog`
  passes them through from the manifest/config like the other optional fields.
- **Decision to record (KB)**: we stay *stricter than the platform* — Claude Code ignores
  unknown manifest fields, our gate keeps erroring on them (the typo guard is why strict
  schema exists). The cost: new official fields fail our gate until `platform.ts` learns
  them — which is exactly the drift signal WP8 watches for. Escape valve if ever needed:
  a config allowlist, NOT loosening the default.

### WP4 — forge-generatable monitors + LSP (+ `userConfig`) (P2, M)

**Files**: `packages/forge/src/scaffold.ts` + types + tests, `validate.ts`
(`validatePlacement` learns `monitors/` + root `.lsp.json`).

- Step 0: verify `monitors/monitors.json` shape (`{name, command, description, when?}`)
  and `.lsp.json` shape against live docs.
- `PluginSpec` gains `monitors?`, `lsp?`, `userConfig?` with pre-write validation in the
  house style (known fields, required fields, loud typos): monitors' `when` must be
  `always` or `on-skill-invoke:<declared-skill>` (cross-check like activation↔skill);
  LSP entries need `command` + `extensionToLanguage`. Neither is a trigger surface —
  ungated by activation evals, like output styles (F6).
- Note in the runbook prose: monitors never run in CI and keep running after mid-session
  disable — a consuming-project caveat, not a gate concern.
- Themes deliberately deferred to WP7 (they belong to the design engine, not forge).

### WP5 — SchemaStore `$schema` + hot-reload/ConfigChange dogfood (P2, S)

**Files**: `.claude/settings.json`, `packages/forge/src/scaffold.ts` (settings emit),
`plugins/kb-writer/` or `.claude/settings.json` hooks.

- Step 0: verify `https://json.schemastore.org/claude-code-settings.json` resolves and
  covers the keys we emit.
- Add `$schema` to the repo's `.claude/settings.json` and to forge-scaffolded
  `settings.json` output.
- Dogfood `ConfigChange` minimally: a hook entry in `.claude/settings.json` that surfaces
  "settings changed (scope, file) — hot-reloaded; model/outputStyle changes still need a
  restart" into context. Self-gating and tiny, same posture as the existing three hooks.

### WP6 — prose + KB + runbooks catch up (P2, S)

**Files**: `plugins/plugin-forge/skills/*`, `plugins/plugin-validator/skills/*`,
`plugins/marketplace-builder/skills/*`, `knowledge/entries/*`, `CLAUDE.md`.

- plugin-forge's `planning`/`writing-great-skills` learn the new primitives (monitors,
  LSP, `userConfig`, `defaultEnabled`) and when to reach for them; plugin-validator's
  skill documents the widened schema; marketplace-builder documents `relevance`/
  `defaultEnabled` pass-through.
- KB entries (search-first, supersede-not-duplicate): the WP3 strictness **decision**;
  a **gotcha** "new official manifest fields fail our gate until platform.ts learns them
  — that's the tracking signal, not a bug"; a **pattern** "platform surface is
  single-sourced + version-stamped in platform.ts"; a **lesson** on skills-directory
  plugins + nested skills as a lighter distribution/scoping channel (affects how we read
  activation evals: consuming projects can silence or scope skills).
- CLAUDE.md: pointer to `docs/PLATFORM.md` + the platform-watch runbook.
- Verify-then-maybe-curate the `subagent-forbidden-fields` KB gotcha: changelog 2.1.116/117
  made agent-frontmatter `hooks:`/`mcpServers` work for *main-thread* agents via `--agent`.
  If the plugin-shipped-subagent prohibition still stands in the docs (likely), the entry
  gains the nuance via `kb:curate --update`; if not, supersede it and relax forge's
  `FORBIDDEN_AGENT_FIELDS` accordingly. Also check `disallowedTools` + `initialPrompt`
  agent frontmatter (2.1.78/2.1.83) for forge's `AgentSpec`.

### WP7 — design → Claude Code theme sink (P3, S, optional/opportunistic)

**Files**: `packages/design/src/sinks.ts`, design tests, `plugins/design-forge` prose.

- A `ThemeSink` deriving a Claude Code `themes/*.json` (name/base/overrides) view from a
  gated token system — the same "one SSOT, many views" move as the Tailwind sink. Ship
  only if the mapping is honest (terminal palette ≠ full role contract; don't fake it).

### WP8 — `platform-watch`: the recurring loop (P2, M)

**Files**: new `plugins/platform-watch/` (via `bun run forge:meta`, governance archetype),
possibly `scripts/platform-diff.ts`.

- The user-facing half of "track these changes": a `/platform-sync` command + skill whose
  runbook is: fetch the Claude Code changelog + plugins-reference → diff against
  `PLATFORM_VERIFIED` in `platform.ts` → for each new capability, classify
  (gate-breaking | forge-primitive candidate | process/leverage note) → write the KB
  entry and/or open a plan; bump the stamp only after encoding.
- Generated by `forge:meta` (dogfood), passes the full gate including activation evals.
- Cheap external canary to fold in: run `claude plugin validate` (the official validator,
  frontmatter + hooks.json aware since 2.1.77) against our plugins as a *drift detector* —
  disagreement between it and our gate is exactly the signal this WP exists to catch.
  Related step-0 check: `claude plugin tag` (2.1.118) mints official release tags with
  version validation — verify its format against our `releaseTag` (`{plugin}--v{semver}`)
  and record alignment or divergence in the notes.
- Optional operational layer (maintainer's call): a scheduled routine that runs
  `/platform-sync` monthly; until then it's run by hand when a Claude Code release lands.

### Process notes (no code): leveraging teams + workflows in the factory itself

Plans 013/014 were executed as hand-orchestrated agent DAGs. Two platform features now
cover parts of that pattern natively — worth piloting on the *next* epic, not building
around yet: **saved workflows** (`.claude/workflows/`) could encode the recurring
"WP fan-out → adversarial review → integrate" harness; **agent teams** (experimental,
env-gated) fit the parallel-lane execution with direct teammate messaging. Both are
runtime features — nothing to encode in the gate; capture as a KB pattern when piloted.

## Execution order

WP1 → WP2 + WP3 (parallel, both tiny once WP1 lands) → WP4 ∥ WP5 ∥ WP7 → WP6 (prose
last, documents what landed) → WP8 (needs the stamp from WP1 to diff against). Branches:
`feat/015-platform-surface`, `feat/015-hook-events`, `feat/015-manifest-fields`,
`feat/015-forge-monitors-lsp`, `feat/015-settings-schema`, `feat/015-prose`,
`feat/015-theme-sink`, `feat/015-platform-watch`.

## STOP conditions

- A WP's step-0 doc check contradicts the notes file → update the notes file first,
  re-scope the WP, and record the discrepancy (that's the system working).
- Any change that would touch `deriveCatalog`'s existing output for current plugins →
  STOP; this plan is additive behind the seam.
- WP4: if the monitors/LSP docs shapes are still marked experimental-and-changing at
  implementation time, ship the schema-widening half only and park the forge emit.
