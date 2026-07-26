---
id: a-prose-lint-cannot-tell-mention-from-use-keep-banned-entries-as-narrow-as-the-actual-clich
type: gotcha
title: A prose lint cannot tell mention from use — keep banned entries as narrow as the actual cliché
tags: [deslop, lint, false-positive, demo, plan-016]
source: packages/demo/src/deslop.ts
created: 2026-07-26
updated: 2026-07-26
---

Two false positives, both found when the de-slop lint was first run against a real demo (the plan-016 dogfood), and they are different problems:

**Over-broad entry.** `"next generation"` was on the banned list alongside `"next-generation"`. The marketing cliché is the hyphenated ADJECTIVE; the bare bigram appears in ordinary prose ("the next generation of the codebase starts knowing about it") and was flagged. Fixed by dropping the unhyphenated form. The general rule: a banned entry must be as narrow as the cliché itself, because a lint that fires on legitimate writing gets switched off, and a switched-off lint is worse than no lint. This is the same failure class as an unanchored substring match flagging "just" inside "adjust".

**Mention vs use — unfixable, and that is fine.** A sentence that QUOTES a banned phrase in order to say it is banned gets flagged, because the lint sees tokens, not intent. This is exactly [[stub-marker-readiness-check-must-match-the-full-forge-todo-comment-not-the-bare-token]]: a filled body may legitimately discuss the marker it is being checked for. There is no cheap textual fix. Reword the prose rather than weakening the rule — the lint being slightly too literal is the price of it being deterministic, and determinism is what makes it gate-safe.

**The KB's own retriever has the same defect.** An earlier draft of THIS entry quoted one of the banned marketing phrases as an example. Because the phrase's first token is an ordinary superlative, the entry then scored against an out-of-domain negative retrieval case (a cooking query using that same superlative) and broke `kb:check`. Lexical retrieval cannot tell an example from a subject any more than the lint can. When writing an entry ABOUT flagged vocabulary, describe the vocabulary instead of reproducing it.

The general lesson for any content gate: expect the first real document you run it against to find the gate's bugs, not the document's.
