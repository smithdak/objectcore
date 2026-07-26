---
id: the-demo-engine-emits-render-formats-and-depends-on-no-renderer-the-licence-stays-the-operator-s
type: decision
title: The demo engine emits render formats and depends on no renderer — the licence stays the operator's
tags: [demo, licensing, remotion, tldraw, mcp, plan-016]
source: packages/demo/src/sinks.ts
created: 2026-07-26
---

`@objectcore/demo` emits a Remotion scene manifest (`storyboard.json`) and a neutral node/edge canvas document, and depends on neither Remotion nor tldraw — the same stance the design engine takes toward Tailwind and Style Dictionary. `demo_render` in the MCP server shells out to a render command the OPERATOR configures, and is not registered at all when none is. So the licence obligation sits with whoever renders, not with this repo.

That matters because the terms are not permissive. Verified against the vendors' own pages on 2026-07-26:

**Remotion** (source-available, not OSI open-source): free for individuals and companies up to 3 people; `Remotion for Creators` $25/seat/month; `Remotion for Automators` $0.01/render with a $100/month minimum; Enterprise from $500/month. Programmatic `renderMedia()`-style calls require the Automators tier. The AI clause is explicit and favourable — "it is allowed to build a service that generates Remotion code using artificial intelligence and renders it" — BUT carries a restriction the source brief omitted: **"it is not allowed to let users bring or upload their own Remotion code to your service for rendering."** That forbids a hosted service rendering user-supplied storyboards, and is the reason `demo_render` invoking the operator's own project is the correct shape rather than merely a convenient one.

**tldraw**: a licence key is required for production use at all — not merely to remove the watermark. The SDK runs without a key in development (localhost / http / `NODE_ENV !== 'production'`). Commercial and trial licences remove the "made with tldraw" watermark; hobby licences keep it. There is a 100-day free trial. Pricing is "value-based" and NOT published, so any figure quoted for it is unverified.

**Not verified**: the claim that a `licenseKey` is mandatory for telemetry from Remotion 5.0 — it is not in the licence FAQ. Treat as unconfirmed until read in the licence text itself.

Re-verify before shipping anything that renders: these are vendor pages, and the brief that prompted this work rated its own pricing figures medium-confidence (the Remotion numbers did survive verification; the tldraw ones were never public). See [[seed-curated-palettes-generate-scales-and-verify-curated-claims-with-the-gate-s-own-math]] for the same discipline applied to curated design claims.
