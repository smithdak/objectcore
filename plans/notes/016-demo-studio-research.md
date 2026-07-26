# Building a "World-Class Agentic Demo Studio" Plugin: Architecture, Toolchain, and Monetization

## TL;DR
- **Build it as a Claude Code plugin (a coordinated team of ~7–8 specialized subagents orchestrated by a lead "showrunner"), packaged so the same content pipeline emits BOTH a polished deck and a live, observable agentic demo** — because Claude Code's plugin primitives (skills, subagents, hooks, slash commands, MCP) are the single best-documented substrate for this as of July 2026, and the same `plugin.json`/marketplace shape installs into Cowork too.
- **The quality bar is won or lost on transparency, not spectacle**: the demos that land with Fortune 500 technical audiences show the agent's real planning steps, tool calls, and recoverable failures (the Code-w/-Claude-2026 pattern), while the ones that destroy credibility are pre-recorded "magic trick" reels (the Devin pattern). Anthropic's own engineers state the rule directly: "Prioritize transparency by explicitly showing the agent's planning steps."
- **Toolchain recommendation: Slidev (decks) + a live-demo harness (Claude Code UI/terminal + tldraw for animated architecture) + Remotion/remocn as the render backend for pre-baked "hero" segments.** Adopt remocn's MIT-licensed shadcn-registry pattern directly; budget for a paid Remotion Company License the moment you productize. Monetize via a professional-services-attach model plus a paid private marketplace, not a low-price plugin listing.

## Key Findings

**1. Structure beats spectacle, and there is a documented structure.** The most-cited framework is Nancy Duarte's "Sparkline" — oscillating between "what is" and "what could be," ending on a "call to adventure"/new bliss, derived from analyzing speeches like MLK's "I Have a Dream" and Steve Jobs's 2007 iPhone keynote. For technical demos specifically, the DevRel canon prescribes a "limbic opener → so-what → tell-show-tell loops → value close," treating a demo like a magic trick whose job is to make the story *retellable*. The recurring failure mode named across sources is "proving the build instead of guiding the room."

**2. For agentic AI specifically, transparency is the differentiator.** The Devin launch (March 2024) is the canonical cautionary tale; the winning counter-example is Boris Cherny's live Claude Code demo at Code w/ Claude 2026. The lesson is consistent: show the terminal, use a real repo/real enterprise task, and let the agent hit and recover from a genuine bug on stage.

**3. Claude Code plugin architecture is mature and well-documented for multi-agent "expert teams."** As of mid-2026 the primitives are clearly delineated (skills = in-context expertise; subagents = isolated workers reporting to a parent; agent teams = peer-coordinating sessions; hooks = deterministic lifecycle control; MCP = external tools; plugins = the distributable bundle). Anthropic ships an official plus a community marketplace, and Cowork uses the identical `plugin.json` shape.

**4. Remotion + remocn are a strong, real render backend — with a licensing catch.** Remotion is source-available (not OSI open-source); free for individuals/companies ≤3 employees, otherwise paid. remocn (kapishdima) is a free/MIT shadcn-style registry of 64+ Remotion components.

**5. Monetization: the durable play is services-attach + private marketplace, not a $29 listing.** Claude Code plugins are distributed as free GitHub marketplaces with no native payment rail; monetization happens around the plugin.

## Details

### 1. State of the art: what separates memorable enterprise demos from AI slop (as of 2026)

**The narrative spine — Duarte's Sparkline.** Nancy Duarte (whose firm has built keynote content for Apple since winning the account in 1988, and for Salesforce/Dreamforce) found that iconic talks follow a repeating contrast between "what is" and "what could be," building to a memorable "STAR moment" and a closing vision of "new bliss." For an enterprise agentic-engineering talk, this means: open on the *current painful reality* of software delivery, oscillate to *what agentic engineering makes possible*, and close on a concrete call to adventure. Satya Nadella's keynote technique is repeatedly cited as the enterprise exemplar: he explains AI "through customer stories rather than technical specifications," problem-first, product-as-climax.

