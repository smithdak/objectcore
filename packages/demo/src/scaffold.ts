// The generator — credible-by-construction. `scaffoldDemoSpec` expands a compact
// brief into a full `DemoSpec` whose SHAPE already satisfies the deterministic gate:
// the Sparkline is laid out (opener → two oscillations → live → STAR → close), the
// live beat carries a fallback, checkpoints, and declared trace surfaces, and the
// beat durations are allocated to the target slot. The design engine's
// `scaffoldDesignSystem` makes systems accessible-by-construction; this makes demos
// transparent-by-construction, so the author starts from a passing structure and
// spends their effort on substance instead of remembering the rules.
//
// What it deliberately does NOT invent: claims. A claim needs evidence, and the
// scaffolder has none — inventing a placeholder claim would either fail the evidence
// gate or, worse, teach the author that a claim is a thing you can fill in later.
// Narration comes out marked with the stub marker so an unfilled demo is VISIBLE
// (forge's `<!-- forge:todo -->` precedent), and `demo:check` warns on it.
// Pure; never throws.

import type { Beat, BeatKind, DemoSpec, Persona } from "./spec";

/** The visible marker a scaffolded-but-unwritten narration carries. Match the FULL
 *  literal when checking for it — a filled body may legitimately discuss the marker
 *  (the KB gotcha that bit the forge readiness check). */
export const DEMO_TODO = "<!-- demo:todo -->";

export interface DemoBrief {
  /** kebab-case; the demo's directory name. */
  name: string;
  title: string;
  brief: string;
  /** Slot length in seconds. Default 1200 (20 minutes). */
  targetDurationSec?: number;
  audience: Persona[];
  /** The REAL repository the live beat runs against. */
  repo: string;
  /** The non-trivial task the agent is given, as the operator will type it. */
  task: string;
  /** What the audience walks away able to use. */
  takeaway: string;
}

/** The scaffolded arc, with each beat's share of the slot. Weights sum to 1: the
 *  live beat gets the largest share because the substantive middle is the demo — the
 *  frame is not what the room came for. */
const ARC: Array<{ id: string; kind: BeatKind; title: string; weight: number; persona: 0 | 1 }> = [
  { id: "cold-open", kind: "opener", title: "Open on the moment they recognize", weight: 0.06, persona: 0 },
  { id: "today", kind: "what-is", title: "What today actually costs", weight: 0.12, persona: 1 },
  { id: "shift", kind: "what-could-be", title: "What changes", weight: 0.12, persona: 0 },
  { id: "live", kind: "live-demo", title: "Live, on a real repo", weight: 0.35, persona: 0 },
  { id: "still-hard", kind: "what-is", title: "What it did not solve", weight: 0.08, persona: 1 },
  { id: "compounds", kind: "what-could-be", title: "The part that compounds", weight: 0.12, persona: 0 },
  { id: "the-moment", kind: "star", title: "The moment worth retelling", weight: 0.05, persona: 0 },
  { id: "close", kind: "close", title: "Take this with you", weight: 0.10, persona: 1 },
];

const stub = (guidance: string): string => `${DEMO_TODO} ${guidance}`;

const GUIDANCE: Record<string, string> = {
  "cold-open":
    "One concrete moment the room has personally lived. Not a statistic, not a definition — a scene.",
  "today":
    "The current cost, in their units. Cite `metric` evidence if you want to say it is large.",
  "shift":
    "What becomes possible. Resist the product tour: describe the change, not the feature list.",
  "live":
    "Narrate what the agent is doing while it does it. Say out loud what you are watching.",
  "still-hard":
    "Name what this does not fix. Conceding the limit is what makes the rest believable.",
  "compounds":
    "Why the second run is cheaper than the first. This is the argument that survives the room.",
  "the-moment":
    "The single line you want repeated in a hallway tomorrow. Write it, do not improvise it.",
  "close":
    "Hand over the takeaway and say exactly what to do next.",
};

/** Allocate the slot across the arc: round each weight, then put the remainder on
 *  the live beat so the durations sum EXACTLY to the target (a scaffold that lands
 *  a few seconds off its own budget teaches the author to distrust the gate). */
function allocate(targetSec: number): number[] {
  const raw = ARC.map((b) => Math.max(1, Math.round(targetSec * b.weight)));
  const liveIndex = ARC.findIndex((b) => b.kind === "live-demo");
  const drift = targetSec - raw.reduce((n, v) => n + v, 0);
  raw[liveIndex] = Math.max(1, raw[liveIndex]! + drift);
  return raw;
}

/** Expand a brief into a gate-passing `DemoSpec` skeleton. */
export function scaffoldDemoSpec(brief: DemoBrief): DemoSpec {
  const targetDurationSec = brief.targetDurationSec ?? 1200;
  const durations = allocate(targetDurationSec);

  const beats: Beat[] = ARC.map((entry, i) => {
    // Personas alternate between the two the author declared; a one-persona
    // audience simply anchors every beat to that person.
    const persona = brief.audience[Math.min(entry.persona, brief.audience.length - 1)]?.id;

    const beat: Beat = {
      id: entry.id,
      kind: entry.kind,
      title: entry.title,
      durationSec: durations[i]!,
      narration: stub(GUIDANCE[entry.id]!),
    };
    if (persona) beat.persona = persona;

    if (entry.kind === "live-demo") {
      beat.live = {
        repo: brief.repo,
        task: brief.task,
        fallback: stub(
          "Record this exact run today and cue it to the plan step. Name who calls the cut.",
        ),
        checkpoints: [
          "Approve the plan before anything is written.",
          "Review the diff before it runs the gate.",
        ],
        traceSurfaces: ["the plan step list", "every tool call", "the gate output"],
      };
    }

    return beat;
  });

  return {
    name: brief.name,
    title: brief.title,
    brief: brief.brief,
    targetDurationSec,
    audience: brief.audience,
    // No evidence and no claims: the scaffolder has nothing to cite, and a
    // placeholder citation is worse than an empty registry.
    evidence: [],
    beats,
    takeaway: brief.takeaway,
  };
}

/** Every place a scaffolded demo still carries the stub marker — the ship-readiness
 *  signal. Matches the FULL marker literal, never the bare `demo:todo` token. */
export function findStubs(spec: DemoSpec): string[] {
  const found: string[] = [];
  spec.beats.forEach((b) => {
    if (b.narration?.includes(DEMO_TODO)) found.push(`beats[${b.id}].narration`);
    if (b.live?.fallback.includes(DEMO_TODO)) found.push(`beats[${b.id}].live.fallback`);
  });
  return found;
}
