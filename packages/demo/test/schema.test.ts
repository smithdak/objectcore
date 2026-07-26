import { describe, expect, test } from "bun:test";
import { validateDemoSpec, assertDemoSpec } from "../src/schema";
import { validDemo } from "./fixture";

/** Escape hatch for tests that deliberately write a field the type forbids —
 *  the schema exists to catch exactly what the compiler can't see at runtime. */
const mut = (v: unknown): Record<string, unknown> => v as Record<string, unknown>;

/** Error paths only — warnings are the gate's business, not the schema's. */
const errors = (spec: unknown) =>
  validateDemoSpec(spec).filter((i) => i.level === "error");

/** Assert exactly one error, anchored to a path, so a test can't pass by
 *  accidentally breaking something else in the fixture. */
function onlyErrorAt(spec: unknown, path: string): string {
  const found = errors(spec);
  expect(found.map((i) => `${i.path}: ${i.message}`)).toHaveLength(1);
  expect(found[0]!.path).toBe(path);
  return found[0]!.message;
}

describe("validateDemoSpec", () => {
  test("accepts the valid fixture", () => {
    expect(errors(validDemo())).toEqual([]);
  });

  test("rejects a non-object", () => {
    expect(errors(null)).toHaveLength(1);
    expect(errors([])).toHaveLength(1);
    expect(errors("a demo")).toHaveLength(1);
  });

  test("rejects an unknown top-level field (the typo guard)", () => {
    const spec = { ...validDemo(), duration: 1200 };
    expect(onlyErrorAt(spec, "duration")).toContain("unknown field");
  });

  test("rejects an unknown nested field", () => {
    const spec = validDemo();
    mut(spec.beats[0]).length = 60;
    onlyErrorAt(spec, "beats[0].length");
  });

  test("requires a kebab-case name", () => {
    const spec = { ...validDemo(), name: "Agentic Delivery" };
    expect(onlyErrorAt(spec, "name")).toContain("kebab-case");
  });

  test.each(["title", "brief", "takeaway"] as const)("requires a non-empty %s", (key) => {
    const spec = { ...validDemo(), [key]: "   " };
    onlyErrorAt(spec, key);
  });

  test("requires a positive finite targetDurationSec", () => {
    for (const bad of [0, -60, Number.NaN, "1200"]) {
      const spec = { ...validDemo(), targetDurationSec: bad };
      onlyErrorAt(spec, "targetDurationSec");
    }
  });

  test("requires at least one persona", () => {
    const spec = { ...validDemo(), audience: [] };
    onlyErrorAt(spec, "audience");
  });

  test("requires at least one beat", () => {
    const spec = { ...validDemo(), beats: [] };
    onlyErrorAt(spec, "beats");
  });

  test("rejects duplicate ids", () => {
    const spec = validDemo();
    spec.beats[1]!.id = spec.beats[0]!.id;
    expect(onlyErrorAt(spec, "beats")).toContain("duplicate id");

    const spec2 = validDemo();
    spec2.evidence[1]!.id = spec2.evidence[0]!.id;
    expect(onlyErrorAt(spec2, "evidence")).toContain("duplicate id");
  });

  test("rejects an unknown beat kind", () => {
    const spec = validDemo();
    mut(spec.beats[0]).kind = "intro";
    expect(onlyErrorAt(spec, "beats[0].kind")).toContain("must be one of");
  });

  test("rejects an unknown evidence kind", () => {
    const spec = validDemo();
    mut(spec.evidence[0]).kind = "vibes";
    expect(onlyErrorAt(spec, "evidence[0].kind")).toContain("must be one of");
  });

  test("requires claim evidence to be an array of ids", () => {
    const spec = validDemo();
    mut(spec.beats[1]!.claims![0]).evidence = "cycle-time";
    onlyErrorAt(spec, "beats[1].claims[0].evidence");
  });

  // The shape half of the live-safety rule; the gate owns the content half.
  test("a live-demo beat must declare `live`", () => {
    const spec = validDemo();
    const live = spec.beats.find((b) => b.kind === "live-demo")!;
    delete live.live;
    onlyErrorAt(spec, "beats[3].live");
  });

  test("`live` is rejected on a non-live beat", () => {
    const spec = validDemo();
    const donor = spec.beats.find((b) => b.kind === "live-demo")!;
    spec.beats[0]!.live = donor.live;
    expect(onlyErrorAt(spec, "beats[0].live")).toContain("only valid on a \"live-demo\" beat");
  });

  test.each(["repo", "task", "fallback"] as const)("a live beat requires %s", (key) => {
    const spec = validDemo();
    const live = spec.beats.find((b) => b.kind === "live-demo")!.live!;
    delete mut(live)[key];
    onlyErrorAt(spec, `beats[3].live.${key}`);
  });

  test("reports every problem at once rather than the first", () => {
    const spec = { ...validDemo(), name: "Not Kebab", title: "" };
    expect(errors(spec)).toHaveLength(2);
  });
});

describe("assertDemoSpec", () => {
  test("returns the spec when valid", () => {
    const spec = validDemo();
    expect(assertDemoSpec(spec)).toBe(spec);
  });

  test("throws listing every error", () => {
    const spec = { ...validDemo(), name: "Not Kebab", title: "" };
    expect(() => assertDemoSpec(spec)).toThrow(/invalid demo spec/);
    expect(() => assertDemoSpec(spec)).toThrow(/kebab-case/);
  });
});
