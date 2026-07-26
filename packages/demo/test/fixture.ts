// A single valid `DemoSpec` fixture, shared across the package's tests.
// It is deliberately a REAL, gate-passing demo (a Sparkline that oscillates twice,
// a live beat with a fallback + checkpoints + a deliberate recoverable failure,
// every claim backed by evidence) so that later phases' tests can mutate ONE field
// to prove exactly one gate fires. Returns a fresh deep copy every call.

import type { DemoSpec } from "../src/spec";

export function validDemo(): DemoSpec {
  return structuredClone({
    name: "agentic-delivery",
    title: "Agentic delivery, in the open",
    brief:
      "Show a principal-architect audience what agentic engineering does to a real " +
      "delivery pipeline, with the agent's reasoning visible the whole way.",
    targetDurationSec: 1200,
    audience: [
      {
        id: "principal-architect",
        title: "Principal architect, platform group",
        cares: "Whether this survives contact with a real codebase and a real review process.",
      },
      {
        id: "eng-director",
        title: "Engineering director",
        cares: "Cycle time and defect escape rate, not model benchmarks.",
      },
    ],
    evidence: [
      { id: "gate-run", kind: "artifact", ref: "dist/eval-evidence.json", note: "the gate's own structured output" },
      { id: "cycle-time", kind: "metric", ref: "metrics/eval-history.jsonl", note: "measured, not estimated" },
      { id: "transparency-rule", kind: "source", ref: "https://www.anthropic.com/engineering/building-effective-agents" },
      { id: "live-run", kind: "demo", ref: "demonstrated on stage in the live-refund beat" },
    ],
    beats: [
      {
        id: "cold-open",
        kind: "opener",
        title: "The pull request nobody read",
        persona: "principal-architect",
        durationSec: 60,
        narration:
          "We start with a pull request that shipped last quarter. Nine hundred lines, two approvals, " +
          "four minutes of review time. Everyone in this room has merged one of these.",
      },
      {
        id: "today-hurts",
        kind: "what-is",
        title: "Where the time actually goes",
        persona: "eng-director",
        durationSec: 120,
        narration: "Delivery time is dominated by review latency and rework, not by typing.",
        claims: [{ text: "Rework and review latency dominate our measured cycle time.", evidence: ["cycle-time"] }],
      },
      {
        id: "what-changes",
        kind: "what-could-be",
        title: "An agent that shows its work",
        durationSec: 120,
        narration:
          "The shift is not that a model writes code. It is that the work becomes inspectable while it happens.",
        claims: [
          {
            text: "Showing the agent's planning steps is a stated design principle, not a preference.",
            evidence: ["transparency-rule"],
          },
        ],
      },
      {
        id: "live-refund",
        kind: "live-demo",
        title: "Adding idempotent refunds, live",
        persona: "principal-architect",
        durationSec: 420,
        narration: "Real repo, real task, and you watch every tool call it makes.",
        claims: [{ text: "The gate blocks the change until its evals pass.", evidence: ["gate-run", "live-run"] }],
        live: {
          repo: "github.com/smithdak/objectcore",
          task: "Add refunds with idempotency, multi-currency handling, and an audit-log entry per refund.",
          fallback:
            "A recorded pass of the same task on a local branch, cued to the plan step, if the network dies.",
          checkpoints: [
            "Approve the plan before any file is written.",
            "Review the diff before the gate runs.",
            "Decide together whether the failing edge case ships or blocks.",
          ],
          expectedFailure:
            "The double-refund edge case is not covered on the first pass — let it fail the gate on stage and fix it.",
          traceSurfaces: ["the plan step list", "every tool call", "the subagent handoff", "the red gate output"],
        },
      },
      {
        id: "still-hard",
        kind: "what-is",
        title: "What it did not solve",
        persona: "eng-director",
        durationSec: 90,
        narration:
          "It did not remove the review. It moved the review earlier and made it cheaper to act on.",
      },
      {
        id: "compounding",
        kind: "what-could-be",
        title: "The part that compounds",
        durationSec: 120,
        narration: "Every failure the gate catches is written back as a lesson the next run reads.",
        claims: [{ text: "Gate failures are captured as durable, searchable lessons.", evidence: ["gate-run"] }],
      },
      {
        id: "the-moment",
        kind: "star",
        title: "The gate went red on stage, and that was the point",
        durationSec: 60,
        narration: "You saw it fail. That is the only reason you should believe the parts that passed.",
      },
      {
        id: "go-do-it",
        kind: "close",
        title: "Take the harness, not the demo",
        persona: "principal-architect",
        durationSec: 90,
        narration: "Everything you watched is checked in. Clone it on the way out.",
      },
    ],
    takeaway:
      "The CLAUDE.md, the subagent definitions, and the eval gate config used in this demo — " +
      "all checked in and runnable against your own repo.",
  } satisfies DemoSpec);
}
