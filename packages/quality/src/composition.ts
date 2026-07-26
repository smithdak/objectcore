// Composition-edge linting (V12 analogue, ported from skillsmith) — objectcore had
// no concept of a skill/agent/command declaring a reference to another one. A
// `composes` frontmatter key (comma-separated, matching forge's existing list-
// serialization convention) makes those edges lintable: does the target exist, is
// it self-referential, is it actually used in the body, and does it cross a
// plugin boundary without being acknowledged in policy.

import type { WorkspacePlugin } from "@objectcore/registry-core";
import type { ComponentBody, QualityIssue } from "./body";
import { readComponentBodies } from "./body";

/** A component flattened across the whole catalog, with its declared edges. */
export interface ComponentRef {
  plugin: string;
  kind: ComponentBody["kind"];
  name: string;
  body: string;
  composes: string[];
}

export function parseComposesField(frontmatter: Record<string, string>): string[] {
  const raw = frontmatter.composes;
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Every component across the workspace, flattened with its composition edges. */
export async function collectComponents(plugins: WorkspacePlugin[]): Promise<ComponentRef[]> {
  const all = await Promise.all(plugins.map((p) => readComponentBodies(p)));
  return all.flat().map((c) => ({
    plugin: c.plugin,
    kind: c.kind,
    name: c.name,
    body: c.body,
    composes: parseComposesField(c.frontmatter),
  }));
}

export interface CompositionPolicy {
  /** `"declarer-plugin -> target-plugin"` entries acknowledging cross-plugin edges. */
  compositionAllowlist?: string[];
}

/** Resolve a `composes` entry (bare name = same plugin, `plugin:name` = cross-plugin)
 *  against the declaring component's own plugin. */
function resolveTarget(entry: string, declarerPlugin: string): { plugin: string; name: string } {
  const ci = entry.indexOf(":");
  if (ci === -1) return { plugin: declarerPlugin, name: entry };
  return { plugin: entry.slice(0, ci), name: entry.slice(ci + 1) };
}

export function validateComposition(
  components: ComponentRef[],
  policy?: CompositionPolicy,
): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const byKey = new Map<string, ComponentRef>();
  for (const c of components) byKey.set(`${c.plugin}:${c.name}`, c);
  const allowlist = new Set(policy?.compositionAllowlist ?? []);

  for (const declarer of components) {
    for (const entry of declarer.composes) {
      const target = resolveTarget(entry, declarer.plugin);
      const key = `${target.plugin}:${target.name}`;
      const id = `${declarer.plugin}/${declarer.kind}s/${declarer.name}`;

      if (target.plugin === declarer.plugin && target.name === declarer.name) {
        issues.push({ level: "error", plugin: declarer.plugin, message: `${id}: composes itself` });
        continue;
      }
      const found = byKey.get(key);
      if (!found) {
        issues.push({
          level: "error",
          plugin: declarer.plugin,
          message: `${id}: declares composition of "${entry}" which does not exist`,
        });
        continue;
      }
      if (target.plugin !== declarer.plugin) {
        const edge = `${declarer.plugin} -> ${target.plugin}`;
        if (!allowlist.has(edge)) {
          issues.push({
            level: "error",
            plugin: declarer.plugin,
            message: `${id}: composition edge "${edge}" crosses a plugin boundary and is not in policy.compositionAllowlist`,
          });
        }
      }
      if (!declarer.body.includes(target.name)) {
        issues.push({
          level: "warning",
          plugin: declarer.plugin,
          message: `${id}: declares composition of "${entry}" but never mentions it in the body (dead declaration)`,
        });
      }
    }
  }
  return issues;
}
