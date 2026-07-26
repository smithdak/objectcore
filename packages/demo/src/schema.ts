// The strict structural floor for a `DemoSpec` — the demo analogue of
// registry-core's `validateSchema` and design's `validateTokens`. Hand-rolled and
// zero-dep on purpose: this package is a pure seam and stays dependency-free.
//
// Scope discipline (mirrors the design engine's schema/resolve/gate split):
//   - THIS module checks SHAPE: required fields, types, enum membership,
//     kebab-case + unique ids, and reject-unknown on every object.
//   - `evidence.ts`/`gate.ts` (P2) check MEANING: do claim ids resolve, does the
//     beat sequence form a Sparkline, is a live beat actually safe to run.
// Keeping them apart is what lets a spec be structurally loadable while still
// failing the quality gate — the same way a plugin can parse and still not activate.

import { BEAT_KINDS, EVIDENCE_KINDS } from "./spec";
import type { DemoSpec } from "./spec";

export interface DemoIssue {
  level: "error" | "warning";
  /** Dotted path to the offending value, e.g. `beats[2].live.checkpoints`. */
  path?: string;
  message: string;
}

/** Same kebab rule the catalog enforces on plugin names — hand-rolled rather than
 *  imported so the core keeps zero dependencies (registry-core's stated reason). */
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const BEAT_KIND_SET = new Set<string>(BEAT_KINDS);
const EVIDENCE_KIND_SET = new Set<string>(EVIDENCE_KINDS);

const SPEC_KEYS = new Set([
  "name", "title", "brief", "targetDurationSec", "audience",
  "evidence", "beats", "takeaway", "designSystem",
]);
const PERSONA_KEYS = new Set(["id", "title", "cares"]);
const EVIDENCE_KEYS = new Set(["id", "kind", "ref", "note"]);
const CLAIM_KEYS = new Set(["text", "evidence"]);
const BEAT_KEYS = new Set([
  "id", "kind", "title", "persona", "durationSec", "narration", "claims", "live", "visual",
]);
const SCENE_VISUAL_KEYS = new Set(["kind", "scene", "props", "transition"]);
const CANVAS_VISUAL_KEYS = new Set(["kind", "nodes", "edges"]);
const CANVAS_NODE_KEYS = new Set(["id", "label", "group"]);
const CANVAS_EDGE_KEYS = new Set(["from", "to", "label"]);
const TRANSITIONS = new Set(["cut", "fade", "wipe", "slide"]);
const STATS_KEYS = new Set(["kind", "items", "note"]);
const CHAIN_KEYS = new Set(["kind", "steps", "note"]);
const TIMELINE_KEYS = new Set(["kind", "items", "note"]);
const COLUMNS_KEYS = new Set(["kind", "columns", "note"]);
const STAT_ITEM_KEYS = new Set(["value", "label"]);
const CHAIN_STEP_KEYS = new Set(["label", "detail"]);
const TIMELINE_ITEM_KEYS = new Set(["when", "label", "detail"]);
const COLUMN_KEYS = new Set(["heading", "points", "tag"]);
const LIVE_KEYS = new Set([
  "repo", "task", "fallback", "checkpoints", "expectedFailure", "traceSurfaces",
]);

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

export function validateDemoSpec(input: unknown): DemoIssue[] {
  const issues: DemoIssue[] = [];
  const err = (path: string | undefined, message: string) =>
    issues.push({ level: "error", path, message });

  if (!isObj(input)) return [{ level: "error", message: "demo spec must be an object" }];

  rejectUnknown(input, SPEC_KEYS, undefined, issues);

  if (!isNonEmptyString(input.name)) err("name", "`name` must be a non-empty string");
  else if (!KEBAB.test(input.name)) err("name", `\`name\` must be kebab-case (got "${input.name}")`);

  for (const key of ["title", "brief", "takeaway"] as const) {
    if (!isNonEmptyString(input[key])) {
      err(key, `\`${key}\` must be a non-empty string`);
    }
  }
  if (input.designSystem !== undefined && !isNonEmptyString(input.designSystem)) {
    err("designSystem", "`designSystem` must be a non-empty string when present");
  }

  if (typeof input.targetDurationSec !== "number" || !Number.isFinite(input.targetDurationSec)
      || input.targetDurationSec <= 0) {
    err("targetDurationSec", "`targetDurationSec` must be a positive finite number");
  }

  checkAudience(input.audience, issues);
  checkEvidence(input.evidence, issues);
  checkBeats(input.beats, issues);

  return issues;
}

