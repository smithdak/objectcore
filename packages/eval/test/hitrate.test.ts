import { test, expect } from "bun:test";
import { computeHitRates } from "../src/hitrate";
import type { EvalResult } from "../src/types";

function result(over: Partial<EvalResult>): EvalResult {
  return {
    suite: "activation",
    name: "case",
    passed: true,
    level: "error",
    detail: "",
    plugin: "demo",
    target: "skill-a",
    ...over,
  };
}

test("computeHitRates groups by (suite, plugin, target) and computes a rate", () => {
  const results = [
    result({ passed: true }),
    result({ passed: true }),
    result({ passed: false }),
  ];
  const entries = computeHitRates(results);
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({
    suite: "activation",
    plugin: "demo",
    target: "skill-a",
    total: 3,
    passed: 2,
  });
  expect(entries[0]!.hitRate).toBeCloseTo(2 / 3, 5);
});

test("computeHitRates flags belowThreshold using the configured threshold", () => {
  const results = [result({ passed: true }), result({ passed: false })];
  const belowDefault = computeHitRates(results); // 0.5 < 0.85 default
  expect(belowDefault[0]!.belowThreshold).toBe(true);
  const belowLow = computeHitRates(results, { threshold: 0.4 });
  expect(belowLow[0]!.belowThreshold).toBe(false);
});

test("computeHitRates excludes null-target (no-skill-expected) cases", () => {
  const results = [result({ target: null }), result({ target: null, passed: false })];
  expect(computeHitRates(results)).toEqual([]);
});

test("computeHitRates ignores non activation/delegation suites and missing plugin", () => {
  const results: EvalResult[] = [
    { suite: "output", name: "x", passed: true, level: "error", detail: "" },
    result({ plugin: undefined }),
  ];
  expect(computeHitRates(results)).toEqual([]);
});

test("computeHitRates never lets a majority-passing surface hide a real failure from the underlying gate", () => {
  // Hit-rate is informational: even a surface ABOVE threshold still had a real
  // per-case failure that the strict gate (routeExpecting) must have already
  // failed on its own. This test documents that computeHitRates does not
  // resurrect a passed/failed decision — it only aggregates what's given.
  const results = [result({ passed: true }), result({ passed: true }), result({ passed: false })];
  const entries = computeHitRates(results, { threshold: 0.5 });
  expect(entries[0]!.belowThreshold).toBe(false); // 0.667 >= 0.5
  expect(entries[0]!.passed).toBe(2);
  expect(entries[0]!.total).toBe(3); // the failing case is still counted, not hidden
});
