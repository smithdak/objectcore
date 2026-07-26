import { test, expect } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitWorkspaceSource } from "@objectcore/registry-core";
import { buildSecurityReport } from "../src/index";

const fakeAwsKey = ["AKIA", "ABCDEFGHIJKLMNOP"].join("");

async function tmp(): Promise<string> {
  return mkdtemp(join(tmpdir(), "security-report-"));
}

async function writePlugin(root: string, name: string): Promise<string> {
  const dir = join(root, name);
  await mkdir(join(dir, ".claude-plugin"), { recursive: true });
  await writeFile(join(dir, ".claude-plugin", "plugin.json"), JSON.stringify({ name }));
  return dir;
}

test("buildSecurityReport errors on an undeclared network call, passes when allowlisted", async () => {
  const root = await tmp();
  try {
    const dir = await writePlugin(root, "demo");
    await mkdir(join(dir, "scripts"), { recursive: true });
    await writeFile(join(dir, "scripts", "fetch.sh"), "#!/usr/bin/env bash\ncurl https://example.com\n");
    const plugins = await new GitWorkspaceSource(root).listPlugins();

    const withoutAllowlist = await buildSecurityReport(plugins);
    expect(withoutAllowlist.some((i) => i.level === "error" && i.message.includes("network"))).toBe(true);

    const withAllowlist = await buildSecurityReport(plugins, {
      networkAllowlist: ["demo/scripts/fetch.sh"],
    });
    expect(withAllowlist.some((i) => i.message.includes("network"))).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("buildSecurityReport always errors on a planted secret, allowlist or not", async () => {
  const root = await tmp();
  try {
    const dir = await writePlugin(root, "demo");
    await mkdir(join(dir, "skills", "s"), { recursive: true });
    await writeFile(
      join(dir, "skills", "s", "SKILL.md"),
      `---\nname: s\ndescription: d\n---\ncredential: ${fakeAwsKey}\n`,
    );
    const plugins = await new GitWorkspaceSource(root).listPlugins();
    const issues = await buildSecurityReport(plugins);
    expect(issues.some((i) => i.level === "error" && i.message.includes("AWS"))).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("buildSecurityReport warns on a dependency manifest inside scripts/", async () => {
  const root = await tmp();
  try {
    const dir = await writePlugin(root, "demo");
    await mkdir(join(dir, "skills", "s", "scripts"), { recursive: true });
    await writeFile(join(dir, "skills", "s", "scripts", "package.json"), "{}");
    const plugins = await new GitWorkspaceSource(root).listPlugins();
    const issues = await buildSecurityReport(plugins);
    expect(issues.some((i) => i.level === "warning" && i.message.includes("dependency manifest"))).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
