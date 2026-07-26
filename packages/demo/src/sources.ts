// Source adapters. The port is `DemoSource`: it loads a `DemoSpec` for the pure
// `deriveDemo` to consume — the analogue of registry-core's `CatalogSource` and
// design's `TokenSource`. `FileDemoSource` reads `demos/<name>/demo.json` off disk.
// Keeping I/O in the adapter leaves the engine pure and the input swappable (a
// future source that reads a grill transcript is just another `DemoSource`).

import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DemoSpec } from "./spec";
import { assertDemoSpec } from "./schema";

export interface DemoSource {
  load(): Promise<DemoSpec>;
}

export const DEMO_FILE = "demo.json";

/** Reads (and schema-asserts) `<dir>/demo.json`. */
export class FileDemoSource implements DemoSource {
  constructor(private readonly dir: string) {}

  async load(): Promise<DemoSpec> {
    const file = join(this.dir, DEMO_FILE);
    let raw: string;
    try {
      raw = await readFile(file, "utf8");
    } catch {
      throw new Error(`no ${DEMO_FILE} in ${this.dir}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      // Label the parse failure with the path — a gate error must name WHICH demo
      // is broken, never surface a bare SyntaxError.
      throw new Error(`${file}: ${(e as Error).message}`);
    }

    try {
      return assertDemoSpec(parsed);
    } catch (e) {
      throw new Error(`${file}: ${(e as Error).message}`);
    }
  }
}

/** Every demo directory under `root` (one subdir per demo, each with a `demo.json`),
 *  sorted for deterministic gate output. Missing root ⇒ no demos, not an error —
 *  a repo without demos must still pass `demo:check`. */
export async function listDemoDirs(root: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}
