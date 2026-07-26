---
id: owner-rename-ripple
type: gotcha
title: A GitHub owner rename ripples through every link of the release chain, in order
tags: [owner-rename, identity, oidc, registry, sha-pin]
created: 2026-07-16
updated: 2026-07-26
---

Renaming the GitHub owner (twofoldtech-dakota → smithdak, 2026-07-16) is not one config edit; it touches every link of the publish chain, and order matters.

1. **Repo sweep**: `objectcore.config.json` owner + all plugin `author` fields + test fixtures + docs, then re-derive `marketplace.json`. Watch for MIXED-CASE fixtures — the case-insensitivity tests use variants like `Twofoldtech-Dakota/ObjectCore.git` that a case-sensitive sed misses; re-case them to the new owner (`SmithDak/ObjectCore.git`) so they keep proving case-insensitive repo matching.
2. **All-plugins changeset (patch)**: every manifest changed, and the registry is first-write-wins per (name, version) — re-publishing an existing version with changed content 409s, and `release:publish` refuses a dir changed since its tag. New identity must ship as new versions.
3. **Allowlist flip BEFORE the Version PR merges**: GitHub OIDC tokens claim the NEW `repository` immediately after the rename, so `OBJECTCORE_PUBLISH_REPOS` on Fly must flip to the new owner/repo or `POST /v1/plugins` fails closed (403). Staged Fly secrets don't apply to a warm machine — may need a redeploy.
4. **`repoUrl` for SHA-pins derives from `git remote origin`** (`scripts/_release.ts`), so CI picks up the new URL automatically via checkout; local clones need `git remote set-url`. Old pins keep resolving because GitHub redirects renamed owners.

Repo variables holding registry URLs (`OBJECTCORE_REGISTRY_URL`, `OBJECTCORE_OIDC_AUDIENCE`) are unaffected. Executed as PR #46.
