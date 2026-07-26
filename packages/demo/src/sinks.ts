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
//   - `StoryboardSink` → `storyboard.json`, the Remotion scene manifest for the
//                     framing beats only (never the live run).
//   - `CanvasSink`  → `canvas.json`, architecture diagrams with derived positions.
//   - `EvidenceSink` → `evidence.md` + `evidence-proof.json`, the claims→sources
//                     appendix. It renders `proveEvidence`'s rows — the SAME rows
//                     `checkEvidence` gates on — so the handout and the gate are
//                     one evaluation (design's ProofSink discipline).
//
// The core stays hand-rolled + zero-dep: each adapter emits the format a downstream
// tool consumes; we never depend on the tool itself. Pure; never throws.

import type { DemoOutput, DerivedBeat } from "./derive";
import type { BeatKind } from "./spec";
import { evidenceCoverage, proveEvidence } from "./evidence";
import { buildStoryboard } from "./storyboard";
import type { StoryboardOptions } from "./storyboard";

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

// -- Slidev -------------------------------------------------------------------

export interface SlidevSinkOptions {
  /** Slidev theme name for the deck frontmatter. Defaults to `none` -- see below. */
  theme?: string;
  /** A stylesheet inlined into the deck's `<style>` block. The CLI passes the design
   *  system's own CSS custom properties here when the spec names a `designSystem`,
   *  which is how a deck inherits the brand WITHOUT this package depending on the
   *  design engine -- the port stays a plain string. */
  css?: string;
  path?: string;
}

/** Slidev's `default` theme is a separate npm package (`@slidev/theme-default`) that
 *  the CLI offers to install interactively. A GENERATED deck is usually opened
 *  non-interactively (CI, a script, an agent), where that prompt cannot be answered
 *  and Slidev exits with "the theme was not found and cannot prompt for installation".
 *  `none` is built in, so the emitted deck runs with no install step at all -- and the
 *  styling below is ours rather than a theme's, which is the point: a generated deck
 *  should look composed without asking the author to install or configure anything. */
const DEFAULT_SLIDEV_THEME = "none";

/** Slidev layout per beat kind. The arc IS the design: an opener and a STAR moment
 *  are single statements that should fill the screen, the live beat is a split of
 *  "what is running" against "what you can see", and the argument beats are ordinary
 *  content slides. Layout is derived from `kind`, never authored. */
const LAYOUT: Record<BeatKind, string> = {
  "opener": "cover",
  "what-is": "default",
  "what-could-be": "default",
  "live-demo": "two-cols",
  "star": "statement",
  "tell-show-tell": "default",
  "close": "center",
};

/** Badge text for each beat's place in the arc. */
const KIND_KICKER: Record<BeatKind, string> = {
  "opener": "Opening",
  "what-is": "What is",
  "what-could-be": "What could be",
  "live-demo": "Live",
  "star": "The moment",
  "tell-show-tell": "Show",
  "close": "Close",
};

/** The deck's own stylesheet, written against the SEMANTIC ROLE names the design
 *  engine emits (`--bg-base`, `--text-primary`, `--accent-default`, ...) with
 *  fallbacks -- so a deck looks composed with no design system attached, and inherits
 *  the brand exactly when one is passed via `css`. */
