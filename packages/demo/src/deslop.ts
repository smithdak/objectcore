// The de-slop lint — the research brief's "explicit de-slop critic pass", made
// deterministic. The brief names "agent slop" (output that looks professional but
// lacks substance) as the enterprise risk of the whole category; a judged critic
// can catch its subtler forms (that's the advisory layer in P3), but the blatant
// forms are a closed-form text check, and only a deterministic check is safe to put
// in a gate.
//
// Three rules, in ascending subtlety:
//   1. BANNED phrases — marketing filler that carries no information at any density.
//   2. VAGUE QUANTIFIERS — allowed ONLY in a beat that cites `metric` evidence.
//      "significantly faster" is a claim when it has a number behind it and slop
//      when it doesn't; the spec already records which beats have numbers.
//   3. FILLER DENSITY — a soft ratio, warned not failed, because prose needs some.
//
// Word lists are DATA, checked in and editable, not regexes buried in logic — the
// same stance `platform.ts` takes toward the encoded platform surface.
// Pure; never throws.

import type { DemoOutput, DerivedBeat } from "./derive";
import type { DemoIssue } from "./schema";

/** Marketing filler with no informational content. Any occurrence fails.
 *  Keep entries as narrow as the actual cliché: the hyphenated "next-generation" is
 *  the marketing adjective, while the bare bigram "next generation" appears in
 *  ordinary prose ("the next generation of the codebase") and must not be flagged.
 *  A lint that fires on legitimate writing gets switched off, which is worse than
 *  no lint. */
export const BANNED_PHRASES: readonly string[] = [
  "game-changing", "game changing", "revolutionary", "cutting-edge", "cutting edge",
  "best-in-class", "best in class", "world-class", "state-of-the-art",
  "paradigm shift", "next-generation", "turnkey",
  "seamlessly", "effortlessly", "frictionless", "supercharge", "supercharged",
  "unlock the power", "harness the power", "leverage synergies", "synergy",
  "magical", "like magic", "10x developer", "rock star", "ninja",
  "robust and scalable", "enterprise-grade", "battle-tested",
];

/** Quantifiers that assert a magnitude without stating one. Permitted only in a
 *  beat backed by `metric` evidence — where the magnitude is actually on record. */
export const VAGUE_QUANTIFIERS: readonly string[] = [
  "dramatically", "significantly", "massively", "drastically", "substantially",
  "exponentially", "orders of magnitude", "vastly", "radically",
];

/** Absolutes a live demo cannot support. Any occurrence fails — these are the
 *  sentences that get a demo reverse-engineered by a skeptical room. */
export const UNSUPPORTED_ABSOLUTES: readonly string[] = [
  "never fails", "always works", "zero effort", "no effort", "fully autonomous",
  "completely eliminates", "100% accurate", "guaranteed to", "works every time",
];

/** Hedges and intensifiers. Cheap individually; a ratio problem in aggregate. */
export const FILLER_WORDS: readonly string[] = [
  "really", "very", "truly", "simply", "just", "actually", "basically",
  "essentially", "incredibly", "literally", "obviously", "clearly",
];

export interface DeslopOptions {
  /** Max share of filler words before warning. Default 0.02 (2 words in 100). */
  maxFillerRatio?: number;
}

/** Case-insensitive, word-boundary-anchored phrase search. Anchoring matters: a
 *  bare substring match flags "synergy" inside "synergies" twice and "just" inside
 *  "adjust" — a lint that cries wolf gets switched off, which is worse than no lint. */
function findPhrase(haystack: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}-])${escaped}([^\\p{L}\\p{N}-]|$)`, "iu").test(haystack);
}

function countWords(s: string): number {
  return (s.match(/[\p{L}\p{N}'’-]+/gu) ?? []).length;
}

function countFiller(s: string): number {
  let n = 0;
  for (const word of FILLER_WORDS) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    n += (s.match(new RegExp(`(^|[^\\p{L}\\p{N}-])${escaped}([^\\p{L}\\p{N}-]|$)`, "giu")) ?? []).length;
  }
  return n;
}

/** Every piece of prose in a beat that the audience actually hears or reads. */
function beatProse(b: DerivedBeat): Array<{ path: string; text: string }> {
  const out: Array<{ path: string; text: string }> = [
    { path: `beats[${b.beat.id}].title`, text: b.beat.title },
  ];
  if (b.beat.narration) out.push({ path: `beats[${b.beat.id}].narration`, text: b.beat.narration });
  b.claims.forEach((c, i) => out.push({ path: `beats[${b.beat.id}].claims[${i}]`, text: c.text }));
  return out;
}

/** Run the lint over a derived demo. Banned phrases and unsupported absolutes are
 *  errors; an unbacked vague quantifier is an error; filler density is a warning. */
export function checkDeslop(output: DemoOutput, opts: DeslopOptions = {}): DemoIssue[] {
  const issues: DemoIssue[] = [];
  const maxFillerRatio = opts.maxFillerRatio ?? 0.02;

  let words = 0;
  let filler = 0;

  const prose: Array<{ path: string; text: string }> = [
    { path: "title", text: output.spec.title },
    { path: "brief", text: output.spec.brief },
    { path: "takeaway", text: output.spec.takeaway },
  ];

  for (const b of output.beats) {
    // A beat "has numbers" when it cites metric-kind evidence — that is what
    // licenses a magnitude word in its prose.
    const hasMetric = b.claims.some((c) => c.evidence.some((e) => e.kind === "metric"));

    for (const piece of beatProse(b)) {
      for (const q of VAGUE_QUANTIFIERS) {
        if (findPhrase(piece.text, q) && !hasMetric) {
          issues.push({
            level: "error",
            path: piece.path,
            message: `"${q}" asserts a magnitude with no metric behind it — cite \`metric\` evidence in this beat or cut the word`,
          });
        }
      }
    }
    prose.push(...beatProse(b));
  }

  for (const piece of prose) {
    for (const phrase of BANNED_PHRASES) {
      if (findPhrase(piece.text, phrase)) {
        issues.push({
          level: "error",
          path: piece.path,
          message: `banned filler phrase "${phrase}" — say what it does instead`,
        });
      }
    }
    for (const phrase of UNSUPPORTED_ABSOLUTES) {
      if (findPhrase(piece.text, phrase)) {
        issues.push({
          level: "error",
          path: piece.path,
          message: `unsupportable absolute "${phrase}" — a live demo cannot back this`,
        });
      }
    }
    words += countWords(piece.text);
    filler += countFiller(piece.text);
  }

  const ratio = words === 0 ? 0 : filler / words;
  if (ratio > maxFillerRatio) {
    issues.push({
      level: "warning",
      message:
        `filler density ${(ratio * 100).toFixed(1)}% is above the ` +
        `${(maxFillerRatio * 100).toFixed(1)}% budget (${filler} of ${words} words)`,
    });
  }

  return issues;
}

/** The measured filler ratio, exposed for the graded score. */
export function fillerRatio(output: DemoOutput): number {
  let words = 0;
  let filler = 0;
  const texts = [
    output.spec.title, output.spec.brief, output.spec.takeaway,
    ...output.beats.flatMap((b) => beatProse(b).map((p) => p.text)),
  ];
  for (const t of texts) {
    words += countWords(t);
    filler += countFiller(t);
  }
  return words === 0 ? 0 : filler / words;
}
