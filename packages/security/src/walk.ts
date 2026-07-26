// The only module that scans a plugin directory's full file tree — mirrors
// registry-core's discipline of a single filesystem-scanning seam per package.

import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const EXCLUDED_DIRS = new Set(["node_modules", ".git", "dist"]);

/** Every file under `dir`, recursively, as paths relative to `dir` (POSIX `/`). */
export async function walkFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function recurse(current: string) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        await recurse(full);
      } else if (entry.isFile()) {
        out.push(relative(dir, full).split("\\").join("/"));
      }
    }
  }
  await recurse(dir);
  return out.sort();
}
