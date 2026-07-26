// The judged half of the gate — the non-deterministic counterpart to gate.ts.
// gate.ts proves a demo is STRUCTURALLY sound, EVIDENCED, and SAFE to run live
// (deterministic). The judge asks what determinism cannot see: is this substantive,
// is it retellable, does it leave something transferable behind? Same ports+adapters
// shape as @objectcore/eval's Judge and design's DesignJudge: `MockDemoJudge` is
// deterministic/offline (tests, CI without a key); `AnthropicDemoJudge` is the real
// critic. Per the model-routing doctrine this is scoring/classification, not frontier
// prose, so it defaults to the cheap Haiku tier (override OBJECTCORE_JUDGE_MODEL).
// Structured output → always parses, and no numeric range keywords in the schema
// (the API rejects minimum/maximum on number types — see the KB gotcha).

import Anthropic from "@anthropic-ai/sdk";
import type { DemoOutput } from "./derive";
import { clock } from "./sinks";

/** One judged verdict. `score` is how strongly the honest answer to the QUESTION is
 *  "yes" for this demo (0 = clearly no, 1 = clearly yes) — NOT an overall quality
 *  score. The direction matters: evaluate.ts brackets a demo with expect:"fail"
 *  cases ("reads as a vendor pitch?") that must score LOW on a good demo. */
export interface DemoVerdict {
  score: number;
  passed: boolean;
  reason: string;
}

/** The judge port. Given a yes/no QUESTION and a textual summary of the derived
 *  demo, score how strongly the answer is YES. */
export interface DemoJudge {
  assess(question: string, summary: string): Promise<DemoVerdict>;
}

/** Demo judgment is scoring/classification — AGENTS.md routes that to cheap models. */
export const DEFAULT_DEMO_JUDGE_MODEL = "claude-haiku-4-5";

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

/** Render a derived demo to a compact, judge-readable summary. Pure and
 *  deterministic — the same text every run, so a judged result is attributable to
 *  the demo rather than to how it happened to be described. */
export function summarizeDemo(output: DemoOutput): string {
  const { spec } = output;
  const lines: string[] = [
    `Demo "${spec.name}" — ${spec.title}`,
    `Brief: ${spec.brief}`,
    `Slot: ${clock(spec.targetDurationSec)}; planned ${clock(output.totalSec)} across ${output.beats.length} beats.`,
    `Audience: ${spec.audience.map((p) => `${p.title} (cares: ${p.cares})`).join("; ")}`,
    "",
    "Beats:",
  ];

  for (const b of output.beats) {
    lines.push(`  ${b.index + 1}. [${b.beat.kind}] ${b.beat.title} (${clock(b.beat.durationSec)})`);
    if (b.beat.narration) lines.push(`     says: ${b.beat.narration}`);
    for (const c of b.claims) {
      const refs = c.evidence.map((e) => `${e.kind}:${e.ref}`).join(", ");
      lines.push(`     claims: ${c.text} [backed by ${refs || "nothing"}]`);
    }
    if (b.beat.live) {
      lines.push(
        `     live on ${b.beat.live.repo}: ${b.beat.live.task}`,
        `     visible: ${(b.beat.live.traceSurfaces ?? []).join(", ") || "nothing declared"}`,
        `     checkpoints: ${b.beat.live.checkpoints.join(" | ") || "none"}`,
      );
      if (b.beat.live.expectedFailure) lines.push(`     planned failure: ${b.beat.live.expectedFailure}`);
    }
  }

  lines.push("", `Takeaway: ${spec.takeaway}`);
  return lines.join("\n");
}

const tokenize = (s: string): string[] => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];

/** Deterministic, offline judge. Default heuristic: keyword overlap between the
 *  question and the summary. Tests can inject a fixed verdict function for control. */
export class MockDemoJudge implements DemoJudge {
  constructor(private readonly fn?: (question: string, summary: string) => DemoVerdict) {}

  async assess(question: string, summary: string): Promise<DemoVerdict> {
    if (this.fn) return this.fn(question, summary);
    const want = new Set(tokenize(question));
    const have = new Set(tokenize(summary));
    let overlap = 0;
    for (const t of want) if (have.has(t)) overlap++;
    const score = overlap / Math.max(1, want.size);
    return { score, passed: score >= 0.4, reason: `keyword overlap ${overlap}/${want.size}` };
  }
}

const VERDICT_SCHEMA = {
  type: "object",
  properties: {
    score: {
      type: "number",
      description:
        "0..1 — how strongly the honest answer to the QUESTION is YES for this demo " +
        "(0 = clearly no, 1 = clearly yes). Score the answer to the question, NOT overall quality.",
    },
    passed: { type: "boolean", description: "true iff the answer to the question is clearly yes." },
    reason: { type: "string", description: "One sentence justifying the score." },
  },
  required: ["score", "passed", "reason"],
  additionalProperties: false,
} as const;

const SYSTEM = `You are a skeptical principal engineer in the audience for a technical demo. You are given a TEXTUAL SUMMARY of a planned demo — its audience, its beats, what is said, what is claimed and what backs each claim, what runs live and what is visible while it runs — and a single yes/no QUESTION about it.

Score from 0 to 1 how strongly the honest answer to that question is YES for this demo (0 = clearly no, 1 = clearly yes), set "passed" true only when the answer is clearly yes, and give a one-sentence reason. Score the ANSWER TO THE QUESTION, not overall quality: the question may probe a virtue the demo wants ("could an attendee retell this?" — a good demo scores high) or a failure mode it must avoid ("does this read as a vendor pitch?" — a good demo scores LOW, because the answer is no).

Judge only what the summary shows. You are hard to impress: a demo that asserts impact without evidence, hides what the agent is doing, or leaves the audience nothing they can use should score badly on the virtues.`;

export interface AnthropicDemoJudgeOpts {
  model?: string;
  apiKey?: string;
  client?: Anthropic;
}

/** Real critic: asks a Claude model to score the demo, constrained to a structured
 *  output so the verdict always parses. */
export class AnthropicDemoJudge implements DemoJudge {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(opts: AnthropicDemoJudgeOpts = {}) {
    this.client = opts.client ?? new Anthropic({ apiKey: opts.apiKey ?? process.env.ANTHROPIC_API_KEY });
    this.model = opts.model ?? process.env.OBJECTCORE_JUDGE_MODEL ?? DEFAULT_DEMO_JUDGE_MODEL;
  }

  async assess(question: string, summary: string): Promise<DemoVerdict> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 512,
      temperature: 0,
      system: SYSTEM,
      messages: [{ role: "user", content: `QUESTION: ${question}\n\nDEMO:\n${summary}` }],
      tools: [{ name: "verdict", description: "Return the verdict.", input_schema: VERDICT_SCHEMA as never }],
      tool_choice: { type: "tool", name: "verdict" },
    });

    const block = res.content.find((c) => c.type === "tool_use");
    if (!block || block.type !== "tool_use") {
      throw new Error("demo judge returned no verdict");
    }
    const v = block.input as DemoVerdict;
    return { score: v.score, passed: v.passed, reason: v.reason };
  }
}