**The demo micro-structure — treat it like a magic trick.** The DeveloperRelations.com framework (Ron, ex-sales-engineering/DevRel) prescribes: a **limbic opener** (an emotionally engaging moment that primes memory), relentlessly asking **"so what?"** until you reach a benefit the audience cares about, **tell–show–tell** loops (state it, demonstrate it, reinforce it), and a **value close**. Core insight: "good demos aren't about showing everything — they're about telling the right story in the right order so others can retell it later."

**The "show, don't tell" imperative and its risk.** A veteran keynote-demo producer's account ("How to rock a technical keynote") argues "there is no substitute for a live software demo … it's about testifying to the truth of your claims." But live-coding is the single riskiest thing on stage. The practitioner consensus (Matthew Gilliard's widely-cited live-coding tips; Jeremy Thake's taxonomy of demo approaches) is: **it will go wrong — have a plan.** Techniques: pre-install everything, script every keystroke, keep a recorded fallback, keep a live environment ready for Q&A. Purpose-built tools exist: **Demo Time** (VS Code extension used at Microsoft Ignite) scripts and automates live-coding steps to remove the risk while preserving the *feel* of live building.

**The "AI slop" trap to avoid.** Simon Willison is the leading voice distinguishing low-effort "AI slop"/"vibe coding" from disciplined "agentic engineering" (also "vibe engineering" — wrapping the model in tests, benchmarks, and constraints). "Agent slop" (low-quality agent output that looks professional but lacks substance) is a documented 2025-26 enterprise risk. The takeaway for the plugin: the content it generates must be substantive, verifiable, and free of buzzword filler — the plugin needs an explicit "de-slop" critic pass.

**Concrete structural patterns to encode into the plugin (with sourcing):**
- **Hook / limbic opener** (Duarte STAR moment; DevRel limbic opener)
- **Problem-first framing** before any product (Nadella/Prezent; Reprise)
- **Narrative contrast arc** — what is ⇄ what could be (Duarte Sparkline)
- **Show-don't-tell live build** with scripted safety net (Gilliard; Demo Time; Thake)
- **Tell–show–tell reinforcement loops** (DevRel)
- **Audience-role anchoring** — persona-driven "why" (Microsoft MDX; Prezent)
- **Memorable retellable close / value close** (DevRel value close; Duarte new bliss)

### 2. Agentic / multi-agent demo patterns: what lands vs. what fails

**The cautionary tale — Cognition's Devin (March 12, 2024).** Cognition emerged from stealth billing Devin "the first AI software engineer" (backed by a $21M Series A led by Founders Fund, with backers including the Collison brothers and Elad Gil), with a launch reel showing it planning, browsing docs, writing/testing code, and opening a GitHub PR, plus a viral "Devin's Upwork Side Hustle" video claiming autonomous freelance earnings, and a claimed 13.86% resolution rate on SWE-bench (~3x better than prior systems). Carl Brown's "Debunking Devin" (Internet of Bugs, YouTube, April 2024) alleged frame-by-frame that: (a) the Upwork task Devin "solved" didn't match the customer's actual request (the customer asked for setup instructions, not code); (b) Devin was shown editing files that didn't exist in the target repo and fixing nonsensical errors — inference: **it was fixing bugs it had itself created**. Brown replicated the real task manually in ~36 minutes; Devin took 6+ hours and failed. An independent Answer.AI study (Hamel Husain, Isaac Flath, Johno Whitaker; Jan 8, 2025) found, verbatim: "Out of 20 tasks we attempted, we saw 14 failures, 3 inconclusive results, and just 3 successes. More concerning was our inability to predict which tasks would succeed." Their enterprise lesson: "Social media excitement and company valuations have minimal relationship to real-world utility."

**Why it matters:** the failure was a **black-box, pre-recorded "magic trick"** — task-switching, hidden self-created bugs, no visible reasoning trace, cherry-picked success. When the demo was opaque, a skeptical technical audience reverse-engineered it and credibility collapsed. This is the exact fate a principal-architect audience will inflict on a bad agentic demo.

