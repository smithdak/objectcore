import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveDemo } from "../src/derive";
import { MockDemoJudge, summarizeDemo, hasApiKey, DEFAULT_DEMO_JUDGE_MODEL } from "../src/judge";
import { loadDemoEvalSpec, runDemoEval } from "../src/evaluate";
import type { DemoEvalSpec } from "../src/evaluate";
import { validDemo } from "./fixture";

const summary = () => summarizeDemo(deriveDemo(validDemo()));

/** A judge that returns a fixed score, so the runner's logic is what's under test. */
const fixed = (score: number) =>
  new MockDemoJudge(() => ({ score, passed: score >= 0.6, reason: "fixed" }));

describe("summarizeDemo", () => {
  test("carries what a critic needs to judge", () => {
    const s = summary();
    expect(s).toContain("Demo \"agentic-delivery\"");
    expect(s).toContain("Principal architect, platform group");
    expect(s).toContain("[live-demo]");
    expect(s).toContain("backed by metric:");
    expect(s).toContain("planned failure:");
    expect(s).toContain("Takeaway:");
  });

  test("is deterministic — a judged result is about the demo, not the phrasing", () => {
    expect(summary()).toBe(summary());
  });

  test("shows an unbacked claim as backed by nothing", () => {
    const spec = validDemo();
    spec.beats[1]!.claims![0]!.evidence = [];
    expect(summarizeDemo(deriveDemo(spec))).toContain("[backed by nothing]");
  });
});

describe("judge port", () => {
  test("routes to the cheap classification tier by default", () => {
    expect(DEFAULT_DEMO_JUDGE_MODEL).toBe("claude-haiku-4-5");
  });

  test("hasApiKey reflects the environment", () => {
    expect(typeof hasApiKey()).toBe("boolean");
  });

  test("MockDemoJudge is deterministic and offline", async () => {
    const judge = new MockDemoJudge();
    const a = await judge.assess("Is the work visible while it happens?", summary());
    const b = await judge.assess("Is the work visible while it happens?", summary());
    expect(a).toEqual(b);
    expect(a.score).toBeGreaterThan(0);
  });
});

describe("runDemoEval", () => {
  const spec: DemoEvalSpec = {
    cases: [
      { question: "Could an attendee retell the core story?", expect: "pass" },
      { question: "Does this read as a vendor pitch?", expect: "fail" },
    ],
  };

  test("a high score passes an expect:pass case and fails an expect:fail case", async () => {
    const results = await runDemoEval(spec, summary(), fixed(0.9));
    expect(results.map((r) => r.passed)).toEqual([true, false]);
  });

  test("a low score inverts both — the bracket works in both directions", async () => {
    const results = await runDemoEval(spec, summary(), fixed(0.1));
    expect(results.map((r) => r.passed)).toEqual([false, true]);
  });

  test("respects a per-case threshold", async () => {
    const strict: DemoEvalSpec = {
      cases: [{ question: "Is it substantive?", expect: "pass", threshold: 0.95 }],
    };
    expect((await runDemoEval(strict, summary(), fixed(0.9)))[0]!.passed).toBe(false);
    expect((await runDemoEval(strict, summary(), fixed(0.96)))[0]!.passed).toBe(true);
  });

  test("reports the score and the reason, never a bare verdict", async () => {
    const r = (await runDemoEval(spec, summary(), fixed(0.9)))[0]!;
    expect(r.score).toBe(0.9);
    expect(r.detail).toContain("threshold 0.6");
    expect(r.detail).toContain("expected to pass");
    expect(r.detail).toContain("fixed");
  });
});

describe("loadDemoEvalSpec", () => {
  const write = async (content: string) => {
    const dir = await mkdtemp(join(tmpdir(), "demo-eval-"));
    await mkdir(join(dir, "evals"), { recursive: true });
    await writeFile(join(dir, "evals", "demo.json"), content);
    return dir;
  };

  test("absent is null, not a failure (unspecified ≠ broken)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "demo-eval-"));
    expect(await loadDemoEvalSpec(dir)).toBeNull();
  });

  test("loads a valid spec", async () => {
    const dir = await write(JSON.stringify({ cases: [{ question: "Substantive?", expect: "pass" }] }));
    expect((await loadDemoEvalSpec(dir))!.cases).toHaveLength(1);
  });

  test.each([
    ["{ not json", /demo.json/],
    ['{"cases":[]}', /at least one case/],
    ['{"cases":[{"question":"","expect":"pass"}]}', /non-empty string/],
    ['{"cases":[{"question":"ok","expect":"maybe"}]}', /"pass" or "fail"/],
  ])("a malformed spec throws loudly (%s)", async (content, pattern) => {
    const dir = await write(content);
    expect(loadDemoEvalSpec(dir)).rejects.toThrow(pattern);
  });
});
