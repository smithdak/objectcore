# Plan 015 research notes — Claude Code platform capabilities (as of 2026-07-03)

> **What this is**: the research digest behind plan 015 (platform-capability tracking +
> adoption). Two sweeps on 2026-07-03: a docs enumeration (code.claude.com/docs — plugins
> reference, skills, sub-agents, agent-teams, workflows, hooks, settings, output styles)
> and a changelog sweep (anthropics/claude-code CHANGELOG). Version numbers are the docs'
> claims; treat any un-corroborated version as "recent 2026" rather than gospel. **Every
> adoption item in plan 015 re-verifies its feature against the live docs before encoding
> it** — the platform analogue of "verify curated claims with the gate's own math."

## The gap table — platform feature → where it bites ObjectCore today

| # | Feature | Platform status | ObjectCore encoding today | Gap |
|---|---------|-----------------|---------------------------|-----|
| 1 | New hook events (`ConfigChange` 2.1.49, `CwdChanged` 2.1.83, `TeammateIdle`/`TaskCompleted` ~2.1.33, `TaskCreated` 2.1.84, `Elicitation`/`ElicitationResult` 2.1.76, `PostCompact` 2.1.76, `PermissionDenied` 2.1.89, `MessageDisplay` 2.1.152, `WorktreeCreate` ≤2.1.84; docs-only claims needing verification: `UserPromptExpansion`, `PostToolBatch`) | shipped, changelog-confirmed | `HOOK_EVENTS` in `packages/forge/src/scaffold.ts:58` has 14 events, none of these | forge **rejects** a valid hooks spec using them |
| 2 | New manifest fields: `defaultEnabled`, `userConfig`, `channels`, `experimental.{monitors,themes}`, `lspServers`, `$schema` | shipped (various 2026 versions) | `MANIFEST_FIELDS` (`registry-core/src/schema.ts:20`) + `PluginManifest` (`types.ts`) know none of them | strict schema **fails the gate** on a plugin using any |
| 3 | Marketplace entry fields: `defaultEnabled`, `relevance` (signal-based discovery) | shipped | `MarketplaceEntry` (`types.ts:41`) lacks both; `deriveCatalog` can't pass them through | catalog can't express opt-in or discovery hints |
| 4 | Monitors (`monitors/monitors.json`, persistent background commands, `when: on-skill-invoke:<skill>`) | Monitor tool 2.1.98; plugin `monitors` manifest key 2.1.105; moved under `experimental` 2.1.129 | not a forge-generatable primitive; `validatePlacement` doesn't know `monitors/` | forge can't emit; placement lint may mis-flag |
| 5 | LSP servers (`.lsp.json` root file or `lspServers` manifest field) | LSP tool since 2.0.74; plugin LSP shown in `/plugin` by 2.1.145 | not a forge primitive; not in schema | same as monitors |
| 6 | Skills-directory plugins (`<name>@skills-dir` — a `.claude-plugin/plugin.json` inside a skills dir loads as a plugin, no marketplace; `claude plugin init` scaffolds one) | shipped 2.1.157 | not tracked | a second, lighter distribution channel our docs/prose don't mention |
| 7 | Scoped/nested skills (`packages/web/.claude/skills/` → `/packages/web:deploy` directory-qualified names) | shipped, refined v2.1.178+ | not tracked | affects trigger-surface thinking (activation evals assume a flat pool) |
| 8 | Skill overrides (`skillOverrides` settings key: `on`/`name-only`/`user-invocable-only`/`off`) | working as of 2.1.129 ("now works" — existed earlier) | not tracked | consuming projects can silence our plugins' skills — relevant to activation-eval interpretation; note plugin skills are managed via `/plugin`, not `skillOverrides` |
| 9 | Settings JSON schema on SchemaStore (`https://json.schemastore.org/claude-code-settings.json`; plugin-manifest schema too) | live on SchemaStore (never in the changelog); `claude plugin validate` accepts `$schema` in plugin.json + marketplace.json top level since 2.1.120 | scaffolded `settings.json` and repo `.claude/settings.json` carry no `$schema` | free editor validation we don't emit |
| 10 | Settings hot-reload (all but `model`/`outputStyle`) + `ConfigChange` hook (stdin: `configFile`/`changeType`/`scope`) | hot-reload predates the window (fix bullets at 2.1.139/140); `ConfigChange` since 2.1.49 | not tracked | new reactive surface for kb-writer/reflection-style dogfooding |
| 11 | Background agents (`background: true` agent frontmatter; task notifications) | shipped | forge's `AgentSpec` already validates `background` (boolean) — **covered** | prose/KB never says when to use it |
| 12 | Agent teams (experimental, `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`; team hooks `TeammateIdle`/`TaskCreated`/`TaskCompleted`; teammates from agent definitions) | experimental since 2.1.32 (~Feb 2026); `TeamCreate`/`TeamDelete` tools REMOVED 2.1.178 (implicit team per session, spawn via Agent tool) | not tracked | our shipped agents are teammate-definable; team hook events missing from `HOOK_EVENTS` (see #1) |
| 13 | Workflows (`.claude/workflows/*.js`, `export const meta`, `agent()`/`pipeline()`; saved via `/workflows`) | shipped 2.1.154; trigger keyword renamed `workflow`→`ultracode` 2.1.160 | not tracked | a new orchestration artifact plugins can ship; candidate for factory DAG execution (plans 013/014 style) |
| 14 | Variable substitutions: `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}` (persistent state), `${CLAUDE_PROJECT_DIR}`, `${user_config.*}` | shipped | kb-writer already uses `$CLAUDE_PROJECT_DIR` | `CLAUDE_PLUGIN_DATA` + `user_config` unexploited |
| 15 | Output styles `force-for-plugin` | shipped | forge F6 already emits the hyphenated keys — **covered** | — |
| 16 | Themes (`themes/*.json`, experimental component) | shipped v2.1.180+ | not a forge primitive; **direct overlap with `@objectcore/design`** (a token system could sink a Claude Code theme) | design engine could emit a theme view |
| 17 | CLI subcommands (`claude plugin install/validate/init/...`) | established | our runbooks reference `--plugin-url` only | `claude plugin validate` is an external check our gate could mirror/cite |
| 18 | Unknown-manifest-field posture: Claude Code **ignores** unknown top-level fields; `claude plugin validate --strict` warns | shipped | our `validateSchema` **errors** on unknown fields | posture decision needed: stay stricter than the platform (typo guard) while tracking the known-field list |

## Per-feature detail (docs sweep, 2026-07-03)

### Hook events (the full documented set)
Previously encoded 14: `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreToolUse`,
`PostToolUse`, `PostToolUseFailure`, `Stop`, `StopFailure`, `SubagentStop`, `PreCompact`,
`Notification`, `FileChanged`, `PermissionRequest`, `InstructionsLoaded`.
New, **changelog-confirmed** (version = first appearance): `ConfigChange` 2.1.49 (config
file changed; stdin `{configFile, changeType, scope}`; can block settings changes),
`Elicitation`/`ElicitationResult` 2.1.76 (MCP user-input round-trips), `PostCompact`
2.1.76, `StopFailure` 2.1.78 (already encoded), `CwdChanged` + `FileChanged` 2.1.83,
`TaskCreated` 2.1.84, `WorktreeCreate` ≤2.1.84 (http-action support bullet), `PermissionDenied`
2.1.89 (`{retry: true}` after auto-mode denials), `MessageDisplay` 2.1.152 (transform/hide
assistant text), `TeammateIdle`/`TaskCompleted` ~2.1.32–33 (teams; both support
`{"continue": false, "stopReason"}` since 2.1.69).
**Docs-sweep-only, NOT found in the changelog — verify before encoding**:
`UserPromptExpansion`, `PostToolBatch`.
Hook *entry* fields also grew: conditional `if` (permission-rule syntax, 2.1.85),
`args: string[]` exec form (no shell, 2.1.139), `continueOnBlock` for PostToolUse
(2.1.139), `duration_ms` in PostToolUse input (2.1.119), `effort.level` input +
`$CLAUDE_EFFORT` (2.1.133). **Matcher gotcha**: comma-separated matchers were silently
dead until fixed 2.1.191; hyphenated matchers substring-matched until 2.1.195 (now
exact-match) — relevant to any hooks we ship.

### Monitors
`monitors/monitors.json` (or `experimental.monitors` in the manifest): array of
`{name, command, description, when?}`; `when` = `"always"` (default) or
`"on-skill-invoke:<skill>"`. Persistent background shell commands, stdout delivered as
notifications. Interactive sessions only (never CI); unsandboxed at hook trust level;
disabling a plugin mid-session does NOT stop live monitors. Supports
`${CLAUDE_PLUGIN_ROOT}` / `${CLAUDE_PLUGIN_DATA}` / `${user_config.*}` substitution.

### LSP servers
Root `.lsp.json` (preferred) or manifest `lspServers`:
`{ "<lang>": { command, args?, extensionToLanguage, transport?, env?,
initializationOptions?, settings?, workspaceFolder?, startupTimeout?, maxRestarts?,
diagnostics? } }`. The plugin configures the connection; the binary is NOT bundled
(user installs it; `${CLAUDE_PLUGIN_ROOT}` may reference a bundled one). Official
marketplace ships `pyright-lsp`/`typescript-lsp`/`rust-analyzer-lsp`.

### Skills-directory plugins
A folder under `~/.claude/skills/` or `.claude/skills/` containing
`.claude-plugin/plugin.json` loads as plugin `<name>@skills-dir` with full components
(skills/agents/hooks/.mcp.json). `claude plugin init <name>` scaffolds one. Project-level
ones are gated behind workspace trust; blockable via managed settings
(`blockedMarketplaces` with `{"source": "skills-dir"}`).

### Scoped (nested) skills
`packages/web/.claude/skills/deploy/SKILL.md` → `/packages/web:deploy`; Claude picks the
variant matching the files being edited. Plugins themselves are NOT path-scoped.

### Skill overrides
Settings key `skillOverrides`: `{"<skill>": "on"|"name-only"|"user-invocable-only"|"off"}`.
`off` hides from Claude + menu and errors on invocation (v2.1.199 also hides from Remote
Control/SDK lists). Interactive `/skills` menu writes to `.claude/settings.local.json`.
**Does not apply to plugin skills** (managed via `/plugin`).

### Settings schema + hot-reload + ConfigChange
`$schema: "https://json.schemastore.org/claude-code-settings.json"` in settings files;
a plugin-manifest schema exists too (`claude-code-plugin-manifest.json`). No SchemaStore
entry for marketplace.json yet. Hot-reload covers permissions/env/hooks/skills/MCP/agents/
plugins; `model` + `outputStyle` still need restart. `/config key=value` (v2.1.181+).

### Background agents / teams / workflows
`background: true` frontmatter (forge already validates it). Teams: experimental env flag,
lead + teammates each with own context, `--teammate-mode in-process|tmux|iterm2`, tasks
with dependencies, quality-gate hooks (`TeammateIdle`/`TaskCreated`/`TaskCompleted`);
limitations at v2.1.199: no resume with in-process teammates, one team per session, no
nested teams, teammates can't spawn background subagents. Workflows: JS scripts with
`export const meta`, `agent(prompt, {schema?, label?})`, `pipeline(items, fn)` (16
concurrent / 1000 total), saved to `.claude/workflows/` (project) or `~/.claude/workflows/`
(personal) via `/workflows`, invoked as `/` commands; `ultracode` keyword / `/effort
ultracode` opt-in.

### Marketplace entry additions
`defaultEnabled` (per-entry override, takes precedence over plugin.json) and `relevance`
(`{"signals": ["typescript", ...]}` discovery hints, v2.1.180+). Source types now also
include `npm` and `file`.

## What is already covered (no action)

- `background`/`memory`/`maxTurns`/`isolation` agent frontmatter — forge validates all (F-series).
- Output styles hyphenated keys incl. `force-for-plugin` — forge F6.
- `dependencies` manifest field — types.ts + schema.ts (v2.1.110+).
- `$CLAUDE_PROJECT_DIR` in hooks — kb-writer uses it.
- MCP-bundling provenance gate — Stage 2/plan 011 (unchanged by any of the above).

## Changelog reconciliation (sweep 2, 2026-07-03)

The full CHANGELOG.md (2.0.x → 2.1.199, no dates in-file; anchors: 2.1.90 ≈ Apr 1,
2.1.154 < Jun 1, 2.1.197 ≈ Jul 1 Sonnet 5, 2.1.199 = Jul 2) corroborated most of the
docs sweep and **corrected these docs-sweep version claims**: `ConfigChange` is 2.1.49
(not "2.1.196+"), skills-directory plugins are 2.1.157 (not "~2.1.121"), agent teams date
to 2.1.32 with the big restructure (implicit team, no TeamCreate/TeamDelete) at 2.1.178.
LSP tool goes back to 2.0.74. Background *subagents by default* is 2.1.198.

Additional changelog findings relevant to ObjectCore, missed by the docs sweep:

- **`claude plugin tag` (2.1.118)** — "create release git tags for plugins with version
  validation". Overlaps our `{plugin}--v{semver}` `releaseTag` format — WP step 0 should
  check the official tag format and whether ours should align or interop.
- **`claude plugin validate` growth** — 2.1.77 validates skill/agent/command frontmatter +
  `hooks/hooks.json`; 2.1.120 accepts `$schema`/`version`/`description` at marketplace.json
  top level (our `MarketplaceJson` puts description/version under `metadata` — verify both
  forms). An external validator our gate could cross-run in CI as a canary for spec drift.
- **Agent frontmatter grew**: `effort`/`maxTurns`/`disallowedTools` (2.1.78; forge already
  validates effort/maxTurns, not `disallowedTools`), `initialPrompt` (2.1.83). **Nuance for
  our `subagent-forbidden-fields` KB gotcha**: 2.1.116/117 made agent-frontmatter `hooks:`
  and `mcpServers` *work for main-thread agents via `--agent`* — the plugin-shipped
  SUBagent prohibition may still stand, but verify current docs before touching the rule.
- **Skill/command frontmatter grew**: `effort` (2.1.80), `disallowed-tools` (2.1.152),
  `${CLAUDE_SKILL_DIR}` substitution in SKILL.md (2.1.69).
- **Plugins can ship `bin/` executables** invoked as bare commands from Bash (2.1.91).
- **More marketplace/source surface**: `source: 'settings'` inline entries (2.1.80),
  `--plugin-url <url>` zip archives (2.1.129), `skipLfs` on github/git sources (2.1.153),
  plugin dependency *enforcement* (2.1.143) + version-pin fix (2.1.196),
  `pluginSuggestionMarketplaces` managed setting (2.1.152), managed
  `blockedMarketplaces`/`strictKnownMarketplaces` enforced on install/update (2.1.117).
- **MCP**: `alwaysLoad` server option (2.1.121), stdio servers receive
  `CLAUDE_PROJECT_DIR` (2.1.139) + `CLAUDE_CODE_SESSION_ID`/`CLAUDECODE=1` (2.1.154),
  `claude mcp login/logout` (2.1.186).
- **Orchestration**: subagents can nest 5 deep (2.1.172); nested `.claude/` dirs — closest
  agent/workflow/output-style wins on name collision (2.1.178); `Tool(param:value)`
  permission-rule syntax, e.g. `Agent(model:opus)` (2.1.178).
- **Hot-reload commands**: `/reload-plugins` (2.1.69), `/reload-skills` + SessionStart
  hooks returning `reloadSkills: true` (2.1.152).

## Doc URLs (all code.claude.com/docs/en/)
`plugins-reference.md`, `plugins.md`, `plugin-marketplaces.md`, `skills.md`,
`sub-agents.md`, `agent-teams.md`, `workflows.md`, `hooks-guide.md`, `settings.md`,
`output-styles.md`, `changelog.md`.
