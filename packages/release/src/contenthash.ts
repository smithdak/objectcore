// Version-guard content-hash — a backstop distinct from Changesets discipline
// (ported from skillsmith's version-guard). Changesets enforce a bump by
// CONVENTION (did someone author one); this catches the case where a plugin's
// shipped bytes changed but nobody bumped `version` in plugin.json — which means
// Claude Code silently keeps serving the old copy (installed plugins refresh by
// version, not content hash).
//
// Pure hashing only — no I/O, no git. The git edge (reading a base ref's tree,
// listing a plugin's current files) lives in scripts/check-versions.ts, mirroring
// this package's existing pure-engine/script-edge split.

import { createHash } from "node:crypto";

/** CRLF -> LF. The repo is LF-canonical; a Windows checkout must hash identically
 *  to a Linux one, or version-guard would false-positive on line-ending noise. */
export function normalizeForHash(content: string): string {
  return content.replace(/\r\n/g, "\n");
}

/** Strip the `"version"` field out of a plugin.json's content before hashing, so a
 *  version bump ALONE never counts as a content change (no chicken-and-egg: you'd
 *  otherwise have to bump the version to detect that you bumped the version). */
function stripVersionField(raw: string): string {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    delete obj.version;
    return JSON.stringify(obj);
  } catch {
    return raw; // not valid JSON — hash it verbatim, let other checks catch the shape error
  }
}

export interface FileContent {
  /** Path relative to the plugin's own directory (POSIX `/`). */
  path: string;
  content: string;
}

export interface HashTreeOpts {
  /** Strip `version` out of `.claude-plugin/plugin.json` before hashing. Default true. */
  excludeVersionField?: boolean;
}

/** A deterministic sha256 over a plugin's full file tree: sorted by path, CRLF-
 *  normalized, with plugin.json's `version` field excluded by default. */
export function hashPluginTree(files: FileContent[], opts: HashTreeOpts = {}): string {
  const excludeVersionField = opts.excludeVersionField ?? true;
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  const hash = createHash("sha256");
  for (const f of sorted) {
    const isManifest = excludeVersionField && f.path.endsWith(".claude-plugin/plugin.json");
    const content = normalizeForHash(isManifest ? stripVersionField(f.content) : f.content);
    hash.update(f.path);
    hash.update("\0");
    hash.update(content);
    hash.update("\0");
  }
  return hash.digest("hex");
}
