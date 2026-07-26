import { describe, expect, test } from "bun:test";
import { allClaims, deriveDemo } from "../src/derive";
import { validDemo } from "./fixture";

describe("deriveDemo", () => {
  test("resolves the fixture with no issues", () => {
    expect(deriveDemo(validDemo()).issues).toEqual([]);
  });

  test("is pure — same input, byte-identical output", () => {
    const a = JSON.stringify(deriveDemo(validDemo()));
    const b = JSON.stringify(deriveDemo(validDemo()));
    expect(a).toBe(b);
  });

  test("lays beats on a contiguous timeline and totals them", () => {
    const spec = validDemo();
    const out = deriveDemo(spec);

    expect(out.beats[0]!.startSec).toBe(0);
    for (let i = 1; i < out.beats.length; i++) {
      expect(out.beats[i]!.startSec).toBe(out.beats[i - 1]!.endSec);
    }
    expect(out.totalSec).toBe(spec.beats.reduce((n, b) => n + b.durationSec, 0));
    expect(out.beats.at(-1)!.endSec).toBe(out.totalSec);
  });

  test("resolves personas and reports a dangling one", () => {
    const out = deriveDemo(validDemo());
    expect(out.beats[0]!.persona?.id).toBe("principal-architect");

    const spec = validDemo();
    spec.beats[0]!.persona = "cfo";
    const bad = deriveDemo(spec);
    expect(bad.beats[0]!.persona).toBeUndefined();
    expect(bad.issues).toHaveLength(1);
    expect(bad.issues[0]!.path).toBe("beats[0].persona");
    expect(bad.issues[0]!.message).toContain('unknown persona "cfo"');
  });

  test("resolves claim evidence and reports a dangling id in `missing`", () => {
    const out = deriveDemo(validDemo());
    const claim = out.beats[1]!.claims[0]!;
    expect(claim.evidence.map((e) => e.id)).toEqual(["cycle-time"]);
    expect(claim.missing).toEqual([]);

    const spec = validDemo();
    spec.beats[1]!.claims![0]!.evidence = ["cycle-time", "gut-feel"];
    const bad = deriveDemo(spec);
    const resolved = bad.beats[1]!.claims[0]!;
    expect(resolved.evidence.map((e) => e.id)).toEqual(["cycle-time"]);
    expect(resolved.missing).toEqual(["gut-feel"]);
    expect(bad.issues[0]!.message).toContain('unknown evidence id "gut-feel"');
  });

  test("reports evidence no claim references", () => {
    expect(deriveDemo(validDemo()).unusedEvidence).toEqual([]);

    const spec = validDemo();
    spec.evidence.push({ id: "orphan", kind: "source", ref: "https://example.com" });
    expect(deriveDemo(spec).unusedEvidence.map((e) => e.id)).toEqual(["orphan"]);
  });

  test("allClaims flattens every claim with its beat", () => {
    const spec = validDemo();
    const flat = allClaims(deriveDemo(spec));
    expect(flat).toHaveLength(spec.beats.reduce((n, b) => n + (b.claims?.length ?? 0), 0));
    expect(flat[0]!.beat.beat.id).toBe("today-hurts");
  });
});