const BASE_CSS = [
  ":root {",
  "  --demo-bg: var(--bg-base, #0f1115);",
  "  --demo-surface: var(--bg-surface, #171a23);",
  "  --demo-fg: var(--text-primary, #e9ebf1);",
  "  --demo-muted: var(--text-secondary, #99a2b4);",
  "  --demo-accent: var(--accent-default, #7c8cff);",
  "  --demo-border: var(--border-subtle, #272c39);",
  "}",
  ".slidev-layout {",
  "  background: var(--demo-bg);",
  "  color: var(--demo-fg);",
  "  padding: 3.4rem 4rem;",
  "}",
  ".slidev-layout h1 {",
  "  color: var(--demo-fg);",
  "  font-size: 2.9rem;",
  "  line-height: 1.1;",
  "  font-weight: 650;",
  "  letter-spacing: -0.022em;",
  "  max-width: 20ch;",
  "  margin-bottom: 1.5rem;",
  "}",
  ".slidev-layout.slidev-layout-cover h1, .slidev-layout.slidev-layout-statement h1 {",
  "  font-size: 3.9rem;",
  "  max-width: 16ch;",
  "  letter-spacing: -0.03em;",
  "}",
  ".slidev-layout p, .slidev-layout li { font-size: 1.12rem; line-height: 1.62; }",
  ".slidev-layout ul { list-style: none; padding: 0; }",
  ".slidev-layout li {",
  "  position: relative;",
  "  padding-left: 1.4rem;",
  "  margin-bottom: 0.85rem;",
  "  color: var(--demo-fg);",
  "  max-width: 46ch;",
  "}",
  ".slidev-layout li::before {",
  '  content: "";',
  "  position: absolute;",
  "  left: 0; top: 0.7em;",
  "  width: 0.5rem; height: 0.5rem;",
  "  border-radius: 2px;",
  "  background: var(--demo-accent);",
  "}",
  ".demo-kicker {",
  "  display: inline-block;",
  "  font-size: 0.7rem;",
  "  letter-spacing: 0.15em;",
  "  text-transform: uppercase;",
  "  color: var(--demo-accent);",
  "  border: 1px solid var(--demo-border);",
  "  border-radius: 999px;",
  "  padding: 0.2rem 0.7rem;",
  "  margin-bottom: 1.3rem;",
  "}",
  ".demo-lede { font-size: 1.35rem; line-height: 1.5; color: var(--demo-muted); max-width: 42ch; }",
  ".demo-ref {",
  "  font-size: 0.7rem;",
  "  color: var(--demo-accent);",
  "  background: var(--demo-surface);",
  "  border: 1px solid var(--demo-border);",
  "  border-radius: 4px;",
  "  padding: 0.06rem 0.4rem;",
  "  margin-left: 0.4rem;",
  "  white-space: nowrap;",
  "}",
  ".demo-live {",
  "  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;",
  "  font-size: 0.88rem;",
  "  line-height: 1.55;",
  "  background: var(--demo-surface);",
  "  border: 1px solid var(--demo-border);",
  "  border-left: 3px solid var(--demo-accent);",
  "  border-radius: 6px;",
  "  padding: 0.9rem 1.05rem;",
  "  color: var(--demo-fg);",
  "}",
  ".demo-repo { color: var(--demo-muted); font-size: 0.85rem; margin-top: 0.8rem; }",
  ".demo-watch li { max-width: 28ch; font-size: 0.95rem; margin-bottom: 0.5rem; }",
  ".demo-foot {",
  "  position: absolute;",
  "  bottom: 1.5rem; left: 4rem; right: 4rem;",
  "  display: flex; justify-content: space-between;",
  "  font-size: 0.68rem;",
  "  color: var(--demo-muted);",
  "  border-top: 1px solid var(--demo-border);",
  "  padding-top: 0.65rem;",
  "}",
].join("\n");

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Emits a Slidev deck. Claims are rendered WITH their evidence refs inline -- the
 *  deck cannot show an assertion whose backing the evidence gate hasn't resolved. */
export class SlidevSink implements DemoSink {
  constructor(private readonly opts: SlidevSinkOptions = {}) {}