/** Throwing wrapper for CLI/scaffold edges that want a hard stop. */
export function assertDemoSpec(input: unknown): DemoSpec {
  const issues = validateDemoSpec(input).filter((i) => i.level === "error");
  if (issues.length) {
    const lines = issues.map((i) => `  - ${i.path ? `${i.path}: ` : ""}${i.message}`);
    throw new Error(`invalid demo spec:\n${lines.join("\n")}`);
  }
  return input as DemoSpec;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function rejectUnknown(
  obj: Record<string, unknown>,
  allowed: Set<string>,
  path: string | undefined,
  issues: DemoIssue[],
): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      issues.push({
        level: "error",
        path: path ? `${path}.${key}` : key,
        message: `unknown field "${key}" (typo? allowed: ${[...allowed].join(", ")})`,
      });
    }
  }
}

/** Collect duplicate ids in one pass so the message names the id, not the index. */
function checkUniqueIds(ids: string[], path: string, issues: DemoIssue[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      issues.push({ level: "error", path, message: `duplicate id "${id}"` });
    }
    seen.add(id);
  }
}

function checkId(v: unknown, path: string, issues: DemoIssue[]): string | null {
  if (!isNonEmptyString(v)) {
    issues.push({ level: "error", path, message: "`id` must be a non-empty string" });
    return null;
  }
  if (!KEBAB.test(v)) {
    issues.push({ level: "error", path, message: `\`id\` must be kebab-case (got "${v}")` });
    return null;
  }
  return v;
}

function checkAudience(v: unknown, issues: DemoIssue[]): void {
  if (!Array.isArray(v) || v.length === 0) {
    issues.push({ level: "error", path: "audience", message: "`audience` must be a non-empty array of personas" });
    return;
  }
  const ids: string[] = [];
  v.forEach((p, i) => {
    const path = `audience[${i}]`;
    if (!isObj(p)) {
      issues.push({ level: "error", path, message: "persona must be an object" });
      return;
    }
    rejectUnknown(p, PERSONA_KEYS, path, issues);
    const id = checkId(p.id, `${path}.id`, issues);
    if (id) ids.push(id);
    for (const key of ["title", "cares"] as const) {
      if (!isNonEmptyString(p[key])) {
        issues.push({ level: "error", path: `${path}.${key}`, message: `\`${key}\` must be a non-empty string` });
      }
    }
  });
  checkUniqueIds(ids, "audience", issues);
}

function checkEvidence(v: unknown, issues: DemoIssue[]): void {
  if (!Array.isArray(v)) {
    issues.push({ level: "error", path: "evidence", message: "`evidence` must be an array (may be empty)" });
    return;
  }
  const ids: string[] = [];
  v.forEach((e, i) => {
    const path = `evidence[${i}]`;
    if (!isObj(e)) {
      issues.push({ level: "error", path, message: "evidence item must be an object" });
      return;
    }
    rejectUnknown(e, EVIDENCE_KEYS, path, issues);
    const id = checkId(e.id, `${path}.id`, issues);
    if (id) ids.push(id);
    if (typeof e.kind !== "string" || !EVIDENCE_KIND_SET.has(e.kind)) {
      issues.push({
        level: "error",
        path: `${path}.kind`,
        message: `\`kind\` must be one of: ${EVIDENCE_KINDS.join(", ")}`,
      });
    }
    if (!isNonEmptyString(e.ref)) {
      issues.push({ level: "error", path: `${path}.ref`, message: "`ref` must be a non-empty string" });
    }
    if (e.note !== undefined && !isNonEmptyString(e.note)) {
      issues.push({ level: "error", path: `${path}.note`, message: "`note` must be a non-empty string when present" });
    }
  });
  checkUniqueIds(ids, "evidence", issues);
}