**The expert prescription — transparency.** Anthropic's own engineering guidance ("Building Effective Agents," Erik Schluntz & Barry Zhang, Dec 2024) lists as core principle #2, verbatim: "Prioritize transparency by explicitly showing the agent's planning steps," concluding this creates agents "not only powerful but also reliable, maintainable, and trusted by their users." Simon Willison: "LLM systems that hide what they are doing from me are inherently frustrating — they make it much harder for me to evaluate if they are doing a good job and spot when they make mistakes." The distilled maxim: magic doesn't have an error log.

**The winning counter-example — Code w/ Claude 2026 (May 6, 2026).** Per Simon Willison's live blog, Boris Cherny (creator of Claude Code) ran a live demo of Claude adding refunds to a mock enterprise dashboard — "with idempotency so you can't double-refund, multi-currency handling, audit logging for the compliance team" — with a live UI panel showing Claude *actually using the product* and **discovering an edge-case bug on stage.** The credibility signals: a realistic enterprise task, a visible working surface, a genuine (recoverable) failure, and candid narration by the tool's creator ("Everything we are seeing today still feels magical to me, and I work on Claude Code every day"). He also showed multiple concurrent async sessions flagging which "need your input" — reinforcing an observable, human-in-the-loop model.

**Design rules for the plugin's "live demo" mode (derived):**
1. Use a **real repo and a real, non-trivial enterprise task** — never a canned reel.
2. **Expose the trace**: planning steps, tool calls, subagent handoffs on screen.
3. **Script a safety net** (Demo Time-style) but preserve genuine, recoverable failure moments — they build trust.
4. **Human-in-the-loop checkpoints** are a feature to show, not hide.
5. End with a **transferable takeaway** (the CLAUDE.md, the subagent definitions, the harness) the audience can walk away and use — this is what separates a principal-architect demo from a vendor pitch.

### 3. Claude Code / Cowork plugin architecture for a multi-agent "expert team"

**The primitive map (Anthropic-documented, mid-2026):**
- **Skills** (`SKILL.md` + progressive disclosure): in-context domain expertise, loaded on-demand; keep under 500 lines, description in third person stating *what* + *when*. This is where craft knowledge lives (Duarte structure, demo micro-structure, brand rules).
- **Subagents** (`.claude/agents/*.md`, YAML frontmatter + system prompt): isolated workers with their own context window that report back to a parent — ideal for the specialist roster. Scope tools per agent deliberately (omitting `tools` grants all).
- **Agent teams** (documented at code.claude.com/docs/en/agent-teams): peer-coordinating separate sessions with a lead orchestrator, shared task list, and direct addressability; ~7x more tokens in plan-heavy workflows. Use for the collaborative "war-room" rehearsal, not the whole pipeline.
- **Hooks**: deterministic lifecycle control (e.g., `SubagentStop` to surface the next handoff; a "de-slop" validation gate). Hooks "enforce behavior architecturally — a hook that blocks a tool call cannot be reasoned around."
- **MCP servers**: external tools (brand assets, a Remotion render service, company data).
- **Plugin** (`.claude-plugin/plugin.json`): the distributable bundle of all the above. Cowork uses the identical shape (`commands/`, `skills/`, `.mcp.json`), so one artifact targets both Claude Code and Cowork.

**Recommended orchestration: hierarchical lead + specialist subagents, with an agent-team rehearsal phase.** Anthropic's multi-agent coordination guidance describes the orchestrator–subagent (hub-and-spoke) pattern as easiest to reason about and debug — the parent decomposes, subagents return distilled results, parent synthesizes. Reserve peer-to-peer agent teams for the deliberation-heavy "critique/rehearsal" stage where quality depends on cross-checking.

