#!/usr/bin/env bun
// Stop hook (demo-studio): the ambient de-slop gate. When a session ends in a project
// that has demos, this re-runs the deterministic demo gate and, if any demo is RED,
// injects context naming exactly what failed — so an unbacked claim or a live beat
// with no fallback is caught at the end of the session that introduced it, rather
// than the morning of the talk.
//
// Self-gating, in the reflection-hook style: silent unless the project actually has
// a `demos/` directory AND the gate is red. A project without demos pays nothing.
// Standalone (node builtins only) so the plugin ships to any project — never imports
// a workspace package.

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const demosDir = join(projectDir, "demos");

// No demos in this project → nothing this hook can say.
let demoNames: string[];
try {
  demoNames = readdirSync(demosDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(demosDir, e.name, "demo.json")))
    .map((e) => e.name);
} catch {
  process.exit(0);
}
if (demoNames.length === 0) process.exit(0);

// The gate is the engine's, not a reimplementation here — this hook only reports it.
// A project that has demos/ but no demo:check script is not an ObjectCore workspace;
// stay silent rather than guess.
const result = spawnSync("bun", ["run", "demo:check"], {
  cwd: projectDir,
  encoding: "utf8",
  timeout: 15_000,
});

if (result.error || result.status === null) process.exit(0); // could not run — silent
if (result.status === 0) process.exit(0); // gate green — nothing to say

const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
const failures = output
  .split("\n")
  .filter((l) => l.includes("✗"))
  .slice(0, 12)
  .map((l) => `  ${l.trim()}`)
  .join("\n");

if (!failures) process.exit(0); // non-zero for some other reason — do not invent a report

const context =
  `The demo gate is RED for ${demoNames.length} committed demo(s) (${demoNames.join(", ")}).\n` +
  `${failures}\n\n` +
  `Fix these before the demo is given: an unbacked claim, a live beat with no fallback or ` +
  `no visible trace, or banned filler will be found by the room, not by you. Run ` +
  `\`bun run demo:check\` for the full report, and delegate \`demo-critic\` for the ` +
  `judgement the deterministic gate cannot make. Do not weaken the demo's claims to ` +
  `make the gate pass — cut them or source them.`;

// Stop additive-context contract: print JSON with hookSpecificOutput.
console.log(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "Stop",
      additionalContext: context,
    },
  }),
);
