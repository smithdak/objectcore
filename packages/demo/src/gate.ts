// The deterministic gate floor — the demo analogue of registry-core's `validate.ts`
// and design's `gate.ts`. Everything here is a pure structural assertion over the
// derived demo. The judged "is it substantive and retellable" half is P3 and stays
// advisory; what is closed-form checkable is checked here, because only a
// deterministic check is safe to put in `bun run check`.
//
// The rules are the research brief's findings, encoded rather than described:
//   - STRUCTURE — Duarte's Sparkline: open on a hook, oscillate what-is ⇄
//     what-could-be, land a STAR moment, close on value.
//   - LIVE SAFETY — the Devin lesson. A demo with no live beat is a reel. A live
//     beat with no fallback is a gamble. A live beat with no visible trace is a
//     black box, which is the specific thing that lost that room.
//   - EVIDENCE (evidence.ts) and DE-SLOP (deslop.ts) — substance.
//   - BUDGET — the plan fits the slot it was written for.
//   - VIDEO (storyboard.ts) — the pre-rendered track never outweighs the live run,
//     and no scene smuggles in nondeterminism.
// Pure; never throws.

import type { DemoOutput, DerivedBeat } from "./derive";
import type { DemoIssue } from "./schema";
import { checkEvidence, evidenceCoverage } from "./evidence";
import { checkDeslop } from "./deslop";
import type { DeslopOptions } from "./deslop";
import { buildStoryboard, checkCanvases, checkStoryboardDeterminism, checkVideoBalance } from "./storyboard";
import type { StoryboardOptions } from "./storyboard";

export interface DemoGateOptions extends DeslopOptions, StoryboardOptions {
  /** Allowed drift between planned runtime and the target slot. Default 0.15. */
  durationTolerance?: number;
}

export interface DemoGateResult {
  ok: boolean;
  issues: DemoIssue[];
  /** Reported alongside the verdict so a caller can show WHY without re-deriving. */
  stats: {
    beats: number;
    liveBeats: number;
    totalSec: number;
    targetSec: number;
    oscillations: number;
    evidenceCoverage: number;
    /** Seconds of pre-rendered video vs seconds of live agentic run (P5). */
    visualSec: number;
  };
}

const kindsOf = (beats: DerivedBeat[]) => beats.map((b) => b.beat.kind);

/** Count switches between the two Sparkline poles, ignoring everything between
 *  them — an opener or a live demo sitting between a `what-is` and a
 *  `what-could-be` doesn't break the contrast, it carries it. */
export function countOscillations(output: DemoOutput): number {
  const poles = kindsOf(output.beats).filter((k) => k === "what-is" || k === "what-could-be");
  let switches = 0;
  for (let i = 1; i < poles.length; i++) {
    if (poles[i] !== poles[i - 1]) switches++;
  }
  return switches;
}

/** The narrative spine. */
export function checkStructure(output: DemoOutput): DemoIssue[] {
  const issues: DemoIssue[] = [];
  const beats = output.beats;
  const kinds = kindsOf(beats);

  if (kinds[0] !== "opener") {
    issues.push({
      level: "error",
      path: "beats[0]",
      message: `the first beat must be an \`opener\` (the limbic hook), not "${kinds[0]}"`,
    });
  }
  if (kinds.at(-1) !== "close") {
    issues.push({
      level: "error",
      path: `beats[${beats.length - 1}]`,
      message: `the last beat must be a \`close\` (the value close), not "${kinds.at(-1)}"`,
    });
  }
  if (!kinds.includes("star")) {
    issues.push({
      level: "error",
      path: "beats",
      message: "no `star` beat — a demo with no STAR moment has nothing to retell",
    });
  }

  const oscillations = countOscillations(output);
  if (oscillations < 2) {
    issues.push({
      level: "error",
      path: "beats",
      message:
        `only ${oscillations} what-is ⇄ what-could-be switch(es); the Sparkline needs at least 2 ` +
        "(contrast is what makes the arc, a single before/after is a product tour)",
    });
  }

  // A persona nobody's beat answers is a persona who sat through someone else's demo.
  const served = new Set(beats.map((b) => b.persona?.id).filter(Boolean));
  for (const p of output.spec.audience) {
    if (!served.has(p.id)) {
      issues.push({
        level: "warning",
        path: `audience[${p.id}]`,
        message: `no beat answers "${p.title}" — either anchor a beat to them or drop the persona`,
      });
    }
  }

  return issues;
}

