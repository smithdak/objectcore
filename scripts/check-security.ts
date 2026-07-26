// `bun run check:security` — the security gate (S-rules, ported from skillsmith):
// script inventory + transparency, undeclared network-call detection, secret
// scanning, dependency-manifest-in-scripts warning. Also writes
// dist/security-inventory.json, the "what will execute" transparency doc.

import { join } from "node:path";
import { buildSecurityReport, writeSecurityInventory } from "@objectcore/security";
import { loadWorkspace } from "./_workspace";

const root = join(import.meta.dir, "..");
const { plugins, cfg } = await loadWorkspace(root);

const issues = await buildSecurityReport(plugins, cfg.policy);
const errors = issues.filter((i) => i.level === "error");
const warnings = issues.filter((i) => i.level === "warning");

for (const i of warnings) console.warn(`[warn]  ${i.plugin ? i.plugin + ": " : ""}${i.message}`);
for (const i of errors) console.error(`[error] ${i.plugin ? i.plugin + ": " : ""}${i.message}`);

const inventoryPath = await writeSecurityInventory(plugins, root);

if (errors.length) {
  console.error(`\n✗ ${errors.length} security error(s), ${warnings.length} warning(s).`);
  process.exit(1);
}

console.log(
  `✓ ${plugins.length} plugin(s) pass security checks (${warnings.length} warning(s)). Inventory: ${inventoryPath}`,
);