  emit(output: DemoOutput): SinkFile[] {
    const { spec } = output;
    const theme = this.opts.theme ?? DEFAULT_SLIDEV_THEME;

    const head = [
      "---",
      `theme: ${theme}`,
      `title: ${yamlString(spec.title)}`,
      `info: ${yamlString(spec.brief)}`,
      "layout: cover",
      "---",
      "",
      `# ${spec.title}`,
      "",
      `<p class="demo-lede">${escapeHtml(spec.brief)}</p>`,
      "",
      `<!-- Derived by @objectcore/demo from ${spec.name}. Do not hand-edit: re-run \`bun run demo:build\`. -->`,
      "",
      "<style>",
      this.opts.css ? `${this.opts.css}\n\n${BASE_CSS}` : BASE_CSS,
      "</style>",
    ].join("\n");

    const slides = output.beats.map((b) => this.slide(b, output));

    const closing = [
      "---",
      "layout: center",
      "---",
      "",
      "# Take this with you",
      "",
      `<p class="demo-lede">${escapeHtml(spec.takeaway)}</p>`,
      "",
      "<!--",
      "The transferable takeaway is a required field of the spec, not a courtesy slide:",
      "a demo that leaves nothing behind is a vendor pitch.",
      "-->",
    ].join("\n");

    return [{
      path: this.opts.path ?? "deck.md",
      content: [head, ...slides, closing].join(SLIDE_BREAK) + "\n",
    }];
  }

