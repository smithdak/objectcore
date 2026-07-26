// Body-content quality rules (the "V-rules" tier, ported from skillsmith) — the
// half of validation objectcore never had: registry-core's validate.ts only ever
// checks manifest shape and directory structure, never what's actually written
// inside a SKILL.md/agent/command body. This module reads that content and scores
// it against hygiene rules (length, reference depth, voice) that keep a trigger
// surface lean and a body loadable without bloating the context window.

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { WorkspacePlugin } from "@objectcore/registry-core";
import { parseFrontmatter } from "@objectcore/eval";

export type ComponentKind = "skill" | "command" | "agent" | "output-style";

/** A component's frontmatter + body, read straight off disk — the raw material
 *  every quality rule below operates on. */
export interface ComponentBody {
  plugin: string;
  kind: ComponentKind;
  name: string;
  /** Absolute path to the component's markdown file. */
  path: string;
  /** Absolute path to the component's own directory (skills/<name>/), when it has
   *  one — commands/agents/output-styles are flat files with no sibling dir. */
  componentDir: string;
  frontmatter: Record<string, string>;
  /** File content after the `--- ... ---` frontmatter block. */
  body: string;
  raw: string;
}

function stripFrontmatter(raw: string): string {
  return raw.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, "");
}

async function isDir(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

async function readSkillBodies(plugin: WorkspacePlugin): Promise<ComponentBody[]> {
  const skillsDir = join(plugin.dir, plugin.manifest.skills ?? "skills");
  if (!(await isDir(skillsDir))) return [];
  const out: ComponentBody[] = [];
  for (const entry of (await readdir(skillsDir)).sort()) {
    if (entry.startsWith(".")) continue;
    const componentDir = join(skillsDir, entry);
    const path = join(componentDir, "SKILL.md");
    let raw: string;
    try {
      raw = await readFile(path, "utf8");
    } catch {
      continue;
    }
    const frontmatter = parseFrontmatter(raw);
    out.push({
      plugin: plugin.manifest.name,
      kind: "skill",
      name: frontmatter.name || entry,
      path,
      componentDir,
      frontmatter,
      body: stripFrontmatter(raw),
      raw,
    });
  }
  return out;
}

async function readFlatBodies(
  plugin: WorkspacePlugin,
  dirName: string,
  kind: ComponentKind,
): Promise<ComponentBody[]> {
  const dir = join(plugin.dir, dirName);
  if (!(await isDir(dir))) return [];
  const out: ComponentBody[] = [];
  for (const entry of (await readdir(dir)).sort()) {
    if (!entry.endsWith(".md") || entry.startsWith(".")) continue;
    const path = join(dir, entry);
    const raw = await readFile(path, "utf8");
    const frontmatter = parseFrontmatter(raw);
    const name = frontmatter.name || entry.slice(0, -".md".length);
    out.push({
      plugin: plugin.manifest.name,
      kind,
      name,
      path,
      componentDir: dir,
      frontmatter,
      body: stripFrontmatter(raw),
      raw,
    });
  }
  return out;
}

/** Every skill/command/agent/output-style body a plugin ships. */
export async function readComponentBodies(plugin: WorkspacePlugin): Promise<ComponentBody[]> {
  const commandsDir = plugin.manifest.commands ?? "commands";
  const agentsDir = plugin.manifest.agents ?? "agents";
  const [skills, commands, agents, outputStyles] = await Promise.all([
    readSkillBodies(plugin),
    readFlatBodies(plugin, commandsDir, "command"),
    readFlatBodies(plugin, agentsDir, "agent"),
    readFlatBodies(plugin, "output-styles", "output-style"),
  ]);
  return [...skills, ...commands, ...agents, ...outputStyles];
}

export interface QualityIssue {
  level: "error" | "warning";
  plugin?: string;
  message: string;
}

export interface BodyLimits {
  maxBodyLines?: number;
  maxBodyTokens?: number;
}

const DEFAULT_MAX_BODY_LINES = 500;
const DEFAULT_MAX_BODY_TOKENS = 5000;
/** chars/4 estimate, ±15% tolerance — deliberately coarse, keeps this dependency-free. */
const TOKEN_ESTIMATE_TOLERANCE = 1.15;

function id(c: ComponentBody): string {
  return `${c.plugin}/${c.kind}s/${c.name}`;
}

/** V4 analogue: body ceilings — line count and a coarse token estimate. */
export function checkBodyLength(c: ComponentBody, opts?: BodyLimits): QualityIssue[] {
  const maxLines = opts?.maxBodyLines ?? DEFAULT_MAX_BODY_LINES;
  const maxTokens = opts?.maxBodyTokens ?? DEFAULT_MAX_BODY_TOKENS;
  const issues: QualityIssue[] = [];
  const lines = c.body.split("\n").length;
  if (lines > maxLines) {
    issues.push({
      level: "error",
      plugin: c.plugin,
      message: `${id(c)}: body is ${lines} lines (max ${maxLines})`,
    });
  }
  const estTokens = Math.round(c.body.length / 4);
  if (estTokens > maxTokens * TOKEN_ESTIMATE_TOLERANCE) {
    issues.push({
      level: "error",
      plugin: c.plugin,
      message: `${id(c)}: body is ~${estTokens} tokens (max ~${maxTokens})`,
    });
  }
  return issues;
}

const REFERENCE_LINK = /\[[^\]]*\]\((references\/[^)\s]+)\)/g;

