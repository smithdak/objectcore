// Trigger hit-rate reporting — ported from skillsmith's per-skill trigger-hit-
// rate measurement, but deliberately kept an ADDITIVE, non-blocking observability
// layer, not a second admission gate. `routeExpecting` (judge.ts) already yields a
// strict per-case pass/fail (majority-of-3 flake absorption) and THAT is the hard
// admission rule (AGENTS.md: no plugin enters the catalog without passing its
// activation eval, in full). A hit-rate percentage below a threshold measures how
// FRAGILE a trigger surface's activation is across its whole case set — useful
// signal for where to invest authoring effort — but must never let a partially-
// failing skill's cases average out to a pass. See EvalScore's nearMisses for the
// sibling per-run health signal this composes with.

import type { EvalResult } from "./types";

export interface HitRateEntry {
  suite: "activation" | "delegation";
  plugin: string;
  target: string;
  total: number;
  passed: number;
  hitRate: number;
  belowThreshold: boolean;
}

export interface HitRateOpts {
  threshold?: number;
}

const DEFAULT_THRESHOLD = 0.85;

/** Group activation/delegation results by (suite, plugin, target) and compute a
 *  per-trigger-surface hit rate. Results with a null/undefined target (the "no
 *  skill/agent should fire" cases) are excluded — a hit rate is only meaningful
 *  for a NAMED surface's own cases. */
export function computeHitRates(results: EvalResult[], opts: HitRateOpts = {}): HitRateEntry[] {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const groups = new Map<string, { suite: "activation" | "delegation"; plugin: string; target: string; total: number; passed: number }>();

  for (const r of results) {
    if (r.suite !== "activation" && r.suite !== "delegation") continue;
    if (!r.target) continue;
    if (!r.plugin) continue;
    const key = `${r.suite}::${r.plugin}::${r.target}`;
    const g = groups.get(key) ?? { suite: r.suite, plugin: r.plugin, target: r.target, total: 0, passed: 0 };
    g.total += 1;
    if (r.passed) g.passed += 1;
    groups.set(key, g);
  }

  return [...groups.values()]
    .map((g) => {
      const hitRate = g.total === 0 ? 1 : g.passed / g.total;
      return { ...g, hitRate, belowThreshold: hitRate < threshold };
    })
    .sort((a, b) => a.suite.localeCompare(b.suite) || a.plugin.localeCompare(b.plugin) || a.target.localeCompare(b.target));
}

/** A compact, human-readable table — informational only, never a gate input. */
export function formatHitRates(entries: HitRateEntry[]): string {
  if (entries.length === 0) return "hit-rates: n/a (no named-target activation/delegation cases)";
  const lines = entries.map((e) => {
    const pct = Math.round(e.hitRate * 100);
    const flag = e.belowThreshold ? " (below threshold)" : "";
    return `  ${e.suite}/${e.plugin}/${e.target}: ${pct}% (${e.passed}/${e.total})${flag}`;
  });
  return ["hit-rates:", ...lines].join("\n");
}