**Proposed subagent roster (roles → responsibilities → handoffs):**
1. **Showrunner (lead/orchestrator)** — owns the brief, decomposes into deck-track and demo-track, sequences handoffs, synthesizes. *Hands off to → all; receives from → all.*
2. **Narrative Architect** — applies Duarte Sparkline + limbic-opener/value-close; produces the beat sheet and STAR moment. *→ Content Curator, Deck Designer, Demo Choreographer.*
3. **Technical Content Curator** — ensures substance: real architecture, real numbers, verifiable claims; kills buzzwords. *→ Narrative Architect, Critic.*
4. **Executive-Outcomes Translator** — persona-anchors every beat to CFO/CISO/principal-architect "so-what"; ROI and risk framing. *→ Narrative Architect.*
5. **Deck Designer** — emits the Slidev/pptx artifact; enforces a distinctive, non-templated visual system. *→ Motion-Graphics Producer.*
6. **Live-Demo Choreographer** — produces the demo script/environment: the real repo, the CLAUDE.md, the scripted-but-observable steps, the human-in-the-loop checkpoints, the deliberate recoverable-failure beat. *→ Critic, Showrunner.*
7. **Motion-Graphics / Video Producer** — drives Remotion/remocn to render hero segments and tldraw for animated architecture diagrams. *→ Deck Designer.*
8. **Critic / Rehearsal Agent (agent-team mode)** — adversarial "de-slop" pass: is it substantive, retellable, transparent, and does it leave a transferable takeaway? Runs as a peer team for deliberation. *→ Showrunner (loops back).*

**Division of responsibility:** encode *durable craft* as Skills (reusable across engagements); encode *roles* as Subagents (isolated context); encode *gates* as Hooks (de-slop validation, handoff surfacing); encode *the render/data reach* as MCP. Bundle everything as one Plugin.

**Self-replicating catalog pattern (ObjectCore-style).** The ports-and-adapters/deriveCatalog approach maps cleanly here: define a **port** for "output target" (deck adapter, live-demo adapter, video adapter) and a **port** for "brand/data source," then `deriveCatalog` can generate per-engagement or per-client plugin variants from a single source of truth — the same mechanism that lets a marketplace regenerate itself. This is the architectural backbone for turning the studio into a distributable, self-replicating product line.

### 4. Output production tooling

**Decks (web-based, non-templated, senior-technical): Slidev is the recommended default.** Slidev (Anthony Fu; Vue/Vite; MIT) is "the strongest default for developer advocates, framework authors, and conference speakers who want code demos to feel alive," with live-coding, syntax highlighting, Mermaid diagrams, presenter tooling, and PDF/PPTX/PNG/SPA export. It also documents official skills for AI coding agents — meaning the Deck Designer subagent can drive it natively. Marp is the fallback when a pure Markdown→PPTX pipeline is needed for corporate hand-off; Reveal.js when maximum custom web behavior is required.

**Live-diagram / animated architecture: tldraw.** tldraw is a React infinite-canvas SDK (~49.3k GitHub stars as of July 24, 2026; adopted by Google, Shopify, Autodesk, ClickUp, Replit, and 25+ other products) with a full runtime Editor API for programmatically driving the canvas, plus AI/agent canvas primitives — ideal for animated "watch the architecture assemble" explanations. **License caveat:** free in development; production use requires a license key / business license to remove the watermark.

