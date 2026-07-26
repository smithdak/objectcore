---
id: forge-emits-hooks-json-but-never-the-script-it-references-a-generated-plugin-can-ship-a-dangling-hook
type: gotcha
title: Forge emits hooks.json but never the script it references — a generated plugin can ship a dangling hook
tags: [forge, hooks, scaffold, gate, plan-016]
source: packages/forge/src/scaffold.ts
created: 2026-07-26
---

`validateHooks` in scaffold.ts checks the event name, the action type, and that a `command` action HAS a `command` string — but that string is opaque to it. A spec whose action is `bun "${CLAUDE_PLUGIN_ROOT}/hooks/on-stop-gate.ts"` produces `hooks/hooks.json` and NOTHING ELSE: the referenced script is never written. The resulting plugin passes validateAll, check:catalog, check:quality, check:security AND the full eval gate, then fails at runtime when the host tries to execute a file that does not exist. Nothing in the gate looks at whether a command hook's in-plugin target was actually emitted.

Found generating `demo-studio` through /forge (plan 016 P4). Both hand-written hook plugins (`reflection`, `kb-writer`) have the same seam, papered over by a human remembering to write the script — so this is a latent hole in the generator, not a one-off.

Fix inside the F7 self-edit boundary: make validateHooks FAIL when a command action references a `${CLAUDE_PLUGIN_ROOT}/...` path the scaffold is not emitting — a write-time error instead of a silent runtime break. Adding a `HookAction.script` field so forge can emit the body is the ergonomic fix, but that is a new PluginSpec primitive, which the boundary reserves for a human author.

Related: [[plugin-hooks-json-wrapper]] is about the wrapper KEY (a different fact about the same file); this is about the file forge does not write at all.
