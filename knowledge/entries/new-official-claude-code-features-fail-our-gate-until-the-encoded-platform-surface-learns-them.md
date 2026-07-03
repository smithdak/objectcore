---
id: new-official-claude-code-features-fail-our-gate-until-the-encoded-platform-surface-learns-them
type: gotcha
title: New official Claude Code features fail our gate until the encoded platform surface learns them
tags: [gate, schema, forge, platform-drift, plan-015]
created: 2026-07-03
---

The strict manifest schema (`MANIFEST_FIELDS` in `registry-core/src/schema.ts`) and forge's `HOOK_EVENTS`/`SETTINGS_KEYS` typo-guards (`packages/forge/src/scaffold.ts`) reject unknown fields/events BY DESIGN — but Claude Code itself *ignores* unknown manifest fields. So when Anthropic ships new platform surface (as of mid-2026: hook events `ConfigChange`/`CwdChanged`/`TeammateIdle`/`TaskCreated`/`TaskCompleted`/`Elicitation`/`ElicitationResult`/`PostCompact`/`PermissionDenied`/`MessageDisplay`/`WorktreeCreate`; manifest fields `defaultEnabled`/`userConfig`/`channels`/`lspServers`/`experimental`; marketplace entry `defaultEnabled`/`relevance`), a perfectly valid plugin using them FAILS `check:catalog` or `forge:scaffold` here.

**Why:** the loud failure is the drift-tracking signal — a `repositry` typo and a not-yet-encoded `userConfig` are indistinguishable to a validator that silently allows unknowns.

**How to apply:** when the gate rejects an 'unknown manifest field' or 'unknown hook event' that the live Claude Code docs document, the fix is updating the encoded platform surface (plan 015 WP1–3: single-sourced, version-stamped `platform.ts`) and NEVER loosening the strict default. Verify against live docs before encoding — docs-sweep version claims were wrong until corroborated against the CHANGELOG (`plans/notes/015-claude-code-platform-findings.md`).
