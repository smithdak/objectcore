import { test, expect } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitWorkspaceSource } from "@objectcore/registry-core";
import { validateContent, validateQuality } from "../src/index";

async function tmp(): Promise<string> {
  return mkdtemp(join(tmpdir(), "quality-validate-"));
}

async function writePlugin(root: string, name: string): Promise<string> {
  const dir = join(root, name);
  await mkdir(join(dir, ".claude-plugin"), { recursive: true });
  await writeFile(join(dir, ".claude-plugin", "plugin.json"), JSON.stringify({ name }, null, 2));
  return dir;
}

async function writeSkill(pluginDir: string, name: string, body: string) {
  const dir = join(pluginDir, "skills", name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: d\n---\n${body}`);
}

test("validateContent passes a clean plugin and flags a genuinely long one", async () => {
  const root = await tmp();
  try {
    const cleanDir = await writePlugin(root, "clean-plugin");
    await writeSkill(cleanDir, "s", "Run the thing and report the result.");
    const longDir = await writePlugin(root, "long-plugin");
    await writeSkill(longDir, "s", Array.from({ length: 600 }, (_, i) => `line ${i}`).join("\n"));

    const plugins = await new GitWorkspaceSource(root).listPlugins();
    const issues = await validateContent(plugins);
    expect(issues.some((i) => i.plugin === "clean-plugin")).toBe(false);
    expect(issues.some((i) => i.plugin === "long-plugin" && i.level === "error")).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("validateQuality folds in composition-edge errors alongside content rules", async () => {
  const root = await tmp();
  try {
    const dir = await writePlugin(root, "demo");
    await mkdir(join(dir, "skills", "a"), { recursive: true });
    await writeFile(
      join(dir, "skills", "a", "SKILL.md"),
      "---\nname: a\ndescription: d\ncomposes: missing-skill\n---\nbody",
    );
    const plugins = await new GitWorkspaceSource(root).listPlugins();
    const issues = await validateQuality(plugins);
    expect(issues.some((i) => i.message.includes("does not exist"))).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