function checkBeats(v: unknown, issues: DemoIssue[]): void {
  if (!Array.isArray(v) || v.length === 0) {
    issues.push({ level: "error", path: "beats", message: "`beats` must be a non-empty array" });
    return;
  }
  const ids: string[] = [];
  v.forEach((b, i) => {
    const path = `beats[${i}]`;
    if (!isObj(b)) {
      issues.push({ level: "error", path, message: "beat must be an object" });
      return;
    }
    rejectUnknown(b, BEAT_KEYS, path, issues);
    const id = checkId(b.id, `${path}.id`, issues);
    if (id) ids.push(id);

    const kind = b.kind;
    if (typeof kind !== "string" || !BEAT_KIND_SET.has(kind)) {
      issues.push({
        level: "error",
        path: `${path}.kind`,
        message: `\`kind\` must be one of: ${BEAT_KINDS.join(", ")}`,
      });
    }
    if (!isNonEmptyString(b.title)) {
      issues.push({ level: "error", path: `${path}.title`, message: "`title` must be a non-empty string" });
    }
    if (b.persona !== undefined && !isNonEmptyString(b.persona)) {
      issues.push({ level: "error", path: `${path}.persona`, message: "`persona` must be a persona id when present" });
    }
    if (typeof b.durationSec !== "number" || !Number.isFinite(b.durationSec) || b.durationSec <= 0) {
      issues.push({ level: "error", path: `${path}.durationSec`, message: "`durationSec` must be a positive finite number" });
    }
    if (b.narration !== undefined && !isNonEmptyString(b.narration)) {
      issues.push({ level: "error", path: `${path}.narration`, message: "`narration` must be a non-empty string when present" });
    }

    checkClaims(b.claims, path, issues);

    // A live beat's choreography is REQUIRED on `live-demo` and forbidden elsewhere —
    // the shape half of the live-safety rule (the gate owns the content half).
    if (kind === "live-demo") {
      if (b.live === undefined) {
        issues.push({ level: "error", path: `${path}.live`, message: "a `live-demo` beat must declare `live`" });
      } else {
        checkLive(b.live, `${path}.live`, issues);
      }
    } else if (b.live !== undefined) {
      issues.push({
        level: "error",
        path: `${path}.live`,
        message: `\`live\` is only valid on a "live-demo" beat (this one is "${String(kind)}")`,
      });
    }

    // The Devin lesson as a type constraint: the substantive middle is never
    // pre-rendered. Video frames the demo; it does not replace it.
    if (b.visual !== undefined) {
      if (kind === "live-demo") {
        issues.push({
          level: "error",
          path: `${path}.visual`,
          message:
            "a `live-demo` beat may not carry a `visual` — pre-rendering the agentic run " +
            "turns the substantive middle back into an opaque reel",
        });
      } else {
        checkVisual(b.visual, `${path}.visual`, issues);
      }
    }
  });
  checkUniqueIds(ids, "beats", issues);
}

function checkClaims(v: unknown, beatPath: string, issues: DemoIssue[]): void {
  if (v === undefined) return;
  if (!Array.isArray(v)) {
    issues.push({ level: "error", path: `${beatPath}.claims`, message: "`claims` must be an array when present" });
    return;
  }
  v.forEach((c, i) => {
    const path = `${beatPath}.claims[${i}]`;
    if (!isObj(c)) {
      issues.push({ level: "error", path, message: "claim must be an object" });
      return;
    }
    rejectUnknown(c, CLAIM_KEYS, path, issues);
    if (!isNonEmptyString(c.text)) {
      issues.push({ level: "error", path: `${path}.text`, message: "`text` must be a non-empty string" });
    }
    if (!Array.isArray(c.evidence) || !c.evidence.every(isNonEmptyString)) {
      issues.push({
        level: "error",
        path: `${path}.evidence`,
        message: "`evidence` must be an array of evidence ids (resolution is checked by the evidence gate)",
      });
    }
  });
}

