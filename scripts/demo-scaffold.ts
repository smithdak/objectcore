// `bun run demo:scaffold <brief.json> [--force]` — the full-creation half of
// `/demo`: expands a compact brief (the output of the grill) into a gate-passing
// demo skeleton under `demos/<name>/`, then self-gates it.
//
// The emitted narration carries the `<!-- demo:todo -->` marker. That is deliberate:
// a fresh scaffold is a LEGAL stub (it passes the structural gate), and `demo:check`
// warns until the bodies are written — the same split plan 006 settled for forge,
// where readiness checks live in the full gate and never in the scaffold step.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { existsSync } from "node:fs";
import {
  scaffoldDemoSpec,
  validateDemoSpec,
  deriveDemo,
  runDemoGate,
  findStubs,
  DEMO_FILE,
  type DemoBrief,
} from "@objectcore/demo";

const root = join(import.meta.dir, "..");
const args = process.argv.slice(2);
const briefPath = args[0];
const force = args.includes("--force");

if (!briefPath) {
  console.error("Usage: bun run demo:scaffold <brief.json> [--force]");
  console.error("  brief: { name, title, brief, targetDurationSec?, audience[], repo, task, takeaway }");
  process.exit(1);
}

let brief: DemoBrief;
try {
  brief = JSON.parse(await readFile(briefPath, "utf8")) as DemoBrief;
} catch (e) {
  console.error(`✗ ${briefPath}: ${(e as Error).message}`);
  process.exit(1);
}

for (const key of ["name", "title", "brief", "repo", "task", "takeaway"] as const) {
  if (typeof brief[key] !== "string" || !brief[key].trim()) {
    console.error(`✗ brief.${key} is required and must be a non-empty string`);
    process.exit(1);
  }
}
if (!Array.isArray(brief.audience) || brief.audience.length === 0) {
  console.error("✗ brief.audience must list at least one persona ({ id, title, cares })");
  process.exit(1);
}

const spec = scaffoldDemoSpec(brief);

const schemaIssues = validateDemoSpec(spec).filter((i) => i.level === "error");
if (schemaIssues.length) {
  for (const i of schemaIssues) console.error(`✗ ${i.path ? `${i.path}: ` : ""}${i.message}`);
  process.exit(1);
}

const result = runDemoGate(deriveDemo(spec));
if (!result.ok) {
  console.error("✗ the scaffolded skeleton does not pass its own gate — this is an engine bug:");
  for (const i of result.issues.filter((i) => i.level === "error")) {
    console.error(`    ${i.path ? `${i.path}: ` : ""}${i.message}`);
  }
  process.exit(1);
}

const dir = join(root, "demos", spec.name);
const file = join(dir, DEMO_FILE);
if (existsSync(file) && !force) {
  console.error(`✗ ${relative(root, file)} already exists (pass --force to overwrite)`);
  process.exit(1);
}

await mkdir(join(dir, "evals"), { recursive: true });
await writeFile(file, `${JSON.stringify(spec, null, 2)}\n`, "utf8");

const evalsFile = join(dir, "evals", "demo.json");
if (!existsSync(evalsFile) || force) {
  await writeFile(
    evalsFile,
    `${JSON.stringify({
      cases: [
        { question: "Could an attendee retell the core story to a colleague a week later?", expect: "pass" },
        { question: "Is the agent's actual work visible while it runs, rather than summarized afterwards?", expect: "pass" },
        { question: "Does this read as a vendor pitch with no transferable takeaway?", expect: "fail" },
      ],
    }, null, 2)}\n`,
    "utf8",
  );
}

console.log(`✓ scaffolded → ${relative(root, dir)} (gate-green skeleton)`);
console.log(`  ${findStubs(spec).length} body/bodies to write — \`demo:check\` will keep warning until they are.`);
for (const w of result.issues.filter((i) => i.level === "warning")) {
  console.log(`  ! ${w.path ? `${w.path}: ` : ""}${w.message}`);
}
