// S1 analogue: a per-script inventory (path, interpreter, sha256, network-touching
// flag) — not a failure, an artifact. Surfaces "what will execute" so a consumer
// can audit a plugin's scripts before installing it, ported from skillsmith.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import type { WorkspacePlugin } from "@objectcore/registry-core";
import { detectNetworkCalls } from "./network";
import { walkFiles } from "./walk";

export interface ScriptEntry {
  plugin: string;
  /** Path relative to the plugin's own directory. */
  path: string;
  interpreter: string;
  sha256: string;
  networkTouching: boolean;
  networkPatterns: string[];
}

const SCRIPT_EXTENSIONS = new Set([".sh", ".bash", ".py", ".js", ".mjs", ".cjs", ".ts", ".ps1"]);

const EXTENSION_INTERPRETERS: Record<string, string> = {
  ".sh": "sh",
  ".bash": "bash",
  ".py": "python",
  ".js": "node",
  ".mjs": "node",
  ".cjs": "node",
  ".ts": "bun",
  ".ps1": "pwsh",
};

const SHEBANG = /^#!\s*(?:\/usr\/bin\/env\s+)?(\S+)/;

/** Interpreter from a shebang line if present, else an extension-based guess. */
export function detectInterpreter(path: string, firstLine?: string): string {
  const m = firstLine ? SHEBANG.exec(firstLine) : null;
  if (m) {
    const bin = m[1]!.split("/").pop()!;
    return bin;
  }
  return EXTENSION_INTERPRETERS[extname(path)] ?? "unknown";
}

/** Every script-shaped file a plugin ships, hashed and classified. */
export async function scanScripts(plugins: WorkspacePlugin[]): Promise<ScriptEntry[]> {
  const out: ScriptEntry[] = [];
  for (const plugin of plugins) {
    const files = await walkFiles(plugin.dir);
    for (const relPath of files) {
      if (!SCRIPT_EXTENSIONS.has(extname(relPath))) continue;
      const raw = await readFile(join(plugin.dir, relPath), "utf8");
      const firstLine = raw.split("\n", 1)[0] ?? "";
      const networkPatterns = detectNetworkCalls(raw);
      out.push({
        plugin: plugin.manifest.name,
        path: relPath,
        interpreter: detectInterpreter(relPath, firstLine),
        sha256: createHash("sha256").update(raw).digest("hex"),
        networkTouching: networkPatterns.length > 0,
        networkPatterns,
      });
    }
  }
  return out;
}
