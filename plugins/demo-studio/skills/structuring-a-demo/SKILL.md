---
name: structuring-a-demo
description: Structure a technical demo or talk as a sequence of typed beats — the opener, the what-is / what-could-be contrast, the STAR moment, and the value close — with every claim backed by evidence and the runtime fitting the slot. Use when planning the arc of a demo or presentation, when a demo drags or its ending falls flat, or when deciding what goes on stage and in what order. For the live segment itself use demoing-agents-transparently; for a ready-made starting point use choosing-a-demo-archetype.
---
# Structuring a demo

The failure mode this prevents is **proving the build instead of guiding the room**:
a chronological tour of what you made, which nobody can retell afterwards.

## The arc

A demo is a sequence of typed **beats**, and the type sequence is what makes it an arc:

| Beat | Job |
|---|---|
| `opener` | One concrete moment the audience has personally lived. A scene, not a statistic. |
| `what-is` | The current painful reality, in their units. |
| `what-could-be` | What the change makes possible. |
| `live-demo` | The substantive middle. See `demoing-agents-transparently`. |
| `star` | The one line you want repeated in a hallway tomorrow. |
| `tell-show-tell` | State it, show it, restate it. Use to reinforce a beat that must land. |
| `close` | The value close: what to do next, and what they take with them. |

**Oscillate.** Alternate `what-is` and `what-could-be` at least twice. A single
before/after is a product tour; the repeated contrast is what builds the arc. Beats of
other kinds may sit between the poles without breaking the contrast.

## Rules the gate enforces

Run `bun run demo:check`. It fails, not warns, on:

- a first beat that is not an `opener`, or a last beat that is not a `close`
- no `star` beat — a demo with no STAR moment has nothing to retell
- fewer than two `what-is` ⇄ `what-could-be` switches
- planned runtime more than 15% off the declared `targetDurationSec`
- any claim with no backing evidence (see below)
- marketing filler, unsupportable absolutes, or a magnitude word in a beat that cites no
  `metric` evidence — "significantly faster" is a claim with a number behind it and slop
  without one

It warns on a declared persona no beat answers, and on a live beat with no planned
recoverable failure.

## Anchor beats to people

Declare each audience persona with what they silently ask of every beat (`cares`), then
set `persona` on the beats that answer them. A persona nobody's beat serves is a person
sitting through someone else's demo.

## Claims carry evidence

Every assertion is a `claim` referencing ids in the demo's `evidence` registry
(`source` | `metric` | `artifact` | `demo`). The evidence appendix the audience is handed
is rendered from the same rows the gate measures, so an unbacked claim cannot reach a
slide. If you cannot cite it, cut it or demonstrate it live.

## Working shape

1. `bun run demo:scaffold <brief.json>` — a gate-passing skeleton with the arc laid out,
   or `bun run demo:seed <archetype>` to start from a curated one.
2. Write the bodies. The scaffolder marks unwritten ones and `demo:check` keeps warning.
3. `bun run demo:check`, then `bun run demo:build` for the deck, runbook, and appendix.
