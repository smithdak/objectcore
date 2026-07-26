// `bun run check:versions` — the independent version-guard content-hash backstop
// (ported from skillsmith's version-guard), distinct from Changesets discipline.
// Changesets enforce a bump by CONVENTION (did someone author a changeset file);
// this compares a plugin's actual committed bytes against a base ref and fails if
// content moved without `version` moving too — Claude Code refreshes installed
// plugins by version, not content hash, so silent drift here is a real bug class.
//
// Deliberately NOT part of `bun run check` (and not appended to it): this needs
// the base ref's tree available locally, which a shallow CI checkout doesn't have
// by default — the same constraint that keeps kb:verify out of the fast kb:check
// gate. Wire this into CI as its own step with `fetch-depth: 0` (or a depth deep
// enough to include the PR base), and/or the local pre-push hook.

import { join, relative, sep } from "node:path";
import { hashPluginTree, type FileContent } from "@objectcore/release";
import { fileAtRef, listFilesAtRef } from "./_release";
import { loadWorkspace } from "./_workspace";

const root = join(import.meta.dir, "..");
const baseRefFlag = process.argv.indexOf("--base-ref");
const { plugins, cfg } = await loadWorkspace(root);
const baseRef =
  (baseRefFlag !== -1 ? process.argv[baseRefFlag + 1] : undefined) ??
  cfg.policy?.versionGuard?.baseRef ??
  "main";

function toPosix(p: string): string {
  return p.split(sep).join("/");
}

function readManifestVersion(files: FileContent[]): string | undefined {
  const manifest = files.find((f) => f.path === ".claude-plugin/plugin.json");
  if (!manifest) return undefined;
  try {
    return (JSON.parse(manifest.content) as { version?: string }).version;
  } catch {
    return undefined;
  }
}

const errors: string[] = [];

for (const plugin of plugins) {
  const relDir = toPosix(relative(root, plugin.dir));

  const baseFiles = listFilesAtRef(root, baseRef, relDir);
  if (baseFiles.length === 0) {
    continue; // new plugin — no baseline to compare against, exempt
  }
  const currentFiles = listFilesAtRef(root, "HEAD", relDir);

  const toFileContent = (ref: string, paths: string[]): FileContent[] =>
    paths
      .map((p) => {
        const content = fileAtRef(root, ref, p);
        return content === null ? null : { path: p.slice(relDir.length + 1), content };
      })
      .filter((f): f is FileContent => f !== null);

  const baseContents = toFileContent(baseRef, baseFiles);
  const currentContents = toFileContent("HEAD", currentFiles);

  const baseHash = hashPluginTree(baseContents);
  const currentHash = hashPluginTree(currentContents);
  const baseVersion = readManifestVersion(baseContents);
  const currentVersion = readManifestVersion(currentContents);

  if (currentHash !== baseHash && currentVersion === baseVersion) {
    errors.push(
      `${plugin.manifest.name}: content changed since ${baseRef} but version is still ` +
        `"${currentVersion ?? "(none)"}" — add a changeset and bump the version.`,
    );
  }
}

for (const e of errors) console.error(`[error] ${e}`);

if (errors.length) {
  console.error(`\n✗ ${errors.length} plugin(s) shipped content changes without a version bump.`);
  process.exit(1);
}

console.log(`✓ ${plugins.length} plugin(s) checked against ${baseRef}; no unbumped content drift.`);