**Programmatic video / hero segments: Remotion + remocn.**
- **Remotion** (remotion.dev; Zurich; React-based programmatic video): renders real MP4s from React components, embeddable `@remotion/player`, Lambda/cloud rendering. **License (verify at productization):** source-available, *not* OSI open-source. **Free** for individuals and companies with ≤3 employees. Paid tiers (per Remotion's official pricing): **Remotion for Creators is $25 per Seat/month with no minimum seat count** (seat-based, for low-volume internal rendering); **Remotion for Automators is $0.01 per Render with a $100/month minimum spend** (render-based, for serving generated videos); and the **Enterprise License begins at $500/month.** Critically for a product: "it is allowed to build a service that generates Remotion code using AI and renders it," and from Remotion 5.0, `licenseKey` telemetry is mandatory for the render-based Automators licensing. A 2-person company is *currently* free-license-eligible, but productizing (serving generated demo videos) pushes you toward the Automators or Enterprise License — budget for it.
- **remocn** (kapishdima/Remocn; remocn.dev): a shadcn-style registry of **64+ production-ready** Remotion components built with React + Tailwind, across five categories — text animations, backgrounds/visual primitives, transitions/wipes, UI blocks, and full scene compositions (including a TerminalSimulator and product-trailer scenes) — installed via `npx shadcn add @remocn/<name>`; you *own* the copied TSX, no runtime dependency. **License: MIT, fully free for commercial use.** An independent review (Florian Narr, codeline.co, 2026) — noting the repo was at ~190 stars at the time — flags that the docs are "thin on composition guidance" (how to sequence multi-scene videos) and that a premium tier/video-builder is on the roadmap. Treat it as an excellent primitive layer you'll extend, not a finished pipeline.
- **Verdict on the requester's repo:** adopt it as the **motion-graphics/video-rendering backend for pre-baked segments only** (opener sizzle, "hero" transitions, polished B-roll of agent runs) — the deterministic, high-polish parts. Do NOT try to render the *live* agentic demo through Remotion; that defeats the transparency principle. The right architecture is: remocn/Remotion for the cinematic frame → live Claude Code terminal/UI for the substantive middle → tldraw for animated architecture. Wire Remotion rendering behind an MCP server so the Motion-Graphics Producer subagent can invoke renders. Preserve remocn's determinism (its components correctly use `useCurrentFrame()`/`interpolate()`/`spring()` and avoid the `Math.random()` trap) when the agent generates new scenes.

**Alternative considered & when to prefer it:** Revideo (open-source Motion Canvas fork) has no license fee for self-hosted batch rendering — prefer it over Remotion *only* if licensing cost becomes the binding constraint and you don't need Remotion's React/shadcn ecosystem. Given the requester already has a Remotion/remocn repo and a React/shadcn stack, Remotion is the right call despite the license cost.

### 5. Productization & monetization

**Marketplace mechanics (as of July 2026).** Claude Code marketplaces are just GitHub repos with a `.claude-plugin/marketplace.json`; users `/plugin marketplace add owner/repo` then `/plugin install name@marketplace`. There are three Anthropic-run tiers: the **official** marketplace (`claude-plugins-official`, curated, inclusion at Anthropic's discretion), the **community** marketplace (`anthropics/claude-plugins-community`, passes automated validation + safety screening, pinned to commit SHAs), and a demo marketplace. Cowork additionally lets **enterprises build a private marketplace** of specialized agents and distribute internally (admins control sources including private GitHub repos) — announced Feb 24, 2026. **There is no native payment rail** in the plugin system; installs are free.

**Therefore, monetize *around* the plugin, not *via* a listing.** Recommended stacked model:
1. **Professional-services attach (primary, near-term).** The plugin is the delivery mechanism / IP moat for a productized "agentic demo studio" service sold per-engagement to enterprises and peer agencies. This matches how the market actually pays (Agent37's monetization analysis: "if you want durable revenue, the endgame is usually the bundle: your skill, your tools, and a clearly defined outcome delivered every month"). It also sidesteps the API-cost trap (Opus usage can quietly exceed a flat plugin price).
2. **Private/licensed marketplace (primary, mid-term).** Distribute the plugin through a **private GitHub marketplace gated by license** (seat- or org-based), leveraging Cowork's enterprise private-marketplace mechanic. Charge for access + updates. This is where ObjectCore's self-replicating deriveCatalog pattern becomes a revenue multiplier: generate client-branded studio variants from one source.
3. **Managed-cost pass-through.** Because model tokens dominate cost, price on value/outcome and either pass through API costs or require the customer's own Claude Enterprise/Max seats.

**Licensing considerations to resolve before selling:**
- **Remotion**: move to the Automators ($0.01/render, $100/mo min) or Enterprise ($500/mo) License at productization; confirm the "AI-generates-and-renders" clause covers your use (it does, per Remotion's FAQ) and implement mandatory `licenseKey` telemetry.
- **tldraw**: purchase a business license to remove the watermark for any client-facing production use.
- **remocn / Slidev / Marp**: MIT — clear for commercial use; retain copyright notices.
- **Your plugin's own license**: Anthropic's plugin docs warn users that "Anthropic doesn't control what … [is] included in plugins" — trust and provenance are your burden; ship a clear license and SBOM.

**Capital-efficient precedent:** the space rewards lean, services-and-IP plays; e.g., Blackbox AI is reported to have reached ~$31.7M annual revenue by 2025 serving 12M+ developers without external venture funding (cited here only as directional evidence that developer-AI tooling can be capital-efficient — treat the figure as vendor-adjacent reporting; one tracker lists a lower ~$19.8M, so it is unaudited).

## Recommendations

**Stage 0 — Prove the spine (1-2 weeks).** Build a minimal Claude Code plugin with just the **Showrunner + Narrative Architect + Live-Demo Choreographer** subagents and one Skill encoding the Duarte/DevRel structure. Success benchmark: it can turn a one-paragraph brief into (a) a Slidev beat-sheet deck and (b) a runnable live-demo script against a real repo. If the output still reads like "AI slop," add the Critic agent before anything else.

**Stage 1 — Dual-output pipeline.** Add the **Deck Designer (Slidev) + Motion-Graphics Producer (remocn/Remotion via MCP) + tldraw** integration and the **Executive-Outcomes Translator + Technical Content Curator**. Wire a **de-slop hook** that blocks completion until the Critic passes it. Benchmark: a principal-architect reviewer rates the takeaways "genuinely substantive" and can *retell* the core story unprompted.

**Stage 2 — Productize with ports/adapters.** Refactor outputs behind **output-target ports** (deck/live-demo/video adapters) and a **brand/data port**; implement `deriveCatalog` so you can spin client-branded studio variants. Package as a versioned plugin in a **private licensed marketplace.** Move Remotion/tldraw to paid licenses. Benchmark: a second team/agency installs and produces an on-brand demo with zero help from you.

**Stage 3 — Monetize.** Lead with **services-attach** per engagement; layer in **private-marketplace licensing** for peer agencies; pass through model costs. Benchmark to expand: ≥3 paid engagements delivered and one external licensee renewing.

**Thresholds that would change the plan:**
- If Anthropic adds a **native paid-plugin rail** → pivot toward direct marketplace sales.
- If **Remotion licensing** proves cost-prohibitive at scale → switch hero-video rendering to self-hosted Revideo.
- If live demos repeatedly fail on-stage under enterprise network constraints → shift the "middle" to a Demo-Time-scripted, locally-hosted environment while preserving visible traces.

**Rejected alternatives (with why):**
- **Cowork-first build** — rejected as the *primary* target because Claude Code has richer, better-documented multi-agent/hook tooling for builders; but ship the identical `plugin.json` so it *also* installs in Cowork (best of both).
- **Pure Remotion "auto-generate the whole demo as video"** — rejected: renders the agentic demo into a black-box reel, reproducing the Devin failure mode. Video is for framing, not the substantive core.
- **PowerPoint-native generation** — rejected as the design surface (templated, generic aesthetic); use Slidev/web and export to PPTX only for corporate hand-off.
- **Low-price public plugin listing** — rejected: no payment rail + token-cost exposure = "a $29 product that quietly burns cash the more users love it."

## Caveats
- **Volatility:** Claude Code/Cowork plugin mechanics, versions, and marketplace policies change weekly (the docs themselves warn "Claude Code's plugin and marketplace features change quickly"). All plugin-mechanic claims are as-of **July 26, 2026**; re-verify at build time. Confidence: high on primitives, medium on exact marketplace/commercial policy.
- **No native commercial rail:** As of this date there is no documented Anthropic payment/revenue-share mechanism for third-party plugins; monetization must happen around the artifact. Confidence: high.
- **Remotion licensing is the single biggest commercial gotcha** — source-available, not open-source; verify current terms and the AI-render clause before shipping. Confidence: high on the tiered model ($25/seat Creators; $0.01/render + $100/mo min Automators; $500/mo+ Enterprise), medium that figures haven't shifted since last verification.
- **remocn maturity:** excellent primitives but thin composition docs, small (but growing) community, and a possible future premium split; treat as a layer you extend. Confidence: high.
- **Some critique sourcing is secondary:** the sharpest Devin allegations rest on a YouTube analysis (Carl Brown/Internet of Bugs) + Hacker News corroboration + one independent replication study (Answer.AI); directionally robust but not a peer-reviewed post-mortem.
- **The Blackbox revenue figure** and some pricing numbers come from vendor-adjacent reporting, not audited filings — treat as directional.