import { describe, expect, test } from "bun:test";
import { deriveDemo } from "../src/derive";
import {
  checkBudget, checkLiveSafety, checkStructure, countOscillations, runDemoGate,
} from "../src/gate";
import { checkEvidence, evidenceCoverage, proveEvidence } from "../src/evidence";
import { checkDeslop, fillerRatio } from "../src/deslop";
import { EvidenceSink } from "../src/sinks";
import { validDemo } from "./fixture";
import type { DemoSpec } from "../src/spec";

const gate = (mutate: (s: DemoSpec) => void = () => {}) => {
  const spec = validDemo();
  mutate(spec);
  return runDemoGate(deriveDemo(spec));
};

const errorMessages = (r: ReturnType<typeof runDemoGate>) =>
  r.issues.filter((i) => i.level === "error").map((i) => i.message);

describe("runDemoGate", () => {
  test("the fixture passes with no errors", () => {
    const r = gate();
    expect(errorMessages(r)).toEqual([]);
    expect(r.ok).toBe(true);
  });

  test("reports stats alongside the verdict", () => {
    expect(gate().stats).toEqual({
      beats: 8,
      liveBeats: 1,
      totalSec: 1080,
      targetSec: 1200,
      oscillations: 3,
      evidenceCoverage: 1,
      visualSec: 0,
    });
  });

  test("warnings never block", () => {
    // an unreferenced evidence item is a warning, not a failure
    const r = gate((s) => s.evidence.push({ id: "orphan", kind: "source", ref: "https://example.com" }));
    expect(r.ok).toBe(true);
    expect(r.issues.some((i) => i.level === "warning")).toBe(true);
  });
});

describe("structure gate (the Sparkline)", () => {
  test("requires an opener first", () => {
    const r = gate((s) => { s.beats[0]!.kind = "what-is"; });
    expect(errorMessages(r).join()).toContain("first beat must be an `opener`");
  });

  test("requires a close last", () => {
    const r = gate((s) => { s.beats.at(-1)!.kind = "tell-show-tell"; });
    expect(errorMessages(r).join()).toContain("last beat must be a `close`");
  });

  test("requires a STAR moment", () => {
    const r = gate((s) => { s.beats.find((b) => b.kind === "star")!.kind = "tell-show-tell"; });
    expect(errorMessages(r).join()).toContain("no `star` beat");
  });

  test("requires at least two what-is ⇄ what-could-be switches", () => {
    const r = gate((s) => {
      // collapse the second oscillation: both later poles become `what-is`
      s.beats.find((b) => b.id === "compounding")!.kind = "what-is";
      s.beats.find((b) => b.id === "what-changes")!.kind = "what-is";
    });
    expect(errorMessages(r).join()).toContain("switch(es)");
  });

  test("counts oscillations across intervening beats", () => {
    // the fixture's poles are what-is, what-could-be, what-is, what-could-be,
    // separated by an opener, a live demo, a star and a close
    expect(countOscillations(deriveDemo(validDemo()))).toBe(3);
  });

  test("warns about a persona no beat answers", () => {
    const spec = validDemo();
    spec.audience.push({ id: "cfo", title: "CFO", cares: "Payback period." });
    const issues = checkStructure(deriveDemo(spec));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.level).toBe("warning");
    expect(issues[0]!.message).toContain("CFO");
  });
});

describe("live-safety gate (the Devin lesson)", () => {
  test("a demo with no live beat fails", () => {
    const r = gate((s) => {
      const i = s.beats.findIndex((b) => b.kind === "live-demo");
      s.beats.splice(i, 1);
      // keep the budget honest so only the live check fires
      s.targetDurationSec = 660;
    });
    const errs = errorMessages(r);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain("no `live-demo` beat");
  });

  test("a live beat needs a checkpoint", () => {
    const r = gate((s) => { s.beats.find((b) => b.kind === "live-demo")!.live!.checkpoints = []; });
    expect(errorMessages(r).join()).toContain("human-in-the-loop checkpoint");
  });

  test("a live beat must declare its visible trace surfaces", () => {
    const r = gate((s) => { delete s.beats.find((b) => b.kind === "live-demo")!.live!.traceSurfaces; });
    expect(errorMessages(r).join()).toContain("visibly on screen");
  });

  test("warns when no live beat plans a recoverable failure", () => {
    const spec = validDemo();
    delete spec.beats.find((b) => b.kind === "live-demo")!.live!.expectedFailure;
    const issues = checkLiveSafety(deriveDemo(spec));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.level).toBe("warning");
    expect(issues[0]!.message).toContain("expectedFailure");
  });
});

