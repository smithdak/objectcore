// Curated demo archetypes (the plan-014 seeded-preset pattern applied to demos) —
// the quick-start path. A preset is a COMPLETE, checked-in `DemoSpec` written to be
// credible on its own terms, which `instantiatePreset` hands back under whatever name
// the author wants. Same seam (`deriveDemo`), same gate, same sinks as an authored
// demo: a preset is a starting position, never a privileged one.
//
// The curated claim is VERIFIED, not promised: `presets.test.ts` runs every preset
// through the gate's own math, so "these archetypes pass the gate" is measured on
// every CI run (plan 014's lesson, and the reason a preset can be trusted as a
// starting point at all).
//
// Presets are STATIC JSON imports (resolveJsonModule): no runtime I/O, the core
// stays pure and zero-dep. Pure; never throws — bad input comes back as issues.

import type { DemoSpec } from "./spec";
import type { DemoIssue } from "./schema";
import { validateDemoSpec } from "./schema";
import { deriveDemo } from "./derive";
import { runDemoGate } from "./gate";

import enterpriseAgentic from "../presets/enterprise-agentic/demo.json";
import platformMigration from "../presets/platform-migration/demo.json";

export interface DemoPreset {
  name: string;
  /** One line: what this archetype is for. */
  summary: string;
  /** When to reach for it — the disambiguating half, for the choosing skill. */
  whenToUse: string;
  spec: DemoSpec;
}

export const DEMO_PRESETS: readonly DemoPreset[] = [
  {
    name: "enterprise-agentic",
    summary:
      "The transparency demo: an agent does a real, non-trivial task on a real repo with its planning, tool calls, and one genuine failure on screen.",
    whenToUse:
      "A senior technical audience that has seen polished AI reels and did not believe them. 20 minutes.",
    spec: enterpriseAgentic as DemoSpec,
  },
  {
    name: "platform-migration",
    summary:
      "The wide-and-boring demo: agent-assisted migration of one module, where the valuable artifact is the list of call sites it flagged as uncertain.",
    whenToUse:
      "A delivery-accountable audience weighing a multi-quarter migration they cannot staff. 30 minutes.",
    spec: platformMigration as DemoSpec,
  },
];

export function listPresets(): Array<Omit<DemoPreset, "spec">> {
  return DEMO_PRESETS.map(({ name, summary, whenToUse }) => ({ name, summary, whenToUse }));
}

export function getPreset(name: string): DemoPreset | undefined {
  return DEMO_PRESETS.find((p) => p.name === name);
}

export interface InstantiateResult {
  spec: DemoSpec;
  /** Schema + gate issues from the preset AS INSTANTIATED — the self-gate. Empty
   *  errors is the curated claim, re-measured rather than asserted. */
  issues: DemoIssue[];
}

/** Instantiate a preset, optionally under a new name. Self-gates: the returned
 *  issues are the schema floor plus the full deterministic gate. */
export function instantiatePreset(name: string, opts: { name?: string } = {}): InstantiateResult {
  const preset = getPreset(name);
  if (!preset) {
    return {
      spec: { } as DemoSpec,
      issues: [{
        level: "error",
        message: `unknown preset "${name}" (available: ${DEMO_PRESETS.map((p) => p.name).join(", ")})`,
      }],
    };
  }

  const spec: DemoSpec = structuredClone(preset.spec);
  if (opts.name) spec.name = opts.name;

  const schemaIssues = validateDemoSpec(spec);
  if (schemaIssues.some((i) => i.level === "error")) {
    return { spec, issues: schemaIssues };
  }

  return { spec, issues: [...schemaIssues, ...runDemoGate(deriveDemo(spec)).issues] };
}
