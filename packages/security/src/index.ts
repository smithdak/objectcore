// @objectcore/security — the S-rules tier (ported from skillsmith): script
// inventory + transparency, undeclared network-call detection, secret scanning,
// and a dependency-manifest-in-scripts warning. Additive: never touches
// deriveCatalog; `writeSecurityInventory` emits a diagnostic build artifact, not a
// second catalog derivation.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { WorkspacePlugin } from "@objectcore/registry-core";
import { scanScripts, type ScriptEntry } from "./inventory";
import { scanSecrets } from "./secrets";
import { walkFiles } from "./walk";

export * from "./inventory";
export * from "./network";
export * from "./secrets";

export interface SecurityIssue {
  level: "error" | "warning";
  plugin?: string;
  message: string;
}

export interface SecurityConfig {
  /** `plugin` or `plugin/relative/path` entries permitted to touch the network. */
  networkAllowlist?: string[];
}

const TEXT_EXTENSIONS = new Set([
  ".md",
  ".json",
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".py",
  ".sh",
  ".bash",
  ".ps1",
  ".yml",
  ".yaml",
  ".toml",
  ".txt",
]);

function isTextFile(path: string): boolean {
  const dot = path.lastIndexOf(".");
  return dot !== -1 && TEXT_EXTENSIONS.has(path.slice(dot));
}

function isAllowlisted(entry: ScriptEntry, allowlist: Set<string>): boolean {
  return allowlist.has(entry.plugin) || allowlist.has(`${entry.plugin}/${entry.path}`);
}

/** S2: undeclared network-touching scripts, gated by policy.networkAllowlist. */
export function checkNetworkCalls(entries: ScriptEntry[], cfg?: SecurityConfig): SecurityIssue[] {
  const allowlist = new Set(cfg?.networkAllowlist ?? []);
  return entries
    .filter((e) => e.networkTouching && !isAllowlisted(e, allowlist))
    .map((e) => ({
      level: "error" as const,
      plugin: e.plugin,
      message: `${e.plugin}/${e.path}: touches the network (${e.networkPatterns.join(", ")}) and is not in policy.networkAllowlist`,
    }));
}

/** S4: secret scan across every file a plugin ships. */
export async function checkSecrets(plugins: WorkspacePlugin[]): Promise<SecurityIssue[]> {
  const issues: SecurityIssue[] = [];
  for (const plugin of plugins) {
    const files = await walkFiles(plugin.dir);
    for (const relPath of files) {
      if (!isTextFile(relPath)) continue;
      let raw: string;
      try {
        raw = await readFile(join(plugin.dir, relPath), "utf8");
      } catch {
        continue;
      }
      for (const finding of scanSecrets(raw, `${plugin.manifest.name}/${relPath}`)) {
        issues.push({ level: finding.level, plugin: plugin.manifest.name, message: finding.message });
      }
    }
  }
  return issues;
}

/** S7: a package.json/requirements.txt inside a `scripts/` dir means the bundle
 *  pulls third-party code at run time — audit before shipping. */
export async function checkDependencyManifests(plugins: WorkspacePlugin[]): Promise<SecurityIssue[]> {
  const issues: SecurityIssue[] = [];
  for (const plugin of plugins) {
    const files = await walkFiles(plugin.dir);
    for (const relPath of files) {
      const parts = relPath.split("/");
      const isInScripts = parts.includes("scripts");
      const base = parts[parts.length - 1];
      if (isInScripts && (base === "package.json" || base === "requirements.txt")) {
        issues.push({
          level: "warning",
          plugin: plugin.manifest.name,
          message: `${plugin.manifest.name}/${relPath}: a dependency manifest inside scripts/ pulls third-party code at run time — audit before shipping`,
        });
      }
    }
  }
  return issues;
}

/** Run every security check. */
export async function buildSecurityReport(
  plugins: WorkspacePlugin[],
  cfg?: SecurityConfig,
): Promise<SecurityIssue[]> {
  const entries = await scanScripts(plugins);
  return [
    ...checkNetworkCalls(entries, cfg),
    ...(await checkSecrets(plugins)),
    ...(await checkDependencyManifests(plugins)),
  ];
}

/** Emit `dist/security-inventory.json` — a diagnostic build artifact (gitignored),
 *  the "what will execute" transparency doc. Never a second catalog derivation. */
export async function writeSecurityInventory(plugins: WorkspacePlugin[], root: string): Promise<string> {
  const entries = await scanScripts(plugins);
  const outPath = join(root, "dist", "security-inventory.json");
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify({ scripts: entries }, null, 2) + "\n");
  return outPath;
}