/** V5 analogue: `references/` files must sit exactly one level deep, and must not
 *  themselves link onward to another reference (chains defeat on-demand loading). */
export async function checkReferenceDepth(c: ComponentBody): Promise<QualityIssue[]> {
  const issues: QualityIssue[] = [];
  const refs = new Set<string>();
  for (const m of c.body.matchAll(REFERENCE_LINK)) refs.add(m[1]!);
  for (const ref of refs) {
    const depth = ref.split("/").length - 1; // "references/foo.md" -> 1
    if (depth > 1) {
      issues.push({
        level: "error",
        plugin: c.plugin,
        message: `${id(c)}: reference "${ref}" is nested more than one level deep`,
      });
      continue;
    }
    const refPath = join(c.componentDir, ref);
    let raw: string;
    try {
      raw = await readFile(refPath, "utf8");
    } catch {
      continue; // dangling reference is a different concern; not this rule's job
    }
    if (REFERENCE_LINK.test(raw)) {
      issues.push({
        level: "warning",
        plugin: c.plugin,
        message: `${id(c)}: reference "${ref}" links onward to another reference (chain)`,
      });
    }
    REFERENCE_LINK.lastIndex = 0;
  }
  return issues;
}

const OPENING_VOICE = /^\s*(I'll|I will|We will|We'll|You should now)\b/i;
const REASONING_EXTRACTION = /(show|explain|share)\s+your\s+reasoning|think\s+step\s+by\s+step|chain[- ]of[- ]thought/i;

/** V7/V13 analogue: imperative voice, never instruct the model to expose its
 *  reasoning process (a refusal hazard, not just a style nit). */
export function checkVoice(c: ComponentBody): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const firstLine = c.body.split("\n").find((l) => l.trim().length > 0) ?? "";
  if (OPENING_VOICE.test(firstLine)) {
    issues.push({
      level: "warning",
      plugin: c.plugin,
      message: `${id(c)}: body opens in first-person future voice ("${firstLine.trim().slice(0, 40)}...") — prefer imperative`,
    });
  }
  if (REASONING_EXTRACTION.test(c.body)) {
    issues.push({
      level: "warning",
      plugin: c.plugin,
      message: `${id(c)}: body instructs the model to show/explain its reasoning process`,
    });
  }
  return issues;
}

/** V2 analogue: the `description` is the trigger surface and the marketplace-
 *  listing budget it must fit inside. */
export function checkDescriptionBudget(c: ComponentBody, opts?: { maxDescriptionChars?: number }): QualityIssue[] {
  const max = opts?.maxDescriptionChars ?? 1024;
  const description = c.frontmatter.description ?? "";
  if (description.length > max) {
    return [
      {
        level: "error",
        plugin: c.plugin,
        message: `${id(c)}: description is ${description.length} chars (max ${max})`,
      },
    ];
  }
  return [];
}
