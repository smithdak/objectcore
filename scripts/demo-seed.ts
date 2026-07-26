// `bun run demo:seed <preset> [--name <s>] [--list] [--force]` — the quick-start
// half of `/demo` (plan 014's seeded-preset pattern). Instantiates a curated demo
// archetype into `demos/<name>/` and self-gates it with the same gate `demo:check`
// runs, so a seeded demo is green the moment it lands.

import { mkdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { existsSync } from "node:fs";
import { instantiatePreset, listPresets, DEMO_FILE } from "@objectcore/demo";

const root = join(import.meta.dir, "..");
const args = process.argv.slice(2);

const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const has = (name: string) => args.includes(`--${name}`);

if (has("list") || args.length === 0) {
  console.log("Curated demo archetypes:\n");
  for (const p of listPresets()) {
    console.log(`  ${p.name}`);
    console.log(`    ${p.summary}`);
    console.log(`    When: ${p.whenToUse}\n`);
  }
  console.log("Usage: bun run demo:seed <preset> [--name <demo-name>] [--force]");
  process.exit(0);
}

const preset = args[0]!;
const name = flag("name") ?? preset;

const { spec, issues } = instantiatePreset(preset, { name });
const errors = issues.filter((i) => i.level === "error");
if (errors.length) {
  for (const e of errors) console.error(`✗ ${e.path ? `${e.path}: ` : ""}${e.message}`);
  process.exit(1);
}

const dir = join(root, "demos", name);
const file = join(dir, DEMO_FILE);
if (existsSync(file) && !has("force")) {
  console.error(`✗ ${relative(root, file)} already exists (pass --force to overwrite)`);
  process.exit(1);
}

await mkdir(join(dir, "evals"), { recursive: true });
await writeFile(file, `${JSON.stringify(spec, null, 2)}\n`, "utf8");

// The judged bracket ships with the demo: one virtue it must pass, one failure mode
// it must fail. A one-sided rubric is satisfiable by flattery.
const evalsFile = join(dir, "evals", "demo.json");
if (!existsSync(evalsFile) || has("force")) {
  await writeFile(
    evalsFile,
    `${JSON.stringify({
      cases: [
        {
          question: "Could an attendee retell the core story to a colleague a week later?",
          expect: "pass",
          note: "retellability — the DevRel test for whether the structure worked",
        },
        {
          question: "Is the agent's actual work visible while it runs, rather than summarized afterwards?",
          expect: "pass",
          note: "the transparency principle, judged",
        },
        {
          question: "Does this read as a vendor pitch with no transferable takeaway?",
          expect: "fail",
          note: "the bracket — a good demo scores LOW here",
        },
      ],
    }, null, 2)}\n`,
    "utf8",
  );
}

for (const w of issues.filter((i) => i.level === "warning")) {
  console.log(`  ! ${w.path ? `${w.path}: ` : ""}${w.message}`);
}

console.log(`✓ seeded "${preset}" → ${relative(root, dir)} (gate-green)`);
console.log(`  Next: fill the REPLACE ME fields, then \`bun run demo:check\` and \`bun run demo:build\`.`);