function checkLive(v: unknown, path: string, issues: DemoIssue[]): void {
  if (!isObj(v)) {
    issues.push({ level: "error", path, message: "`live` must be an object" });
    return;
  }
  rejectUnknown(v, LIVE_KEYS, path, issues);
  for (const key of ["repo", "task", "fallback"] as const) {
    if (!isNonEmptyString(v[key])) {
      issues.push({ level: "error", path: `${path}.${key}`, message: `\`${key}\` must be a non-empty string` });
    }
  }
  if (!Array.isArray(v.checkpoints) || !v.checkpoints.every(isNonEmptyString)) {
    issues.push({ level: "error", path: `${path}.checkpoints`, message: "`checkpoints` must be an array of strings" });
  }
  if (v.expectedFailure !== undefined && !isNonEmptyString(v.expectedFailure)) {
    issues.push({ level: "error", path: `${path}.expectedFailure`, message: "`expectedFailure` must be a non-empty string when present" });
  }
  if (v.traceSurfaces !== undefined
      && (!Array.isArray(v.traceSurfaces) || !v.traceSurfaces.every(isNonEmptyString))) {
    issues.push({ level: "error", path: `${path}.traceSurfaces`, message: "`traceSurfaces` must be an array of strings when present" });
  }
}

/** Shared shape for the four list-driven archetypes: a non-empty array of objects,
 *  each with its own required string fields. Keeping this generic means adding a
 *  fifth archetype is a table entry, not another 40 lines of validation. */
function checkItemList(
  v: unknown,
  path: string,
  opts: {
    listKey: string;
    itemKeys: Set<string>;
    required: string[];
    optionalStrings?: string[];
    optionalStringArrays?: string[];
    min?: number;
  },
  issues: DemoIssue[],
): void {
  const list = (v as Record<string, unknown>)[opts.listKey];
  const min = opts.min ?? 2;
  if (!Array.isArray(list) || list.length < min) {
    issues.push({
      level: "error",
      path: `${path}.${opts.listKey}`,
      message: `\`${opts.listKey}\` must be an array of at least ${min}`,
    });
    return;
  }
  list.forEach((item, i) => {
    const ip = `${path}.${opts.listKey}[${i}]`;
    if (!isObj(item)) {
      issues.push({ level: "error", path: ip, message: "must be an object" });
      return;
    }
    rejectUnknown(item, opts.itemKeys, ip, issues);
    for (const key of opts.required) {
      if (!isNonEmptyString(item[key])) {
        issues.push({ level: "error", path: `${ip}.${key}`, message: `\`${key}\` must be a non-empty string` });
      }
    }
    for (const key of opts.optionalStrings ?? []) {
      if (item[key] !== undefined && !isNonEmptyString(item[key])) {
        issues.push({ level: "error", path: `${ip}.${key}`, message: `\`${key}\` must be a non-empty string when present` });
      }
    }
    for (const key of opts.optionalStringArrays ?? []) {
      const arr = item[key];
      if (!Array.isArray(arr) || arr.length === 0 || !arr.every(isNonEmptyString)) {
        issues.push({ level: "error", path: `${ip}.${key}`, message: `\`${key}\` must be a non-empty array of strings` });
      }
    }
  });
}

function checkNote(v: Record<string, unknown>, path: string, issues: DemoIssue[]): void {
  if (v.note !== undefined && !isNonEmptyString(v.note)) {
    issues.push({ level: "error", path: `${path}.note`, message: "`note` must be a non-empty string when present" });
  }
}

