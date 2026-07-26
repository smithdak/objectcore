import { describe, expect, test } from "bun:test";
import { DEMO_PRESETS, getPreset, instantiatePreset, listPresets } from "../src/presets";
import { deriveDemo } from "../src/derive";
import { runDemoGate } from "../src/gate";
import { evidenceCoverage } from "../src/evidence";
import { SlidevSink, RunbookSink, EvidenceSink } from "../src/sinks";

describe("demo presets", () => {
  test("the inventory is non-empty and uniquely named", () => {
    const names = DEMO_PRESETS.map((p) => p.name);
    expect(names.length).toBeGreaterThan(0);
    expect(new Set(names).size).toBe(names.length);
  });

  test("every preset carries a summary and a whenToUse (the choosing surface)", () => {
    for (const p of listPresets()) {
      expect(p.summary.length).toBeGreaterThan(20);
      expect(p.whenToUse.length).toBeGreaterThan(20);
    }
  });

  // THE curated claim, measured by the gate's own math rather than asserted in prose.
  test.each(DEMO_PRESETS.map((p) => p.name))("preset %s instantiates gate-green", (name) => {
    const { spec, issues } = instantiatePreset(name);
    const errors = issues.filter((i) => i.level === "error");
    expect(errors.map((e) => `${e.path}: ${e.message}`)).toEqual([]);
    expect(spec.name).toBe(name);
  });

  test.each(DEMO_PRESETS.map((p) => p.name))("preset %s backs every claim it makes", (name) => {
    const { spec } = instantiatePreset(name);
    expect(evidenceCoverage(deriveDemo(spec))).toBe(1);
  });

  test.each(DEMO_PRESETS.map((p) => p.name))("preset %s plans a recoverable failure", (name) => {
    // The strongest credibility signal available — an archetype that skipped it
    // would be teaching the wrong lesson by example.
    const { spec } = instantiatePreset(name);
    const live = spec.beats.filter((b) => b.kind === "live-demo");
    expect(live.length).toBeGreaterThan(0);
    expect(live.some((b) => Boolean(b.live!.expectedFailure))).toBe(true);
  });

  test.each(DEMO_PRESETS.map((p) => p.name))("preset %s renders every artifact", (name) => {
    const output = deriveDemo(instantiatePreset(name).spec);
    for (const sink of [new SlidevSink(), new RunbookSink(), new EvidenceSink()]) {
      for (const file of sink.emit(output)) {
        expect(file.content.length).toBeGreaterThan(200);
      }
    }
  });

  test("renaming on instantiation keeps it gate-green", () => {
    const { spec, issues } = instantiatePreset("enterprise-agentic", { name: "acme-kickoff" });
    expect(spec.name).toBe("acme-kickoff");
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
  });

  test("an unknown preset is an issue, not a throw", () => {
    const { issues } = instantiatePreset("nope");
    expect(issues[0]!.message).toContain('unknown preset "nope"');
    expect(issues[0]!.message).toContain("enterprise-agentic");
  });

  test("instantiation is a copy — mutating it cannot corrupt the preset", () => {
    const first = instantiatePreset("enterprise-agentic").spec;
    first.beats[0]!.title = "mutated";
    expect(getPreset("enterprise-agentic")!.spec.beats[0]!.title).not.toBe("mutated");
    expect(runDemoGate(deriveDemo(instantiatePreset("enterprise-agentic").spec)).ok).toBe(true);
  });
});
