#!/usr/bin/env bun
// SubagentStop hook (demo-studio): surfaces the next handoff. The demo pipeline is a
// sequence of specialist passes — choreograph the live beat, source the claims,
// critique the result — and the failure mode is stopping after the first one because
// nothing said what comes next. When one of this plugin's agents returns, this names
// the remaining step.
//
// Self-gating: silent unless the subagent that stopped is one of ours. Every other
// subagent in every other project pays nothing. Standalone (node builtins only) so
// the plugin ships anywhere — never imports a workspace package.

import { readFileSync } from "node:fs";

interface SubagentStopEvent {
  /** The subagent that just finished, when the host provides it. */
  agent_name?: string;
  subagent_type?: string;
}

/** What to say after each of this plugin's agents returns. Keyed by agent name. */
const NEXT_STEP: Record<string, string> = {
  "live-demo-choreographer":
    "The live beat is choreographed. Next: run `bun run demo:check` (the gate requires " +
    "checkpoints and trace surfaces, and warns when no recoverable failure is planned), " +
    "then delegate `evidence-hunter` to source whatever the live beat claims.",
  "evidence-hunter":
    "The claims are sourced. Next: apply the returned evidence registry to the demo, cut " +
    "the claims that could not be backed, and run `bun run demo:check` — it should show " +
    "100% evidence coverage. Then delegate `demo-critic` for the adversarial pass.",
  "demo-critic":
    "The critique is in. Next: apply the specific edits it named, re-run " +
    "`bun run demo:check`, and `bun run demo:build` to regenerate the deck, the runbook, " +
    "and the evidence appendix. Do not weaken a claim to satisfy a critique — cut it or " +
    "source it.",
};

let event: SubagentStopEvent = {};
try {
  event = JSON.parse(readFileSync(0, "utf8")) as SubagentStopEvent;
} catch {
  process.exit(0); // not a parseable hook payload — stay silent
}

const agent = event.agent_name ?? event.subagent_type ?? "";
const next = NEXT_STEP[agent];
if (!next) process.exit(0); // not one of ours (or the host did not name it) — silent

console.log(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SubagentStop",
      additionalContext: next,
    },
  }),
);
