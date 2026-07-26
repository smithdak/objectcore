import { test, expect } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitWorkspaceSource } from "@objectcore/registry-core";
import { collectComponents, validateComposition } from "../src/composition";

async function tmp(): Promise<string> {
  return mkdtemp(join(tmpdir(), "quality-composition-"));
}

async function writePlugin(root: string, name: string): Promise<string> {
  const dir = join(root, name);
  await mkdir(join(dir, ".claude-plugin"), { recursive: true });
  await writeFile(join(dir, ".claude-plugin", "plugin.json"), JSON.stringify({ name }, null, 2));
  return dir;
}

async function writeSkill(pluginDir: string, name: string, body: string, composes?: string) {
  const dir = join(pluginDir, "skills", name);
  await mkdir(dir, { recursive: true });
  const fm = composes
    ? `---\nname: ${name}\ndescription: d\ncomposes: ${composes}\n---\n`
    : `---\nname: ${name}\ndescription: d\n---\n`;
  await writeFile(join(dir, "SKILL.md"), fm + body);
}

test("validateComposition: same-plugin edge mentioned in body passes clean", async () => {
  const root = await tmp();
  try {
    const pluginDir = await writePlugin(root, "demo");
    await writeSkill(pluginDir, "a", "Runs a's-own step, then composes b.", "b");
    await writeSkill(pluginDir, "b", "Does b's own thing.");
    const plugins = await new GitWorkspaceSource(root).listPlugins();
    const components = await collectComponents(plugins);
    expect(validateComposition(components)).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("validateComposition: dangling target and self-reference both error", async () => {
  const root = await tmp();
  try {
    const pluginDir = await writePlugin(root, "demo");
    await writeSkill(pluginDir, "a", "mentions nothing.", "does-not-exist");
    await writeSkill(pluginDir, "b", "mentions b.", "b");
    const plugins = await new GitWorkspaceSource(root).listPlugins();
    const components = await collectComponents(plugins);
    const issues = validateComposition(components);
    expect(issues.some((i) => i.level === "error" && i.message.includes("does not exist"))).toBe(true);
    expect(issues.some((i) => i.level === "error" && i.message.includes("composes itself"))).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("validateComposition: unmentioned declaration warns (dead declaration)", async () => {
  const root = await tmp();
  try {
    const pluginDir = await writePlugin(root, "demo");
    await writeSkill(pluginDir, "a", "never mentions its target.", "b");
    await writeSkill(pluginDir, "b", "b's own body.");
    const plugins = await new GitWorkspaceSource(root).listPlugins();
    const components = await collectComponents(plugins);
    const issues = validateComposition(components);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.level).toBe("warning");
    expect(issues[0]!.message).toContain("dead declaration");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("validateComposition: cross-plugin edge errors unless allowlisted", async () => {
  const root = await tmp();
  try {
    const pluginA = await writePlugin(root, "plugin-a");
    const pluginB = await writePlugin(root, "plugin-b");
    await writeSkill(pluginA, "a", "composes plugin-b:b.", "plugin-b:b");
    await writeSkill(pluginB, "b", "b's own body.");
    const plugins = await new GitWorkspaceSource(root).listPlugins();
    const components = await collectComponents(plugins);

    const withoutAllowlist = validateComposition(components);
    expect(withoutAllowlist.some((i) => i.level === "error" && i.message.includes("crosses a plugin boundary"))).toBe(true);

    const withAllowlist = validateComposition(components, {
      compositionAllowlist: ["plugin-a -> plugin-b"],
    });
    expect(withAllowlist.some((i) => i.message.includes("crosses a plugin boundary"))).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