  private slide(b: DerivedBeat, output: DemoOutput): string {
    const { beat } = b;
    const lines: string[] = [
      "---",
      `layout: ${LAYOUT[beat.kind]}`,
      "---",
      "",
      `<div class="demo-kicker">${KIND_KICKER[beat.kind]}</div>`,
      "",
      `# ${beat.title}`,
      "",
    ];

    if (beat.kind === "live-demo" && beat.live) {
      // Left column: what is actually running. Right: what stays visible while it does.
      lines.push(
        `<div class="demo-live">$ ${escapeHtml(beat.live.task)}</div>`,
        "",
        `<div class="demo-repo">${escapeHtml(beat.live.repo)}</div>`,
        "",
        "::right::",
        "",
        '<div class="demo-kicker">On screen throughout</div>',
        "",
        '<div class="demo-watch">',
        "",
      );
      for (const surface of beat.live.traceSurfaces ?? []) lines.push(`- ${surface}`);
      lines.push("", "</div>", "");
    }

    // Claim text stays raw: a bullet is markdown, so an author can write `code` or
    // emphasis in a claim. Everything landing inside an HTML element is escaped.
    for (const claim of b.claims) {
      const refs = claim.evidence
        .map((e) => `<span class="demo-ref">${escapeHtml(e.id)}</span>`)
        .join("");
      lines.push(`- ${claim.text}${refs}`);
    }
    if (b.claims.length) lines.push("");

    // A slide carrying nothing but a title is an outline, not a deck. When a beat
    // makes no claims, show whose question it answers -- the spec already knows.
    if (!b.claims.length && beat.kind !== "live-demo" && b.persona) {
      lines.push(`<p class="demo-lede">${escapeHtml(b.persona.cares)}</p>`, "");
    }

    lines.push(
      `<div class="demo-foot"><span>${escapeHtml(output.spec.title)}</span>` +
        `<span>${clock(b.startSec)}</span></div>`,
      "",
    );

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

    // Claim text stays raw: a bullet is markdown, so an author can write `code` or
    // emphasis in a claim. Everything landing inside an HTML element is escaped.
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

// ── Evidence appendix ────────────────────────────────────────────────────────

export interface EvidenceSinkOptions {
  /** Emit the machine-readable proof alongside the markdown. Default true. */
  json?: boolean;
  path?: string;
  jsonPath?: string;
}

/** Emits the claims→sources appendix from `proveEvidence`'s rows. The audience's
 *  handout and the gate's verdict are literally the same evaluation — so a demo
 *  cannot ship an appendix that flatters a claim the gate rejected. */
export class EvidenceSink implements DemoSink {
  constructor(private readonly opts: EvidenceSinkOptions = {}) {}

  emit(output: DemoOutput): SinkFile[] {
    const entries = proveEvidence(output);
    const coverage = evidenceCoverage(output);

    const lines: string[] = [
      `# Evidence — ${output.spec.title}`,
      "",
      `_Derived by \`@objectcore/demo\`. Every claim made on stage, and what backs it._`,
      "",
      `**Backed:** ${entries.filter((e) => e.pass).length}/${entries.length} claims ` +
        `(${(coverage * 100).toFixed(0)}%).`,
      "",
      "| Beat | Claim | Backed by | Status |",
      "|---|---|---|---|",
    ];

    for (const e of entries) {
      const backing = e.evidence.map((i) => `\`${i.id}\` (${i.kind}) — ${i.ref}`).join("<br>")
        || (e.missing.length ? `unresolved: ${e.missing.join(", ")}` : "—");
      lines.push(`| ${e.beatTitle} | ${e.claim} | ${backing} | ${e.pass ? "backed" : "UNBACKED"} |`);
    }
    lines.push("");

    if (output.unusedEvidence.length) {
      lines.push("## Registered but unused", "");
      for (const item of output.unusedEvidence) {
        lines.push(`- \`${item.id}\` (${item.kind}) — ${item.ref}`);
      }
      lines.push("");
    }

    const files: SinkFile[] = [{ path: this.opts.path ?? "evidence.md", content: lines.join("\n") }];

    if (this.opts.json !== false) {
      files.push({
        path: this.opts.jsonPath ?? "evidence-proof.json",
        content: JSON.stringify({ demo: output.spec.name, coverage, entries }, null, 2) + "\n",
      });
    }

    return files;
  }
}

// ── Storyboard (Remotion / remocn) ───────────────────────────────────────────

export interface StoryboardSinkOptions extends StoryboardOptions {
  path?: string;
}

/** Emits `storyboard.json` — a Remotion scene manifest (component name, props, and
 *  `Sequence` frame ranges) for a user's own Remotion project to consume. We emit the
 *  format the tool reads and never depend on the tool itself, exactly as the design
 *  engine emits Tailwind and Style Dictionary config without depending on either.
 *  That also keeps this side of the line free of Remotion's source-available license:
 *  the manifest is ours, the renderer is the user's. */
export class StoryboardSink implements DemoSink {
  constructor(private readonly opts: StoryboardSinkOptions = {}) {}

  emit(output: DemoOutput): SinkFile[] {
    const board = buildStoryboard(output, this.opts);
    return [{
      path: this.opts.path ?? "storyboard.json",
      content: JSON.stringify(
        {
          demo: output.spec.name,
          fps: board.fps,
          totalFrames: board.totalFrames,
          // Stated so a consumer sees the boundary rather than rediscovering it:
          // the live beat is deliberately absent from the video track.
          note:
            "Scenes cover the framing beats only. The live agentic run is never " +
            "pre-rendered — rendering it would reproduce the opaque-reel failure mode.",
          scenes: board.scenes,
        },
        null,
        2,
      ) + "\n",
    }];
  }
}

// ── Architecture canvas (tldraw) ─────────────────────────────────────────────

export interface CanvasSinkOptions extends StoryboardOptions {
  path?: string;
}

/** Emits `canvas.json` — the architecture diagrams with DERIVED positions, one entry
 *  per canvas beat.
 *
 *  Deliberately a neutral node/edge/position document rather than a native `.tldr`
 *  file: tldraw's on-disk record schema is versioned and changes between releases, and
 *  this package has no way to verify the current shape offline. Emitting a documented
 *  intermediate that a thin importer maps onto the editor's `createShapes` API is
 *  honest about what we know; claiming native-format conformance would not be.
 *  (Verify against the live tldraw schema before writing that importer.) */
export class CanvasSink implements DemoSink {
  constructor(private readonly opts: CanvasSinkOptions = {}) {}

  emit(output: DemoOutput): SinkFile[] {
    const board = buildStoryboard(output, this.opts);
    if (board.canvases.length === 0) return [];

    return [{
      path: this.opts.path ?? "canvas.json",
      content: JSON.stringify(
        {
          demo: output.spec.name,
          format: "objectcore-demo-canvas@1",
          canvases: board.canvases.map((c) => ({
            beatId: c.beatId,
            beatTitle: c.beatTitle,
            nodes: c.nodes,
            edges: c.edges,
          })),
        },
        null,
        2,
      ) + "\n",
    }];
  }
}
