// The seam — the pure invariant, the demo analogue of `deriveCatalog` and
// `deriveDesignSystem`. `deriveDemo(spec)` resolves a demo's internal references
// (persona ids, evidence ids) and its timeline, producing the ONE derived form every
// sink and every gate reads. No I/O: a `DemoSource` (sources.ts) loads the spec, a
// `DemoSink` (sinks.ts) serializes the output. Never write a second derivation path
// — the deck, the runbook, the evidence appendix, and the gate must all be views of
// this same resolution, or they will disagree on stage.
//
// Resolution vs. judgement, kept apart on purpose (the design engine's split):
// this module RESOLVES and reports what dangles; `gate.ts` decides whether the
// result is shippable. Pure; never throws.

import type { Beat, Claim, DemoSpec, EvidenceItem, Persona } from "./spec";
import type { DemoIssue } from "./schema";

/** A claim with its evidence registry entries resolved. `missing` holds ids that
 *  did not resolve — the evidence gate's input, and the reason an unsupported claim
 *  cannot quietly survive derivation. */
export interface DerivedClaim {
  text: string;
  evidence: EvidenceItem[];
  missing: string[];
}

/** A beat with its persona, claims, and place on the timeline resolved. */
export interface DerivedBeat {
  beat: Beat;
  /** 0-based position in the sequence. */
  index: number;
  /** Cumulative seconds before this beat starts, and when it ends. */
  startSec: number;
  endSec: number;
  persona?: Persona;
  claims: DerivedClaim[];
}

export interface DemoOutput {
  spec: DemoSpec;
  beats: DerivedBeat[];
  /** Sum of every beat's `durationSec`. Compared to `targetDurationSec` by the gate. */
  totalSec: number;
  /** Evidence items never referenced by any claim — carried so the gate can warn
   *  (dead evidence usually means a claim got cut and its backing was forgotten). */
  unusedEvidence: EvidenceItem[];
  /** Resolution problems: dangling persona/evidence ids. */
  issues: DemoIssue[];
}

export interface DeriveDemoOptions {
  /** Reserved for the brand/design-system context (P5). Present so sinks can take
   *  the derived output alone and never re-read the spec through a second path. */
  designSystem?: string;
}

/** Resolve a demo into the single derived form every sink and gate reads. Pure. */
export function deriveDemo(spec: DemoSpec, opts: DeriveDemoOptions = {}): DemoOutput {
  const issues: DemoIssue[] = [];

  const personas = new Map(spec.audience.map((p) => [p.id, p]));
  const evidence = new Map(spec.evidence.map((e) => [e.id, e]));
  const referenced = new Set<string>();

  let cursor = 0;
  const beats: DerivedBeat[] = spec.beats.map((beat, index) => {
    const startSec = cursor;
    cursor += beat.durationSec;

    let persona: Persona | undefined;
    if (beat.persona !== undefined) {
      persona = personas.get(beat.persona);
      if (!persona) {
        issues.push({
          level: "error",
          path: `beats[${index}].persona`,
          message: `unknown persona "${beat.persona}" (declared personas: ${[...personas.keys()].join(", ") || "none"})`,
        });
      }
    }

    const claims = (beat.claims ?? []).map((claim, ci) =>
      resolveClaim(claim, evidence, referenced, `beats[${index}].claims[${ci}]`, issues),
    );

    return { beat, index, startSec, endSec: cursor, persona, claims };
  });

  const unusedEvidence = spec.evidence.filter((e) => !referenced.has(e.id));

  void opts.designSystem; // reserved; kept in the signature so sinks stay single-source

  return { spec, beats, totalSec: cursor, unusedEvidence, issues };
}

function resolveClaim(
  claim: Claim,
  registry: Map<string, EvidenceItem>,
  referenced: Set<string>,
  path: string,
  issues: DemoIssue[],
): DerivedClaim {
  const resolved: EvidenceItem[] = [];
  const missing: string[] = [];

  for (const id of claim.evidence) {
    const item = registry.get(id);
    if (item) {
      resolved.push(item);
      referenced.add(id);
    } else {
      missing.push(id);
      issues.push({
        level: "error",
        path: `${path}.evidence`,
        message: `unknown evidence id "${id}"`,
      });
    }
  }

  return { text: claim.text, evidence: resolved, missing };
}

/** Every claim in the demo, flattened with its beat — the shape both the evidence
 *  proof and the de-slop lint want, computed once here rather than re-walked. */
export function allClaims(output: DemoOutput): Array<{ beat: DerivedBeat; claim: DerivedClaim }> {
  return output.beats.flatMap((beat) => beat.claims.map((claim) => ({ beat, claim })));
}
