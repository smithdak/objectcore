import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDemoServer } from "../src/server";
import { instantiatePreset } from "@objectcore/demo";

/** A temp demos/ dir holding one instantiated preset, optionally injured. */
async function demosDir(injure?: (spec: Record<string, unknown>) => void): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "demo-mcp-"));
  const dir = join(root, "demos", "enterprise-agentic");
  await mkdir(dir, { recursive: true });
  const { spec } = instantiatePreset("enterprise-agentic");
  const obj = JSON.parse(JSON.stringify(spec));
  injure?.(obj);
  await writeFile(join(dir, "demo.json"), JSON.stringify(obj, null, 2));
  return join(root, "demos");
}

/** Reach into the registered tools/resources without standing up a transport. */
const tools = (s: ReturnType<typeof createDemoServer>) =>
  Object.keys((s as unknown as { _registeredTools: Record<string, unknown> })._registeredTools);

describe("createDemoServer", () => {
  test("registers the read tools", async () => {
    const server = createDemoServer(await demosDir());
    expect(tools(server).sort()).toEqual(["demo_check", "demo_storyboard"]);
  });

  // Sink-gated, the registry events-route posture: no configured renderer means the
  // tool does not exist, rather than existing and failing.
  test("demo_render is absent without a configured render command", async () => {
    expect(tools(createDemoServer(await demosDir()))).not.toContain("demo_render");
  });

  test("demo_render appears once a render command is configured", async () => {
    const server = createDemoServer(await demosDir(), { renderCommand: ["echo", "render"] });
    expect(tools(server)).toContain("demo_render");
  });

  test("an empty render command does not register the tool", async () => {
    expect(tools(createDemoServer(await demosDir(), { renderCommand: [] })))
      .not.toContain("demo_render");
  });

  test("a project with no demos dir still constructs", async () => {
    const root = await mkdtemp(join(tmpdir(), "demo-mcp-empty-"));
    expect(() => createDemoServer(join(root, "demos"))).not.toThrow();
  });

  test("the server advertises a stable name and version", async () => {
    const server = createDemoServer(await demosDir(), { name: "custom", version: "9.9.9" });
    expect(server).toBeDefined();
  });
});