function checkVisual(v: unknown, path: string, issues: DemoIssue[]): void {
  if (!isObj(v)) {
    issues.push({ level: "error", path, message: "`visual` must be an object" });
    return;
  }

  if (v.kind === "scene") {
    rejectUnknown(v, SCENE_VISUAL_KEYS, path, issues);
    if (!isNonEmptyString(v.scene)) {
      issues.push({ level: "error", path: `${path}.scene`, message: "`scene` must be a non-empty component name" });
    }
    if (v.props !== undefined && !isObj(v.props)) {
      issues.push({ level: "error", path: `${path}.props`, message: "`props` must be an object when present" });
    }
    if (v.transition !== undefined && (typeof v.transition !== "string" || !TRANSITIONS.has(v.transition))) {
      issues.push({
        level: "error",
        path: `${path}.transition`,
        message: `\`transition\` must be one of: ${[...TRANSITIONS].join(", ")}`,
      });
    }
    return;
  }

  if (v.kind === "canvas") {
    rejectUnknown(v, CANVAS_VISUAL_KEYS, path, issues);
    if (!Array.isArray(v.nodes) || v.nodes.length === 0) {
      issues.push({ level: "error", path: `${path}.nodes`, message: "`nodes` must be a non-empty array" });
    } else {
      const ids: string[] = [];
      v.nodes.forEach((n, i) => {
        const np = `${path}.nodes[${i}]`;
        if (!isObj(n)) {
          issues.push({ level: "error", path: np, message: "node must be an object" });
          return;
        }
        rejectUnknown(n, CANVAS_NODE_KEYS, np, issues);
        const id = checkId(n.id, `${np}.id`, issues);
        if (id) ids.push(id);
        if (!isNonEmptyString(n.label)) {
          issues.push({ level: "error", path: `${np}.label`, message: "`label` must be a non-empty string" });
        }
        if (n.group !== undefined && !isNonEmptyString(n.group)) {
          issues.push({ level: "error", path: `${np}.group`, message: "`group` must be a non-empty string when present" });
        }
      });
      checkUniqueIds(ids, `${path}.nodes`, issues);
    }

    if (!Array.isArray(v.edges)) {
      issues.push({ level: "error", path: `${path}.edges`, message: "`edges` must be an array (may be empty)" });
    } else {
      v.edges.forEach((e, i) => {
        const ep = `${path}.edges[${i}]`;
        if (!isObj(e)) {
          issues.push({ level: "error", path: ep, message: "edge must be an object" });
          return;
        }
        rejectUnknown(e, CANVAS_EDGE_KEYS, ep, issues);
        for (const key of ["from", "to"] as const) {
          if (!isNonEmptyString(e[key])) {
            issues.push({ level: "error", path: `${ep}.${key}`, message: `\`${key}\` must be a node id` });
          }
        }
        if (e.label !== undefined && !isNonEmptyString(e.label)) {
          issues.push({ level: "error", path: `${ep}.label`, message: "`label` must be a non-empty string when present" });
        }
      });
    }
    return;
  }

  if (v.kind === "stats") {
    rejectUnknown(v, STATS_KEYS, path, issues);
    checkNote(v, path, issues);
    checkItemList(v, path, { listKey: "items", itemKeys: STAT_ITEM_KEYS, required: ["value", "label"] }, issues);
    return;
  }

  if (v.kind === "chain") {
    rejectUnknown(v, CHAIN_KEYS, path, issues);
    checkNote(v, path, issues);
    checkItemList(v, path, {
      listKey: "steps", itemKeys: CHAIN_STEP_KEYS, required: ["label"], optionalStrings: ["detail"],
    }, issues);
    return;
  }

  if (v.kind === "timeline") {
    rejectUnknown(v, TIMELINE_KEYS, path, issues);
    checkNote(v, path, issues);
    checkItemList(v, path, {
      listKey: "items", itemKeys: TIMELINE_ITEM_KEYS, required: ["when", "label"], optionalStrings: ["detail"],
    }, issues);
    return;
  }

  if (v.kind === "columns") {
    rejectUnknown(v, COLUMNS_KEYS, path, issues);
    checkNote(v, path, issues);
    checkItemList(v, path, {
      listKey: "columns", itemKeys: COLUMN_KEYS, required: ["heading"],
      optionalStrings: ["tag"], optionalStringArrays: ["points"],
    }, issues);
    return;
  }

  issues.push({
    level: "error",
    path: `${path}.kind`,
    message: '`visual.kind` must be one of: scene, canvas, stats, chain, timeline, columns',
  });
}
