import { test, expect } from "bun:test";
import { hashPluginTree, normalizeForHash } from "../src/contenthash";

test("normalizeForHash collapses CRLF to LF", () => {
  expect(normalizeForHash("a\r\nb\r\n")).toBe("a\nb\n");
  expect(normalizeForHash("a\nb\n")).toBe("a\nb\n");
});

test("hashPluginTree is stable regardless of input file order", () => {
  const a = hashPluginTree([
    { path: "b.md", content: "B" },
    { path: "a.md", content: "A" },
  ]);
  const b = hashPluginTree([
    { path: "a.md", content: "A" },
    { path: "b.md", content: "B" },
  ]);
  expect(a).toBe(b);
});

test("hashPluginTree is CRLF-insensitive", () => {
  const lf = hashPluginTree([{ path: "a.md", content: "line1\nline2\n" }]);
  const crlf = hashPluginTree([{ path: "a.md", content: "line1\r\nline2\r\n" }]);
  expect(lf).toBe(crlf);
});

test("hashPluginTree excludes the plugin.json version field by default", () => {
  const v1 = hashPluginTree([
    { path: ".claude-plugin/plugin.json", content: '{"name":"demo","version":"0.1.0"}' },
  ]);
  const v2 = hashPluginTree([
    { path: ".claude-plugin/plugin.json", content: '{"name":"demo","version":"0.2.0"}' },
  ]);
  expect(v1).toBe(v2);
});

test("hashPluginTree still detects a real content change alongside a version bump", () => {
  const before = hashPluginTree([
    { path: ".claude-plugin/plugin.json", content: '{"name":"demo","version":"0.1.0"}' },
    { path: "skills/s/SKILL.md", content: "old body" },
  ]);
  const after = hashPluginTree([
    { path: ".claude-plugin/plugin.json", content: '{"name":"demo","version":"0.2.0"}' },
    { path: "skills/s/SKILL.md", content: "new body" },
  ]);
  expect(before).not.toBe(after);
});

test("hashPluginTree with excludeVersionField:false hashes the version too", () => {
  const v1 = hashPluginTree(
    [{ path: ".claude-plugin/plugin.json", content: '{"name":"demo","version":"0.1.0"}' }],
    { excludeVersionField: false },
  );
  const v2 = hashPluginTree(
    [{ path: ".claude-plugin/plugin.json", content: '{"name":"demo","version":"0.2.0"}' }],
    { excludeVersionField: false },
  );
  expect(v1).not.toBe(v2);
});
