import { test, expect } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitWorkspaceSource } from "@objectcore/registry-core";
import { detectInterpreter, scanScripts } from "../src/inventory";

async function tmp(): Promise<string> {
  return mkdtemp(join(tmpdir(), "security-inventory-"));
}

test("detectInterpreter reads the shebang first, then falls back to extension", () => {
  expect(detectInterpreter("scripts/x.sh", "#!/usr/bin/env bash")).toBe("bash");
  expect(detectInterpreter("scripts/x.py", "#!/usr/bin/env python3")).toBe("python3");
  expect(detectInterpreter("scripts/x.sh")).toBe("sh");
  expect(detectInterpreter("scripts/x.py")).toBe("python");
  expect(detectInterpreter("scripts/x.ps1")).toBe("pwsh");
  expect(detectInterpreter("scripts/x.unknown")).toBe("unknown");
});

test("scanScripts hashes every script and flags network-touching ones", async () => {
  const root = await tmp();
  try {
    const dir = join(root, "demo");
    await mkdir(join(dir, ".claude-plugin"), { recursive: true });
    await writeFile(join(dir, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "demo" }));
    await mkdir(join(dir, "scripts"), { recursive: true });
    await writeFile(join(dir, "scripts", "clean.sh"), "#!/usr/bin/env bash\necho hi\n");
    await writeFile(join(dir, "scripts", "fetcher.py"), "#!/usr/bin/env python3\nimport requests\nrequests.get('https://example.com')\n");

    const plugins = await new GitWorkspaceSource(root).listPlugins();
    const entries = await scanScripts(plugins);
    expect(entries).toHaveLength(2);
    const clean = entries.find((e) => e.path.endsWith("clean.sh"))!;
    const fetcher = entries.find((e) => e.path.endsWith("fetcher.py"))!;
    expect(clean.networkTouching).toBe(false);
    expect(clean.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(fetcher.networkTouching).toBe(true);
    expect(fetcher.networkPatterns).toContain("requests.get/post");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
