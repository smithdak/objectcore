// `bun run check:quality` — the body-content quality gate (V-rules + composition
// edges, ported from skillsmith). Complements check:catalog's manifest/structure
// floor with a check over what's actually written inside a component's body.

import { join } from "node:path";
import { validateQuality } from "@objectcore/quality";
import { loadWorkspace } from "./_workspace";

const root = join(import.meta.dir, "..");
const { plugins, cfg } = await loadWorkspace(root);

const issues = await validateQuality(plugins, { ...cfg.quality, ...cfg.policy });
const errors = issues.filter((i) => i.level === "error");
const warnings = issues.filter((i) => i.level === "warning");

for (const i of warnings) console.warn(`[warn]  ${i.plugin ? i.plugin + ": " : ""}${i.message}`);
for (const i of errors) console.error(`[error] ${i.plugin ? i.plugin + ": " : ""}${i.message}`);

if (errors.length) {
  console.error(`\n✗ ${errors.length} quality error(s), ${warnings.length} warning(s).`);
  process.exit(1);
}

console.log(`✓ ${plugins.length} plugin(s) pass content quality checks (${warnings.length} warning(s)).`);
