# Forge gap report — generating `demo-studio` (plan 016, P4)

Written from generating a real, non-trivial plugin through `/forge` (grill → plan →
scaffold → gate) rather than by hand — the plan-003 spike pattern, and learning loop L1
of plan 016. Spec: `plans/notes/016-demo-studio.spec.json`.

**What the plugin exercised**: 3 skills, 1 command, 3 agents (with scoped tool lists),
2 hooks (`SubagentStop` + `Stop`), 9 activation cases, 5 delegation cases, a `category`.
Everything except MCP and output styles.

## What worked, unchanged

- **The engine honored every KB lesson without prompting.** Agent tool lists serialized
  comma-separated (`tools: Read, Grep, Glob, Bash`), not as a YAML array — the
  `subagent-tools-comma-serialization` gotcha is fixed at the source, so the generation
  simply could not reproduce it. Same for the `hooks.json` `{ "hooks": {...} }` wrapper,
  which the spec correctly does NOT carry.
- **The pre-write cross-checks fired as designed.** Every skill needed a positive
  activation case and every agent a positive delegation case before anything was written.
- **`category` passed through** to the manifest and the derived catalog entry.
- The scaffold → re-derive → validate → offline-eval tail (`syncAndGate`) took the
  catalog from 13 to 14 plugins with no manual step.

## Gap 1 (real, worth fixing) — a command hook can reference a script forge cannot emit

`HooksSpec` lets a `command` action be any string, so this is expressible:

```json
{ "type": "command", "command": "bun \"${CLAUDE_PLUGIN_ROOT}/hooks/on-stop-gate.ts\"" }
```

The scaffolder validates the event name, the action type, and that `command` is present —
then writes `hooks/hooks.json` **and nothing else**. The referenced script is never
created. The result is a plugin that validates, passes `check:catalog`, passes the eval
gate, and ships a **dangling hook**: at runtime the host tries to run a file that does not
exist. Nothing in the gate catches it.

This is not hypothetical for generated plugins only — `reflection` and `kb-writer` both
have hand-written hook scripts alongside forge-shaped `hooks.json`, which is exactly the
same seam, papered over by a human remembering. Here it was found because the generated
plugin was run through the gate and the scripts had to be written by hand afterwards.

**Two fixes, and they land on opposite sides of the F7 self-edit boundary:**

- **(a) A guard, inside the boundary** — `validateHooks` fails when a `command` action
  references a `${CLAUDE_PLUGIN_ROOT}/...` path the scaffold is not emitting. Cheap,
  purely defensive, and turns a silent runtime break into a write-time error. This is a
  behavior-preserving change to `scaffold.ts` and is `forge-improver`'s territory.
- **(b) A spec field, outside the boundary** — a `HookAction.script` (or a `hookScripts`
  map) carrying the script body so forge can emit it. That is a new primitive on
  `PluginSpec`, which the F7 boundary reserves for a human author.

**Recommendation: do (a) now** — it closes the correctness hole, and the gate stops
accepting a plugin that cannot run. (b) is a genuine ergonomic improvement but should be
its own decision, since it widens what a `PluginSpec` is allowed to contain.

## Gap 2 (known, not new) — no way to declare a workspace-engine dependency

`demo-studio`'s prose instructs the user to run `bun run demo:check` / `demo:build`,
which exist only in the ObjectCore workspace. A consumer installing this plugin from the
catalog gets the skills and agents but not the engine behind them. `design-forge` has the
identical shape, so this is a pre-existing distribution gap rather than something P4
introduced — the same "migrate off relative-path sources" caveat AGENTS.md already
records. Noting it here because generating a second engine-backed plugin makes it a
pattern rather than a one-off, and it is the thing that will actually block shipping
either plugin to an outside user.

## Gap 3 (minor) — the gate cannot verify the roster claim it most needs to

The one thing this plugin most needed checked — whether adding 6 trigger surfaces
(3 skills + 3 agents) at once perturbs *other* plugins' judge routing, the
`judge-pool-distractor` risk — is precisely the layer that cannot run without an API key.
Offline, all 119 checks pass and report nothing about routing. The deterministic gate
cannot see the risk that motivated the whole roster decision, so it has to wait for CI.

That is not a defect in forge; it is a reminder that the offline gate's green is narrower
than it looks, and that a roster decision is only *validated* on a run with a key.

## Not gaps

- **No MCP or output styles exercised.** Deferred to P5 by the plan, not a limitation
  found here.
- **`settings`** was not needed — no agent should run as the main thread.
