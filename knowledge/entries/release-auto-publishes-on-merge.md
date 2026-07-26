---
id: release-auto-publishes-on-merge
type: lesson
title: A plugin's first publish needs no changeset — merging to main auto-publishes current versions
tags: [release, ci, stage-2, first-publish, changeset, publish, plugin]
source: .github/workflows/release.yml
created: 2026-06-26
updated: 2026-07-26
---

Merging to `main` runs the release workflow, which tags each plugin
`{plugin}--v{semver}` at its CURRENT version (idempotent), SHA-pins the catalog,
attests it, and runs `registry:ingest` into Turso. So a plugin's FIRST publish
needs no changeset — after a feature merge it is already live and SHA-pinned at
the live registry, with no manual release step.

Changesets are only for version BUMPS (consumed by `release:version`). Add a
changeset when you want 0.1.0 → 0.2.0; do not add one just to "publish" a new
plugin — the merge already did.
