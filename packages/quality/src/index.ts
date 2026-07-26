// @objectcore/quality — the body-content quality tier registry-core never covered.
// registry-core/validate.ts checks manifest shape and directory structure; this
// package reads what's actually written inside a SKILL.md/agent/command/output-
// style body and scores it against hygiene + composition rules (ported from the
// sibling skillsmith project's V-rules). Additive: it never touches deriveCatalog
// or validateAll's signature, so the single-derivation-path invariant holds.

import type { WorkspacePlugin } from "@objectcore/registry-core";
import {
  checkBodyLength,
  checkDescriptionBudget,
  checkReferenceDepth,
  checkVoice,
  readComponentBodies,
  type BodyLimits,
  type QualityIssue,
} from "./body";
import { collectComponents, validateComposition, type CompositionPolicy } from "./composition";

export * from "./body";
export * from "./composition";

export interface QualityConfig extends BodyLimits {
  maxDescriptionChars?: number;
}

export interface PolicyConfig extends CompositionPolicy {
  networkAllowlist?: string[];
  hitRateThreshold?: number;
  versionGuard?: { baseRef?: string };
}

/** Body-content rules: length, reference depth, voice, description budget. */
export async function validateContent(
  plugins: WorkspacePlugin[],
  cfg?: QualityConfig,
): Promise<QualityIssue[]> {
  const issues: QualityIssue[] = [];
  for (const plugin of plugins) {
    const bodies = await readComponentBodies(plugin);
    for (const body of bodies) {
      issues.push(...checkBodyLength(body, cfg));
      issues.push(...(await checkReferenceDepth(body)));
      issues.push(...checkVoice(body));
      issues.push(...checkDescriptionBudget(body, cfg));
    }
  }
  return issues;
}

/** Everything this package gates: content quality plus composition-edge linting. */
export async function validateQuality(
  plugins: WorkspacePlugin[],
  cfg?: QualityConfig & PolicyConfig,
): Promise<QualityIssue[]> {
  const content = await validateContent(plugins, cfg);
  const components = await collectComponents(plugins);
  const composition = validateComposition(components, cfg);
  return [...content, ...composition];
}
