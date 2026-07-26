---
id: rendered-verification
type: lesson
title: A generated visual artifact needs a rendered check — its defects are invisible to types and unit tests
tags: [demo, gate, rendering, slidev, plan-016]
source: scripts/demo-verify.ts
created: 2026-07-26
---

Every gate in this repo reasons about the SPEC. `demo:check` proves a claim resolves and the arc oscillates, `design:check` proves contrast in the token math, `tsc` proves the types line up. None of them render anything. Building the demo engine, real defects lived in exactly that blind spot while `tsc` was clean and 178 unit tests were green: a deck that would not open, a stylesheet that never applied because a `<style>` inside a slide is slide-scoped, nineteen slides emitted for a ten-slide deck, and twice a CSS rule written against a class the framework does not emit.

The class of bug is always the same shape: the artifact is VALID and INERT. The CSS parses, the selector is well-formed, and it matches nothing. No type system can see that, because the thing being asserted about is the rendered result, not the source. So load it in a real browser and assert on the result — `scripts/demo-verify.ts` does this for overflow, dead rules, and blank slides.

Four things the first working version got wrong, each worth knowing on its own:

**A framework's layout NAME and its CSS CLASS are not the same string.** Slidev's `two-cols` renders as `two-columns`. Read class names off the element, never from the docs' shape. This was assumed wrong twice, which is what motivated the dead-rule check in the first place.

**`page.evaluate("() => {...}")` never runs the function.** A string argument is evaluated as an EXPRESSION, so an arrow-function source string yields a function object, which is not serializable, so the call resolves to undefined and every downstream assertion silently passes. Pass an IIFE — `(() => {...})()` — or a real function. A check that returns undefined reports success, which is the worst failure mode a check has.

**A slide framework does not put every slide in the DOM.** Slidev's deck root keeps the current slide and its neighbour; probing it on a ten-slide deck finds two and calls the other eight's classes dead. `/export` is the route that renders all of them, and `/print` is not — measured, not assumed. Verify how many units your probe can actually see before trusting what it says about them.

**A shared stylesheet makes "unused here" the wrong oracle.** One CSS block is emitted for every deck, covering every figure archetype, so a deck without a stats figure legitimately matches no `.demo-stats`. Judging per deck produced 23 false findings. The defect worth catching is a rule inert across the WHOLE corpus, so reconcile defined-vs-used after every deck has voted — and when only one deck is verified, skip the check and say so rather than report a clean sweep it did not earn.

Operationally: pin the renderer version rather than resolving `@latest` per run, or the deck that passed yesterday fails today because the renderer moved and the finding points at the deck. Spawn the real executable rather than a shell shim, or the pid you hold is not the pid holding the port and teardown orphans a live server — which then holds that port, sends the next run's server somewhere else, and gets the probe inspecting a stale deck. Reap synchronously; an async kill loses the race against `process.exit`. See [[the-demo-engine-emits-render-formats-and-depends-on-no-renderer-the-licence-stays-the-operator-s]] for why the renderer stays on the operator's side of the seam, and [[a-prose-lint-cannot-tell-mention-from-use-keep-banned-entries-as-narrow-as-the-actual-clich]] for the sibling lesson that the first real artifact you run a gate against finds the gate's bugs, not the artifact's.
