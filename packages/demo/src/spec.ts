// The demo domain — the types a `/demo` grill produces and `deriveDemo` consumes.
//
// These are not free-form notes. Every field here exists because some downstream
// GATE reads it (see gate.ts), which is the whole architectural bet of plan 016:
// the research brief's quality rules ("show the trace", "have a fallback", "no
// unsupported claims", "leave a transferable takeaway") are encoded as REQUIRED
// STRUCTURE, so a demo that violates them fails a check rather than merely
// disappointing a room.
//
// Sourcing for the vocabulary (see plans/notes/016-demo-studio-research.md):
//   - `opener` / `star` / the what-is ⇄ what-could-be oscillation / `close`
//     come from Nancy Duarte's "Sparkline" analysis of iconic talks.
//   - `tell-show-tell` and the persona "so what?" anchoring come from the DevRel
//     demo micro-structure (limbic opener → so-what → tell-show-tell → value close).
//   - `LiveBeat`'s `fallback`/`checkpoints`/`expectedFailure`/`traceSurfaces` come
//     from the Devin-vs-Code-w/-Claude contrast: an opaque pre-recorded reel loses a
//     technical room, a real repo with a visible trace and a recoverable on-stage bug
//     wins it. Anthropic's own agent guidance states the rule directly: "Prioritize
//     transparency by explicitly showing the agent's planning steps."

/** The beat vocabulary. A demo is a SEQUENCE of these, and the structure gate
 *  reads the sequence — the kinds are not decoration. */
export const BEAT_KINDS = [
  /** The limbic opener: an emotionally engaging moment that primes memory. */
  "opener",
  /** The current painful reality (the "what is" pole of the Sparkline). */
  "what-is",
  /** What the new capability makes possible (the "what could be" pole). */
  "what-could-be",
  /** A live, observable agentic run against a real repo. Carries `live`. */
  "live-demo",
  /** The STAR moment — the single thing the room retells afterwards. */
  "star",
  /** A state-it / demonstrate-it / reinforce-it reinforcement loop. */
  "tell-show-tell",
  /** The value close / call to adventure. */
  "close",
] as const;

export type BeatKind = (typeof BEAT_KINDS)[number];

/** Where a beat's substance comes from. The evidence registry is what turns
 *  "verifiable claims" from an aspiration into a resolvable reference — the same
 *  move DTCG aliases make in the design engine. */
export const EVIDENCE_KINDS = [
  /** An external citation: a URL, paper, doc, or post. */
  "source",
  /** A measured number, with its provenance in `ref` (never a vibe). */
  "metric",
  /** Something checked in and inspectable: a file, a commit, a PR. */
  "artifact",
  /** Demonstrated live on stage during a `live-demo` beat. */
  "demo",
] as const;

export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/** One entry in the demo's evidence registry. Claims reference these by `id`;
 *  an unreferenced claim is what the evidence gate fails on. */
export interface EvidenceItem {
  /** kebab-case, unique within the spec. */
  id: string;
  kind: EvidenceKind;
  /** The pointer itself: a URL, a repo-relative path, a commit SHA, a metric source. */
  ref: string;
  note?: string;
}

/** An assertion made on stage. `evidence` lists `EvidenceItem` ids that back it —
 *  at least one, or the demo does not ship. */
export interface Claim {
  text: string;
  evidence: string[];
}

/** A person in the room. Every beat may anchor to one, and the structure gate
 *  checks that the audience is actually served rather than declared. */
export interface Persona {
  /** kebab-case, unique within the spec (e.g. `principal-architect`). */
  id: string;
  /** How they'd introduce themselves ("Principal architect, platform group"). */
  title: string;
  /** The "so what?" they silently apply to every beat. */
  cares: string;
}

/** The choreography of a live agentic run. Required on every `live-demo` beat —
 *  this is the safety net that lets the demo be genuinely live instead of a reel. */
