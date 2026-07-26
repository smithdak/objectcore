// Sink adapters. The port is `DemoSink`: it serializes a derived demo into an
// output artifact (the analogue of registry-core's `CatalogSink` and design's
// `TokenSink`). Every sink reads the SAME `DemoOutput`, which is what keeps the
// deck, the runbook, and the evidence appendix from drifting apart.
//
//   - `SlidevSink`  → `deck.md`, a Slidev presentation (Markdown; Slidev owns the
//                     PDF/PPTX/PNG export, so we never write a second exporter).
//   - `RunbookSink` → `runbook.md`, the operator's live-demo choreography: prep,
//                     cue sheet, the human-in-the-loop checkpoints, the fallback,
//                     and the deliberate recoverable failure. This artifact is the
//                     one that makes a demo genuinely live instead of a reel.
//
// The core stays hand-rolled + zero-dep: each adapter emits the format a downstream
// tool consumes; we never depend on the tool itself. Pure; never throws.

import type { DemoOutput, DerivedBeat } from "./derive";
import type { BeatKind } from "./spec";

export interface SinkFile {
  path: string;
  content: string;
}

export interface DemoSink {
  emit(output: DemoOutput): SinkFile[];
}

/** `615` → `10:15`. Cue sheets are read under stage lights; seconds are useless. */
export function clock(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec));
  const mm = Math.floor(sec / 60);
  const ss = sec % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

/** Human labels for the beat vocabulary — used in cue sheets and speaker notes so
 *  the operator can see the Sparkline they are walking, not just slide titles. */
const KIND_LABEL: Record<BeatKind, string> = {
  "opener": "Opener",
  "what-is": "What is",
  "what-could-be": "What could be",
  "live-demo": "LIVE",
  "star": "STAR moment",
  "tell-show-tell": "Tell–show–tell",
  "close": "Close",
};

const SLIDE_BREAK = "\n\n---\n\n";

/** Escape the YAML-ish scalars we write into Slidev frontmatter. */
function yamlString(v: string): string {
  return JSON.stringify(v);
}

// ── Slidev ───────────────────────────────────────────────────────────────────

export interface SlidevSinkOptions {
  /** Slidev theme name for the deck frontmatter. */
  theme?: string;
  path?: string;
}

/** Emits a Slidev deck. Claims are rendered WITH their evidence refs inline — the
 *  deck cannot show an assertion whose backing the evidence gate hasn't resolved. */
export class SlidevSink implements DemoSink {
  constructor(private readonly opts: SlidevSinkOptions = {}) {}

  emit(output: DemoOutput): SinkFile[] {
    const { spec } = output;
    const theme = this.opts.theme ?? "default";

    const head = [
      "---",
      `theme: ${theme}`,
      `title: ${yamlString(spec.title)}`,
      `info: ${yamlString(spec.brief)}`,
      "---",
      "",
      `# ${spec.title}`,
      "",
      spec.brief,
      "",
      `<!-- Derived by @objectcore/demo from ${spec.name}. Do not hand-edit: re-run \`bun run demo:build\`. -->`,
    ].join("\n");

    const slides = output.beats.map((b) => this.slide(b));

    const closing = [
      "# Take this with you",
      "",
      spec.takeaway,
      "",
      "<!--",
      "The transferable takeaway is a required field of the spec, not a courtesy slide:",
      "a demo that leaves nothing behind is a vendor pitch.",
      "-->",
    ].join("\n");

    return [{ path: this.opts.path ?? "deck.md", content: [head, ...slides, closing].join(SLIDE_BREAK) + "\n" }];
  }

  private slide(b: DerivedBeat): string {
    const { beat } = b;
    const lines: string[] = [`# ${beat.title}`, ""];

    if (beat.kind === "live-demo" && beat.live) {
      lines.push(`> Live — \`${beat.live.repo}\``, "", beat.live.task, "");
      if (beat.live.traceSurfaces?.length) {
        lines.push("What you can see the whole time:", "");
        for (const surface of beat.live.traceSurfaces) lines.push(`- ${surface}`);
        lines.push("");
      }
    }

    for (const claim of b.claims) {
      const refs = claim.evidence.map((e) => `\`${e.id}\``).join(", ");
      lines.push(`- ${claim.text}${refs ? ` <sup>${refs}</sup>` : ""}`);
    }
    if (b.claims.length) lines.push("");

    // Speaker notes: narration plus the beat's place in the arc and on the clock.
    lines.push(
      "<!--",
      `${KIND_LABEL[beat.kind]} · ${clock(b.startSec)}–${clock(b.endSec)}` +
        (b.persona ? ` · for ${b.persona.title}: ${b.persona.cares}` : ""),
    );
    if (beat.narration) lines.push("", beat.narration);
    lines.push("-->");

    return lines.join("\n");
  }
}

