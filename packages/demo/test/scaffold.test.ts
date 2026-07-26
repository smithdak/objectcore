import { describe, expect, test } from "bun:test";
import { DEMO_TODO, findStubs, scaffoldDemoSpec } from "../src/scaffold";
import type { DemoBrief } from "../src/scaffold";
import { validateDemoSpec } from "../src/schema";
import { deriveDemo } from "../src/derive";
import { runDemoGate } from "../src/gate";

const brief = (over: Partial<DemoBrief> = {}): DemoBrief => ({
  name: "acme-kickoff",
  title: "Agentic delivery at Acme",
  brief: "Show the platform group what an agent does to our own delivery pipeline.",
  audience: [
    { id: "principal-architect", title: "Principal architect", cares: "Whether it survives our codebase." },
    { id: "delivery-lead", title: "Delivery lead", cares: "Whether it shortens the quarter." },
  ],
  repo: "github.com/acme/payments",
  task: "Add idempotent refunds with an audit-log entry per refund.",
  takeaway: "The instructions file and gate config used here, runnable on our repo.",
  ...over,
});

describe("scaffoldDemoSpec", () => {
  test("emits a schema-valid spec", () => {
    expect(validateDemoSpec(scaffoldDemoSpec(brief())).filter((i) => i.level === "error")).toEqual([]);
  });

  // Transparent-by-construction: the author starts from a passing structure.
  test("the skeleton passes the deterministic gate", () => {
    const result = runDemoGate(deriveDemo(scaffoldDemoSpec(brief())));
    expect(result.issues.filter((i) => i.level === "error")).toEqual([]);
    expect(result.ok).toBe(true);
  });

  test("lays out the full Sparkline with a live beat", () => {
    const spec = scaffoldDemoSpec(brief());
    const kinds = spec.beats.map((b) => b.kind);
    expect(kinds[0]).toBe("opener");
    expect(kinds.at(-1)).toBe("close");
    expect(kinds).toContain("star");
    expect(kinds.filter((k) => k === "live-demo")).toHaveLength(1);
    expect(runDemoGate(deriveDemo(spec)).stats.oscillations).toBeGreaterThanOrEqual(2);
  });

  test("durations sum EXACTLY to the requested slot", () => {
    for (const target of [600, 1200, 1800, 2700]) {
      const spec = scaffoldDemoSpec(brief({ targetDurationSec: target }));
      expect(spec.beats.reduce((n, b) => n + b.durationSec, 0)).toBe(target);
    }
  });

  test("gives the live beat the largest share", () => {
    const spec = scaffoldDemoSpec(brief());
    const live = spec.beats.find((b) => b.kind === "live-demo")!;
    for (const b of spec.beats) {
      if (b !== live) expect(live.durationSec).toBeGreaterThan(b.durationSec);
    }
  });

  test("pre-wires the live beat's safety net", () => {
    const live = scaffoldDemoSpec(brief()).beats.find((b) => b.kind === "live-demo")!.live!;
    expect(live.repo).toBe("github.com/acme/payments");
    expect(live.checkpoints.length).toBeGreaterThan(0);
    expect(live.traceSurfaces!.length).toBeGreaterThan(0);
  });

  test("invents no claims and no evidence", () => {
    const spec = scaffoldDemoSpec(brief());
    expect(spec.evidence).toEqual([]);
    expect(spec.beats.every((b) => b.claims === undefined)).toBe(true);
  });

  test("marks every unwritten body with the full stub marker", () => {
    const spec = scaffoldDemoSpec(brief());
    const stubs = findStubs(spec);
    expect(stubs.length).toBe(spec.beats.length + 1); // every narration + the fallback
    expect(spec.beats[0]!.narration).toContain(DEMO_TODO);
  });

  test("findStubs goes quiet once bodies are written", () => {
    const spec = scaffoldDemoSpec(brief());
    for (const b of spec.beats) b.narration = "Written.";
    spec.beats.find((b) => b.kind === "live-demo")!.live!.fallback = "Recorded run, cued.";
    expect(findStubs(spec)).toEqual([]);
  });

  test("a single-persona audience anchors every beat to that person", () => {
    const spec = scaffoldDemoSpec(brief({
      audience: [{ id: "cto", title: "CTO", cares: "Risk." }],
    }));
    expect(spec.beats.every((b) => b.persona === "cto")).toBe(true);
    expect(runDemoGate(deriveDemo(spec)).ok).toBe(true);
  });

  test("is deterministic", () => {
    expect(JSON.stringify(scaffoldDemoSpec(brief())))
      .toBe(JSON.stringify(scaffoldDemoSpec(brief())));
  });
});
