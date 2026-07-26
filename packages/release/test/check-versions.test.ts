// Covers the version-guard's git edge (scripts/_release.ts: listFilesAtRef,
// fileAtRef) combined with the pure hasher (contenthash.ts) — the same logic
// scripts/check-versions.ts runs, exercised directly against a throwaway repo so
// it stays deterministic + offline like git-edge.test.ts.

import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { hashPluginTree, type FileContent } from "../src/contenthash";
import { fileAtRef, listFilesAtRef } from "../../../scripts/_release";

function run(cwd: string, args: string[]): void {
  execFileSync(
    "git",
    ["-c", "user.email=test@objectcore.test", "-c", "user.name=test", "-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false", "-c", "core.autocrlf=false", ...args],
    { cwd, encoding: "utf8" },
  );
}

function hashAtRef(repo: string, ref: string, relDir: string): { hash: string; version: string | undefined } | null {
  const paths = listFilesAtRef(repo, ref, relDir);
  if (paths.length === 0) return null;
  const files: FileContent[] = paths.map((p) => ({
    path: p.slice(relDir.length + 1),
    content: fileAtRef(repo, ref, p)!,
  }));
  const manifest = files.find((f) => f.path === ".claude-plugin/plugin.json");
  const version = manifest ? (JSON.parse(manifest.content) as { version?: string }).version : undefined;
  return { hash: hashPluginTree(files), version };
}

async function writeManifest(repo: string, plugin: string, version: string) {
  await mkdir(join(repo, "plugins", plugin, ".claude-plugin"), { recursive: true });
  await writeFile(
    join(repo, "plugins", plugin, ".claude-plugin", "plugin.json"),
    JSON.stringify({ name: plugin, version }, null, 2) + "\n",
  );
}

let repo: string;

beforeAll(async () => {
  repo = await mkdtemp(join(tmpdir(), "oc-version-guard-"));
  run(repo, ["init", "-q"]);
  await writeManifest(repo, "demo", "0.1.0");
  await writeFile(join(repo, "plugins", "demo", "skills-body.txt"), "v1\n");
  run(repo, ["add", "."]);
  run(repo, ["commit", "-q", "-m", "0.1.0"]);
  run(repo, ["branch", "-q", "-f", "base"]);
});

afterAll(async () => {
  await rm(repo, { recursive: true, force: true });
});

test("unchanged content, unchanged version -> hashes equal (pass)", () => {
  const base = hashAtRef(repo, "base", "plugins/demo")!;
  const head = hashAtRef(repo, "HEAD", "plugins/demo")!;
  expect(head.hash).toBe(base.hash);
  expect(head.version).toBe(base.version);
});

test("changed content, unchanged version -> hashes differ, version equal (fail scenario)", async () => {
  await writeFile(join(repo, "plugins", "demo", "skills-body.txt"), "v2 — a real content change\n");
  run(repo, ["add", "."]);
  run(repo, ["commit", "-q", "-m", "content change, no version bump"]);

  const base = hashAtRef(repo, "base", "plugins/demo")!;
  const head = hashAtRef(repo, "HEAD", "plugins/demo")!;
  expect(head.hash).not.toBe(base.hash);
  expect(head.version).toBe(base.version); // the violation: content moved, version didn't
});

test("changed content, bumped version -> hashes differ, version differs (pass)", async () => {
  await writeManifest(repo, "demo", "0.2.0");
  run(repo, ["add", "."]);
  run(repo, ["commit", "-q", "-m", "0.2.0"]);

  const base = hashAtRef(repo, "base", "plugins/demo")!;
  const head = hashAtRef(repo, "HEAD", "plugins/demo")!;
  expect(head.hash).not.toBe(base.hash);
  expect(head.version).not.toBe(base.version);
});

test("version-only edit (no other content change) -> hashes equal (pass, no chicken-and-egg)", async () => {
  await writeManifest(repo, "demo", "0.3.0");
  run(repo, ["add", "."]);
  run(repo, ["commit", "-q", "-m", "0.3.0, version only"]);

  const prev = hashAtRef(repo, "HEAD~1", "plugins/demo")!;
  const head = hashAtRef(repo, "HEAD", "plugins/demo")!;
  expect(head.hash).toBe(prev.hash); // content-only hash unaffected by the version field
  expect(head.version).not.toBe(prev.version);
});

test("a brand-new plugin absent at the base ref returns null (exempt, not a violation)", () => {
  expect(hashAtRef(repo, "base", "plugins/does-not-exist")).toBeNull();
});
