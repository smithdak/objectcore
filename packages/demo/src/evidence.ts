// The evidence PROOF — "verifiable, not asserted" as data. `proveEvidence` walks
// every claim in the derived demo and records what backs it; `checkEvidence` is
// nothing but the FAILING proof entries mapped to issues, so the gate can never
// disagree with the appendix the audience is handed. This is the plan-014
// `proof.ts` discipline (gate ≡ proof) applied to prose instead of contrast.
//
// It is also the plan's designated REUSABLE primitive: nothing here knows about
// slides, beats-as-narrative, or Slidev. It knows that assertions must resolve to
// registered backing, which is a shape any generated artifact can borrow.
// Pure; never throws.

import type { DemoOutput } from "./derive";
import { allClaims } from "./derive";
import type { DemoIssue } from "./schema";
import type { EvidenceItem } from "./spec";

/** One measured claim — a proof-table row. */
export interface EvidenceEntry {
  beatId: string;
  beatTitle: string;
  claim: string;
  /** Registry entries that resolved. */
  evidence: EvidenceItem[];
  /** Referenced ids that did not resolve. */
  missing: string[];
  /** Backed by at least one resolved item, with nothing dangling. */
  pass: boolean;
}

/** Measure every claim in the demo. Deterministic: beat order, then claim order. */
export function proveEvidence(output: DemoOutput): EvidenceEntry[] {
  return allClaims(output).map(({ beat, claim }) => ({
    beatId: beat.beat.id,
    beatTitle: beat.beat.title,
    claim: claim.text,
    evidence: claim.evidence,
    missing: claim.missing,
    pass: claim.evidence.length > 0 && claim.missing.length === 0,
  }));
}

/** The gate half: the failing proof entries, as issues. An unbacked claim is an
 *  ERROR — "substantive and verifiable" is the whole quality bar, so a demo that
 *  asserts something it cannot source does not ship. */
export function checkEvidence(output: DemoOutput): DemoIssue[] {
  const issues: DemoIssue[] = [];

  for (const entry of proveEvidence(output)) {
    if (entry.pass) continue;
    const why = entry.missing.length
      ? `unresolved evidence id(s): ${entry.missing.join(", ")}`
      : "no evidence referenced";
    issues.push({
      level: "error",
      path: `beats[${entry.beatId}].claims`,
      message: `unbacked claim — ${why} — "${truncate(entry.claim)}"`,
    });
  }

  // Dead registry entries are a warning, not a failure: they usually mean a claim
  // was cut and its backing was left behind, which is worth surfacing but never a
  // reason to block a demo whose every claim IS backed.
  for (const item of output.unusedEvidence) {
    issues.push({
      level: "warning",
      path: `evidence[${item.id}]`,
      message: `evidence "${item.id}" is never referenced by a claim`,
    });
  }

  return issues;
}

/** Share of claims that are backed — the headline number for the appendix and the
 *  graded gate score. 1 when there are no claims (vacuously true, and the structure
 *  gate is what objects to a demo that asserts nothing). */
export function evidenceCoverage(output: DemoOutput): number {
  const entries = proveEvidence(output);
  if (entries.length === 0) return 1;
  return entries.filter((e) => e.pass).length / entries.length;
}

function truncate(s: string, max = 80): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