// ── Runbook ──────────────────────────────────────────────────────────────────

export interface RunbookSinkOptions {
  path?: string;
}

/** Emits the operator's live-demo runbook: what to set up, what to say when, and —
 *  for every live beat — the checkpoints to stop at, the failure to let happen, and
 *  the fallback to cut to. Derived from the same output as the deck, so the cue
 *  times in this document can never disagree with the slides. */
export class RunbookSink implements DemoSink {
  constructor(private readonly opts: RunbookSinkOptions = {}) {}

  emit(output: DemoOutput): SinkFile[] {
    const { spec } = output;
    const live = output.beats.filter((b) => b.beat.kind === "live-demo");

    const lines: string[] = [
      `# Runbook — ${spec.title}`,
      "",
      `_Derived by \`@objectcore/demo\` from \`${spec.name}\`. Do not hand-edit._`,
      "",
      `**Planned:** ${clock(output.totalSec)} against a ${clock(spec.targetDurationSec)} slot · ` +
        `${output.beats.length} beats · ${live.length} live.`,
      "",
      "## Before you walk on",
      "",
    ];

    // Prep is derived from the live beats themselves — never a static checklist,
    // or it drifts from the demo it is supposed to protect.
    if (live.length === 0) {
      lines.push("- (No live beats. The gate should have caught this.)", "");
    } else {
      for (const b of live) {
        const l = b.beat.live!;
        lines.push(
          `- Clone and warm \`${l.repo}\`; run the task once end to end today.`,
          `- Stage the fallback for **${b.beat.title}**: ${l.fallback}`,
        );
      }
      lines.push(
        "- Confirm every trace surface is visible at the back of the room.",
        "- Decide who calls the cut to fallback, and what the cue word is.",
        "",
      );
    }

    lines.push("## Cue sheet", "", "| Cue | Beat | Arc | For |", "|---|---|---|---|");
    for (const b of output.beats) {
      const who = b.persona ? b.persona.title : "—";
      lines.push(`| ${clock(b.startSec)} | ${b.beat.title} | ${KIND_LABEL[b.beat.kind]} | ${who} |`);
    }
    lines.push("");

    for (const b of output.beats) {
      lines.push(...this.beatSection(b));
    }

    lines.push("## Leave behind", "", spec.takeaway, "");

    return [{ path: this.opts.path ?? "runbook.md", content: lines.join("\n") }];
  }

  private beatSection(b: DerivedBeat): string[] {
    const { beat } = b;
    const lines: string[] = [
      `## ${clock(b.startSec)} — ${beat.title}`,
      "",
      `_${KIND_LABEL[beat.kind]} · ${clock(beat.durationSec)}_` +
        (b.persona ? ` · answers **${b.persona.title}**: ${b.persona.cares}` : ""),
      "",
    ];

    if (beat.narration) lines.push(beat.narration, "");

    for (const claim of b.claims) {
      const refs = claim.evidence.map((e) => `${e.id} → ${e.ref}`).join("; ");
      lines.push(`- **Claim:** ${claim.text}`, `  - **Backed by:** ${refs || "(unresolved)"}`);
    }
    if (b.claims.length) lines.push("");

    if (beat.kind === "live-demo" && beat.live) {
      const l = beat.live;
      lines.push(
        "### Live choreography",
        "",
        `**Repo:** \`${l.repo}\``,
        "",
        `**Task, as typed:** ${l.task}`,
        "",
        "**Stop here (human in the loop — these are a feature, show them):**",
        "",
      );
      for (const c of l.checkpoints) lines.push(`- [ ] ${c}`);
      lines.push("");
      if (l.expectedFailure) {
        lines.push(
          "**Let this fail:**",
          "",
          l.expectedFailure,
          "",
          "Do not rescue it early. The recovery is the credibility.",
          "",
        );
      }
      lines.push(`**If it dies:** ${l.fallback}`, "");
    }

    return lines;
  }
}
