---
id: retrieval-id-magnet
type: gotcha
title: A long entry id is a permanent retrieval magnet — supersede, do not retitle
tags: [retrieval, curation, kb-hygiene, scoring]
source: packages/knowledge/src/search.ts
created: 2026-07-26
---

`searchEntries` weights title ×3, tags ×2, **id ×2**, body ×1. An id is derived from the title at creation and is never editable afterwards, so a long declarative title bakes its every token into a ×2-weighted field forever. Such an entry then outranks better-matching entries on any query sharing its vocabulary.

Observed: an entry whose id was a full sentence of fourteen tokens beat the correct entry on a release-mechanics eval query that shared three of them, and broke that eval. A full retitle moved the score only 7.21 → 6.84, because the id kept scoring. The fix was `kb:curate --supersede` under a short id (`owner-rename-ripple`) with the body preserved verbatim — the old file stays in git, drops out of the active INDEX.

Two things that surprised, both worth knowing before tuning:

- **Tags leak tokens.** The superseding entry still lost while tagged `first-write-wins`, because tokenization splits it and one of its parts was a query term, at ×2. Dropping one inaccurate-for-this-purpose tag closed most of the gap.
- **Saturated tf flattens the weights.** Score uses `wtf / (wtf + 1)`, so a term repeated ~5× in a body (≈0.83) can beat a single title mention (3/4 = 0.75). Field weight matters less than field COUNT; a term present in title AND tags AND id AND body wins.

So resolve a retrieval collision from both sides, as metadata, never by weakening the eval case: shorten/supersede the magnet, and give the intended winner a title that states its own rule plus tags carrying the query's actual vocabulary. Here the intended entry's title never contained the query's key nouns despite its body leading with exactly that rule — a real titling weakness the collision merely exposed.

This is the retrieval sibling of [[judge-pool-distractor]]: adding a surface perturbs an unrelated one, and the fix is disjoining the surfaces, not relaxing the test.

One more effect, found while fixing it: writing THIS entry flipped the same eval back, twice. First because its own id was a sentence (it is now `retrieval-id-magnet`), then because its body quoted the offending id and the query, raising the corpus df for those terms and eroding the intended winner's margin. Scoring is corpus-relative, so every added entry perturbs every ranking — describe an example, never reproduce it, and re-run `kb:check` after any write.
