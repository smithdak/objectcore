// `bun run demo:check` — read-only gate over any committed demos under `demos/*/`.
// The demo analogue of `design:check`: it loads each demo (a `FileDemoSource` over
// `demo.json`), derives it through the one seam, and runs the deterministic gate
// (structure / live safety / evidence / de-slop / budget). The judged layer runs
// only with an API key — skipped otherwise, never silently passed.
//
// It is a CLEAN NO-OP until a demo is committed, so it is safe to wire into
// `bun run check` now. Exits non-zero on any deterministic error.

import { join, relative } from "node:path";
import { existsSync } from "node:fs";
import {
  FileDemoSource,
  listDemoDirs,
  deriveDemo,
  runDemoGate,
  findStubs,
  loadDemoEvalSpec,
  runDemoEval,
  summarizeDemo,
  AnthropicDemoJudge,
  hasApiKey,
  type DemoIssue,
} from "@objectcore/demo";

const root = join(import.meta.dir, "..");
const demosDir = join(root, "demos");

const names = existsSync(demosDir) ? await listDemoDirs(demosDir) : [];
if (names.length === 0) {
  console.log("demo:check — no demos under demos/*/ (nothing to check).");
  process.exit(0);
}

let errors = 0;
let warnings = 0;
const note = (msg: string) => console.log(`  • ${msg}`);

const report = (issues: DemoIssue[]) => {
  for (const i of issues) {
    const where = i.path ? `${i.path}: ` : "";
    if (i.level === "error") { errors++; console.error(`  ✗ ${where}${i.message}`); }
    else { warnings++; console.log(`  ! ${where}${i.message}`); }
  }
};

for (const name of names) {
  const dir = join(demosDir, name);
  console.log(`\n▸ ${relative(root, dir)}`);

  const spec = await new FileDemoSource(dir).load(); // schema-asserted; throws loudly
  const output = deriveDemo(spec);
  const result = runDemoGate(output);
  report(result.issues);

  // A scaffolded-but-unwritten demo is a legal stub — visible, never silently
  // passed, and never blocking (the plan-006 split: readiness ≠ structure).
  const stubs = findStubs(spec);
  if (stubs.length) {
    warnings++;
    console.log(`  ! ${stubs.length} unwritten body/bodies still marked: ${stubs.join(", ")}`);
  }

  const s = result.stats;
  note(
    `${s.beats} beat(s), ${s.liveBeats} live, ${s.oscillations} arc switch(es), ` +
    `${Math.round(s.totalSec)}s/${s.targetSec}s, evidence ${(s.evidenceCoverage * 100).toFixed(0)}%`,
  );

  const evalSpec = await loadDemoEvalSpec(dir);
  if (!evalSpec) {
    note("no evals/demo.json — judged quality layer not specified");
  } else if (!hasApiKey()) {
    note(`[skipped] judged eval (${evalSpec.cases.length} case(s)) — no ANTHROPIC_API_KEY`);
  } else {
    const results = await runDemoEval(evalSpec, summarizeDemo(output), new AnthropicDemoJudge());
    for (const r of results) {
      if (!r.passed) { errors++; console.error(`  ✗ judge ${r.name}: ${r.detail}`); }
      else console.log(`  ✓ judge ${r.name}: ${r.detail}`);
    }
  }
}

console.log(
  errors
    ? `\n✗ demo:check FAILED — ${errors} error(s), ${warnings} warning(s) across ${names.length} demo(s)`
    : `\n✓ demo:check passed — ${names.length} demo(s), ${warnings} warning(s)`,
);
if (errors) process.exit(1);
