// The demo-eval runner — the gate's judged layer, the analogue of @objectcore/eval's
// activation evals and design's `runDesignEval`. A per-demo `evals/demo.json` (yes/no
// quality cases) is scored by a `DemoJudge` against a textual summary of the DERIVED
// demo. A case passes when the judge's score crosses the case threshold AND that
// matches the case's `expect` — so a demo can be required to PASS "could an attendee
// retell this?" and FAIL "does this read as a vendor pitch?". That bracket is the
// point: a one-sided rubric is satisfiable by flattery.
//
// When no API key is present the caller SKIPS this layer (reported skipped, never
// silently passed), exactly like activation evals.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DemoJudge } from "./judge";

/** One judged quality case. */
export interface DemoEvalCase {
  /** A yes/no question, e.g. "Could an attendee retell the core story a week later?" */
  question: string;
  /** Whether the demo is expected to PASS or FAIL this question (the bracket). */
  expect: "pass" | "fail";
  /** Min judge score (0..1) counted as a pass (default 0.6). */
  threshold?: number;
  note?: string;
}

export interface DemoEvalSpec {
  cases: DemoEvalCase[];
}

export interface DemoEvalResult {
  name: string;
  passed: boolean;
  detail: string;
  /** Judge score (0..1) — feeds the near-miss signal, like the activation layer. */
  score: number;
}

export const DEMO_EVAL_FILE = join("evals", "demo.json");

const snippet = (s: string): string => (s.length > 60 ? `${s.slice(0, 57)}...` : s);

/** Read `<dir>/evals/demo.json`. Absent ⇒ null (unspecified, not a failure);
 *  malformed ⇒ throws, because a broken eval spec must be loud. */
export async function loadDemoEvalSpec(dir: string): Promise<DemoEvalSpec | null> {
  const file = join(dir, DEMO_EVAL_FILE);
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`${file}: ${(e as Error).message}`);
  }

  const spec = parsed as DemoEvalSpec;
  if (!spec || !Array.isArray(spec.cases) || spec.cases.length === 0) {
    throw new Error(`${file}: expected { cases: [...] } with at least one case`);
  }
  for (const [i, c] of spec.cases.entries()) {
    if (typeof c.question !== "string" || !c.question.trim()) {
      throw new Error(`${file}: cases[${i}].question must be a non-empty string`);
    }
    if (c.expect !== "pass" && c.expect !== "fail") {
      throw new Error(`${file}: cases[${i}].expect must be "pass" or "fail"`);
    }
  }
  return spec;
}

/** Score every case against a demo summary using the judge. */
export async function runDemoEval(
  spec: DemoEvalSpec,
  summary: string,
  judge: DemoJudge,
): Promise<DemoEvalResult[]> {
  const results: DemoEvalResult[] = [];

  for (const [i, c] of spec.cases.entries()) {
    const threshold = c.threshold ?? 0.6;
    const verdict = await judge.assess(c.question, summary);
    const scoredYes = verdict.score >= threshold;
    const passed = c.expect === "pass" ? scoredYes : !scoredYes;

    results.push({
      name: `case ${i + 1}: ${snippet(c.question)}`,
      passed,
      score: verdict.score,
      detail:
        `scored ${verdict.score.toFixed(2)} (threshold ${threshold}, expected to ${c.expect}) — ${verdict.reason}`,
    });
  }

  return results;
}
