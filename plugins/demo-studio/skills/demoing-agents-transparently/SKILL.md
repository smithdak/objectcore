---
name: demoing-agents-transparently
description: Design the LIVE segment of a demo where an AI agent does real work on a real repo on stage — what stays visible while it runs, where the human-in-the-loop checkpoints go, which failure to let happen on purpose, and what the recorded fallback is. Use when planning or de-risking a live agentic demo, when deciding whether to run live or pre-record, or when worried a demo will break in front of an audience.
---
# Demoing agents transparently

The rule, from the record: **the demos that land show the agent's real work; the ones
that destroy credibility are pre-recorded magic tricks.** A technical audience that
cannot see what the agent did will assume the worst and, given a recording, will
reverse-engineer it frame by frame. Magic doesn't have an error log.

## Non-negotiables for a live beat

**A real repo and a real task.** A scratch repository built to make the demo work reads
as one, and the questions afterwards will find it. Pick something the audience would
recognize as real, and a task that is non-trivial enough to be worth watching.

**Declare what stays visible.** `traceSurfaces` is a required field, not a nicety — the
plan step list, every tool call as it is made, subagent handoffs, the gate output. If
the audience cannot see the agent working, you are showing them a reel with extra steps.

**Checkpoints are a feature.** Human-in-the-loop stops are the thing that makes this
usable in an enterprise, so put them on screen: approve the plan before anything is
written, read the diff together, decide as a room whether a failing edge case ships.

**Plan the failure.** The single strongest credibility signal available is a genuine,
recoverable failure on stage. Choose one you know about — an edge case the first pass
misses — declare it in `expectedFailure`, and do not rescue it early. Recovering in
front of the room is the reason they should believe the parts that worked.

**Stage a fallback anyway.** Live is the riskiest thing on stage. Record the exact run
today, cue it to the plan step, and decide in advance who calls the cut and on what
word. A fallback preserves the beat; it does not replace it.

## What NOT to do

- Do not render the agentic run as video. That reproduces the exact failure the record
  documents: an opaque reel a skeptical room will pick apart. Video is for the frame —
  opener, transitions, B-roll — never the substantive middle.
- Do not summarize what the agent did after the fact. Narrate it while it happens.
- Do not hide the human in the loop to make it look more autonomous. The oversight is
  the product, not an embarrassment.

## Before you walk on

`bun run demo:build` emits a runbook whose prep checklist is derived from your own live
beats: warm the repo, run the task end to end today, stage the fallback, confirm every
trace surface is legible from the back of the room.
