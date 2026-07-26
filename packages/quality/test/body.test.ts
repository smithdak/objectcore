import { test, expect } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitWorkspaceSource } from "@objectcore/registry-core";
import {
  checkBodyLength,
  checkDescriptionBudget,
  checkReferenceDepth,
  checkVoice,
  readComponentBodies,
} from "../src/body";

async function tmp(): Promise<string> {
  return mkdtemp(join(tmpdir(), "quality-"));
}

async function writeSkill(pluginDir: string, name: string, body: string, description = "d") {
  const dir = join(pluginDir, "skills", name);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n${body}`,
  );
}

async function writePlugin(root: string, name: string): Promise<string> {
  const dir = join(root, name);
  await mkdir(join(dir, ".claude-plugin"), { recursive: true });
  await writeFile(
    join(dir, ".claude-plugin", "plugin.json"),
    JSON.stringify({ name }, null, 2),
  );
  return dir;
}

test("checkBodyLength flags a body over the line/token ceiling", async () => {
  const root = await tmp();
  try {
    const pluginDir = await writePlugin(root, "demo");
    const longBody = Array.from({ length: 10 }, (_, i) => `line ${i}`).join("\n");
    await writeSkill(pluginDir, "s", longBody);
    const [plugins] = [await new GitWorkspaceSource(root).listPlugins()];
    const bodies = await readComponentBodies(plugins[0]!);
    expect(checkBodyLength(bodies[0]!, { maxBodyLines: 5, maxBodyTokens: 5000 })).toHaveLength(1);
    expect(checkBodyLength(bodies[0]!, { maxBodyLines: 500, maxBodyTokens: 5000 })).toHaveLength(0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("checkVoice flags first-person-future opening and reasoning-extraction phrasing", async () => {
  const root = await tmp();
  try {
    const pluginDir = await writePlugin(root, "demo");
    await writeSkill(pluginDir, "s", "I will now do the thing.\nThen show your reasoning.");
    const plugins = await new GitWorkspaceSource(root).listPlugins();
    const bodies = await readComponentBodies(plugins[0]!);
    const issues = checkVoice(bodies[0]!);
    expect(issues).toHaveLength(2);
    expect(issues.every((i) => i.level === "warning")).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("checkVoice passes clean imperative bodies", async () => {
  const root = await tmp();
  try {
    const pluginDir = await writePlugin(root, "demo");
    await writeSkill(pluginDir, "s", "Run the script and report the result.");
    const plugins = await new GitWorkspaceSource(root).listPlugins();
    const bodies = await readComponentBodies(plugins[0]!);
    expect(checkVoice(bodies[0]!)).toHaveLength(0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("checkDescriptionBudget flags an over-budget description", async () => {
  const root = await tmp();
  try {
    const pluginDir = await writePlugin(root, "demo");
    await writeSkill(pluginDir, "s", "body", "d".repeat(20));
    const plugins = await new GitWorkspaceSource(root).listPlugins();
    const bodies = await readComponentBodies(plugins[0]!);
    expect(checkDescriptionBudget(bodies[0]!, { maxDescriptionChars: 10 })).toHaveLength(1);
    expect(checkDescriptionBudget(bodies[0]!, { maxDescriptionChars: 100 })).toHaveLength(0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("checkReferenceDepth errors on a nested reference and warns on a chained one", async () => {
  const root = await tmp();
  try {
    const pluginDir = await writePlugin(root, "demo");
    const skillDir = join(pluginDir, "skills", "s");
    await mkdir(join(skillDir, "references"), { recursive: true });
    await mkdir(join(skillDir, "references", "nested"), { recursive: true });
    await writeFile(join(skillDir, "references", "nested", "deep.md"), "deep");
    await writeFile(join(skillDir, "references", "flat.md"), "See [more](references/other.md).");
    await writeFile(join(skillDir, "references", "other.md"), "plain content, no onward link");
    await writeFile(
      join(skillDir, "SKILL.md"),
      "---\nname: s\ndescription: d\n---\n" +
        "See [nested](references/nested/deep.md) and [flat](references/flat.md).",
    );
    const plugins = await new GitWorkspaceSource(root).listPlugins();
    const bodies = await readComponentBodies(plugins[0]!);
    const issues = await checkReferenceDepth(bodies[0]!);
    expect(issues.some((i) => i.level === "error" && i.message.includes("nested"))).toBe(true);
    expect(issues.some((i) => i.level === "warning" && i.message.includes("flat"))).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