/** The Devin lesson, as assertions. */
export function checkLiveSafety(output: DemoOutput): DemoIssue[] {
  const issues: DemoIssue[] = [];
  const live = output.beats.filter((b) => b.beat.kind === "live-demo");

  if (live.length === 0) {
    issues.push({
      level: "error",
      path: "beats",
      message:
        "no `live-demo` beat — a fully pre-recorded agentic demo is the documented failure mode " +
        "(an opaque reel is what a technical audience reverse-engineers)",
    });
    return issues;
  }

  let anyExpectedFailure = false;

  for (const b of live) {
    const l = b.beat.live!;
    const path = `beats[${b.beat.id}].live`;

    if (l.checkpoints.length === 0) {
      issues.push({
        level: "error",
        path: `${path}.checkpoints`,
        message: "a live beat needs at least one human-in-the-loop checkpoint (they are a feature to show, not hide)",
      });
    }
    if (!l.traceSurfaces || l.traceSurfaces.length === 0) {
      issues.push({
        level: "error",
        path: `${path}.traceSurfaces`,
        message:
          "a live beat must declare what is visibly on screen (planning steps, tool calls, handoffs) — " +
          "transparency is the differentiator, so it is required, not optional",
      });
    }
    if (l.expectedFailure) anyExpectedFailure = true;
  }

  if (!anyExpectedFailure) {
    issues.push({
      level: "warning",
      path: "beats",
      message:
        "no live beat declares an `expectedFailure` — a genuine, recoverable failure on stage is the " +
        "strongest credibility signal available; consider planning for one",
    });
  }

  return issues;
}

/** The plan fits the slot. */
export function checkBudget(output: DemoOutput, tolerance = 0.15): DemoIssue[] {
  const target = output.spec.targetDurationSec;
  const drift = Math.abs(output.totalSec - target) / target;
  if (drift <= tolerance) return [];
  const over = output.totalSec > target;
  return [{
    level: "error",
    path: "beats",
    message:
      `planned runtime ${Math.round(output.totalSec)}s is ${(drift * 100).toFixed(0)}% ` +
      `${over ? "over" : "under"} the ${target}s slot (tolerance ${(tolerance * 100).toFixed(0)}%)`,
  }];
}

/** The whole deterministic gate. `ok` is "no errors" — warnings are surfaced, never
 *  silently dropped and never blocking (the no-silent-caps stance). */
export function runDemoGate(output: DemoOutput, opts: DemoGateOptions = {}): DemoGateResult {
  const board = buildStoryboard(output, opts);
  const issues: DemoIssue[] = [
    ...output.issues,
    ...checkStructure(output),
    ...checkLiveSafety(output),
    ...checkEvidence(output),
    ...checkDeslop(output, opts),
    ...checkBudget(output, opts.durationTolerance),
    // The video track (P5): the same storyboard the sinks render is what gets gated.
    ...checkVideoBalance(board),
    ...checkStoryboardDeterminism(board),
    ...checkCanvases(board),
  ];

  return {
    ok: !issues.some((i) => i.level === "error"),
    issues,
    stats: {
      beats: output.beats.length,
      liveBeats: output.beats.filter((b) => b.beat.kind === "live-demo").length,
      totalSec: output.totalSec,
      targetSec: output.spec.targetDurationSec,
      oscillations: countOscillations(output),
      evidenceCoverage: evidenceCoverage(output),
      visualSec: board.visualSec,
    },
  };
}