export interface LiveBeat {
  /** A real repository. A scratch repo built to make the demo work is the failure mode. */
  repo: string;
  /** The non-trivial task the agent is given, in the words the operator will type. */
  task: string;
  /** The scripted safety net if the live path dies (recorded segment, local env, ...). */
  fallback: string;
  /** Human-in-the-loop pause points. Shown deliberately — they are a feature. */
  checkpoints: string[];
  /** The deliberate, recoverable failure to let happen on stage. Optional, but the
   *  brief's strongest credibility signal; the gate warns when no live beat has one. */
  expectedFailure?: string;
  /** What is VISIBLY on screen: planning steps, tool calls, subagent handoffs.
   *  The transparency requirement, made enumerable. */
  traceSurfaces?: string[];
}

/** A node in an architecture canvas (the animated "watch it assemble" beat). */
export interface CanvasNode {
  /** kebab-case, unique within the beat. */
  id: string;
  label: string;
  /** Optional layer/grouping; the layout is derived from it deterministically. */
  group?: string;
}

export interface CanvasEdge {
  from: string;
  to: string;
  label?: string;
}

/** The optional VISUAL treatment of a beat. Two forms, discriminated:
 *
 *   - `scene`  — a pre-rendered motion-graphics scene (a remocn/Remotion component
 *                name plus JSON props), for the cinematic frame: opener, transitions,
 *                B-roll, the closing card.
 *   - `canvas` — an architecture diagram that assembles on screen (nodes + edges);
 *                positions are DERIVED, never authored, so the layout is deterministic.
 *
 * A `live-demo` beat may NOT carry a visual, and the schema rejects it. That is the
 * Devin lesson encoded as a type constraint rather than a warning in a doc: rendering
 * the agentic run as video turns the substantive middle back into the opaque reel the
 * whole approach exists to avoid. Video frames the demo; it never replaces it. */
export type BeatVisual =
  | {
      kind: "scene";
      /** Component name, e.g. "TerminalSimulator". */
      scene: string;
      /** Props passed to the component. JSON only — never code or expressions;
       *  the determinism lint rejects `Math.random`/`Date.now` hiding in a string. */
      props?: Record<string, unknown>;
      transition?: "cut" | "fade" | "wipe" | "slide";
    }
  | {
      kind: "canvas";
      nodes: CanvasNode[];
      edges: CanvasEdge[];
    };

/** One beat of the demo. */
export interface Beat {
  /** kebab-case, unique within the spec. */
  id: string;
  kind: BeatKind;
  title: string;
  /** `Persona.id` whose "so what?" this beat answers. */
  persona?: string;
  /** Planned wall-clock seconds. The runtime-budget gate sums these. */
  durationSec: number;
  /** What is said. The de-slop lint reads this prose. */
  narration?: string;
  /** Assertions made in this beat, each backed by evidence ids. */
  claims?: Claim[];
  /** REQUIRED when `kind` is `live-demo`, forbidden otherwise. */
  live?: LiveBeat;
  /** Optional visual treatment. FORBIDDEN on a `live-demo` beat (see BeatVisual). */
  visual?: BeatVisual;
}

/** A complete demo. The unit `deriveDemo` turns into a deck, a runbook, an
 *  evidence appendix, and (P5) a storyboard. */
export interface DemoSpec {
  /** kebab-case; also the directory name under `demos/`. */
  name: string;
  title: string;
  /** The one-paragraph brief the demo was grilled out of. */
  brief: string;
  /** The slot length being designed for. The budget gate compares beat sums to this. */
  targetDurationSec: number;
  audience: Persona[];
  /** The evidence registry every claim resolves against. */
  evidence: EvidenceItem[];
  beats: Beat[];
  /** What the audience can walk away and USE — the CLAUDE.md, the subagent
   *  definitions, the harness. Required: a demo with no transferable takeaway is a
   *  vendor pitch, and the structure gate says so. */
  takeaway: string;
  /** Optional `design/<name>` system to style the deck with (plan 012/014 systems). */
  designSystem?: string;
}