describe("evidence gate (gate ≡ proof)", () => {
  test("an unbacked claim fails", () => {
    const r = gate((s) => { s.beats[1]!.claims![0]!.evidence = []; });
    expect(errorMessages(r).join()).toContain("unbacked claim — no evidence referenced");
  });

  test("a dangling evidence id fails", () => {
    const r = gate((s) => { s.beats[1]!.claims![0]!.evidence = ["nope"]; });
    expect(errorMessages(r).join()).toContain("unresolved evidence id(s): nope");
  });

  test("the appendix renders exactly the rows the gate measures", () => {
    const spec = validDemo();
    spec.beats[1]!.claims![0]!.evidence = [];
    const output = deriveDemo(spec);

    const entries = proveEvidence(output);
    const failing = entries.filter((e) => !e.pass);
    const errors = checkEvidence(output).filter((i) => i.level === "error");

    // one error per failing row — the gate is the proof, filtered
    expect(errors).toHaveLength(failing.length);

    const appendix = new EvidenceSink().emit(output)[0]!.content;
    for (const e of entries) expect(appendix).toContain(e.claim);
    expect(appendix).toContain("UNBACKED");
  });

  test("coverage is the backed share", () => {
    expect(evidenceCoverage(deriveDemo(validDemo()))).toBe(1);
    const spec = validDemo();
    spec.beats[1]!.claims![0]!.evidence = [];
    expect(evidenceCoverage(deriveDemo(spec))).toBeCloseTo(3 / 4, 10);
  });

  test("the JSON proof carries the same entries", () => {
    const output = deriveDemo(validDemo());
    const files = new EvidenceSink().emit(output);
    expect(files.map((f) => f.path)).toEqual(["evidence.md", "evidence-proof.json"]);
    const parsed = JSON.parse(files[1]!.content);
    expect(parsed.entries).toHaveLength(proveEvidence(output).length);
    expect(parsed.coverage).toBe(1);
  });
});

describe("de-slop lint", () => {
  test("a banned phrase fails", () => {
    const r = gate((s) => { s.beats[0]!.narration = "This is a game-changing, world-class platform."; });
    const errs = errorMessages(r);
    expect(errs.join()).toContain('banned filler phrase "game-changing"');
    expect(errs.join()).toContain('banned filler phrase "world-class"');
  });

  test("an unsupportable absolute fails", () => {
    const r = gate((s) => { s.beats[0]!.narration = "The agent never fails on a real repo."; });
    expect(errorMessages(r).join()).toContain('unsupportable absolute "never fails"');
  });

  test("a vague quantifier fails without metric evidence in that beat", () => {
    const r = gate((s) => { s.beats[2]!.narration = "This dramatically shortens review."; });
    expect(errorMessages(r).join()).toContain('"dramatically" asserts a magnitude');
  });

  test("the same quantifier passes in a beat that cites a metric", () => {
    // beat 1 ("today-hurts") cites `cycle-time`, a metric
    const r = gate((s) => { s.beats[1]!.narration = "Rework dramatically outweighs typing."; });
    expect(errorMessages(r)).toEqual([]);
  });

  test("matching is word-boundary anchored, not substring", () => {
    const spec = validDemo();
    // "adjust" contains "just"; "synergies" must not double-count as "synergy"
    spec.beats[0]!.narration = "We adjust the plan and readjust the budget.";
    expect(checkDeslop(deriveDemo(spec)).filter((i) => i.level === "error")).toEqual([]);
  });

  test("filler density warns above the budget but never blocks", () => {
    const spec = validDemo();
    spec.beats[0]!.narration = "This is really very truly simply just actually basically it.";
    const issues = checkDeslop(deriveDemo(spec));
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
    expect(issues.filter((i) => i.level === "warning")[0]!.message).toContain("filler density");
    expect(fillerRatio(deriveDemo(spec))).toBeGreaterThan(0.02);
  });

  test("the fixture is under the filler budget", () => {
    expect(fillerRatio(deriveDemo(validDemo()))).toBeLessThan(0.02);
  });
});

describe("budget gate", () => {
  test("passes inside tolerance", () => {
    expect(checkBudget(deriveDemo(validDemo()))).toEqual([]);
  });

  test("fails when the plan overruns the slot", () => {
    const spec = validDemo();
    spec.targetDurationSec = 600;
    const issues = checkBudget(deriveDemo(spec));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain("over the 600s slot");
  });

  test("fails when the plan underfills the slot", () => {
    const spec = validDemo();
    spec.targetDurationSec = 2400;
    expect(checkBudget(deriveDemo(spec))[0]!.message).toContain("under the 2400s slot");
  });

  test("tolerance is configurable", () => {
    const spec = validDemo();
    spec.targetDurationSec = 600;
    expect(checkBudget(deriveDemo(spec), 1)).toEqual([]);
  });
});
