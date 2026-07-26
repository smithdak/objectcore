# Handoff — plan 016 demo studio, finishing the last mile

Written 2026-07-26 at the end of a long session. Everything below is verified state,
not intention. Read the "one broken thing" section before touching anything.

> **RESOLVED 2026-07-26, later the same day.** `demo:verify` runs and is proven both
> ways — green on the two built decks (22 slides), red on a deck broken on purpose, one
> finding per check. The "one broken thing" section below is kept as the record of what
> was known at handoff time; it is no longer a to-do. The one-line fix it names was not
> the whole story — four further defects sat behind it, listed in the commit message and
> in the `rendered-verification` KB entry. Items under "Still open, beyond this branch"
> remain open.

## Where things stand

**Branch `fix/slidev-default-theme` → PR #49, 9 commits, all pushed, CI last seen green.**
`main` is at `f33e5c3` (plan 016 P0–P6 merged earlier via PR #48). The 9 commits on this
branch are the visual/motion/video work that came after that merge.

The maintainer's last instruction was **"commit and push to main"**. That has NOT been
done — the work is still on the PR branch with uncommitted changes on top. Finishing
that is the primary job.

### Uncommitted working tree

| Path | State |
|---|---|
| `scripts/demo-verify.ts` | **NEW, BROKEN.** The rendered-verification check. See below. |
| `scripts/_browser.ts` | NEW, working. Shared "where is Chrome" lookup. |
| `scripts/demo-render.ts` | MODIFIED, working. Now uses `_browser.ts` instead of its own copy. |
| `package.json` | MODIFIED. Adds `demo:verify` script + `playwright-chromium` devDependency. |
| `.codex/` | Untracked, not mine — leave it alone or gitignore it. Do not commit it. |

`bunx tsc` is clean and `bun run check` was green before `demo:verify` was added.
**Re-run `bun run check` before committing** — `demo:verify` is deliberately NOT part of
it, so a broken `demo-verify.ts` should not affect the gate, but verify that.

## The one broken thing

`scripts/demo-verify.ts` — the rendered check. Its purpose is the real gap this session
exposed: **every gate in this repo reasons about the spec, nothing renders the artifact
and asserts on the result.** Eight real defects this session lived in that blind spot
while `tsc` was clean and 178 unit tests were green.

It loads a built deck in a real browser and asserts three things:

1. **overflow** — no element's box extends past its slide frame
2. **dead rules** — every `.demo-*` class the stylesheet defines matches ≥1 element
   (this is the one that catches a rule written for `.two-cols` when Slidev emits
   `two-columns` — CSS present, valid, matching nothing; that bug happened twice)
3. **empty slides** — no slide renders with zero text (catches a doubled separator)

### What is wrong with it

It does not run. The remaining fix is ONE LINE, then it needs an end-to-end run:

```ts
// scripts/demo-verify.ts, ~line 41 — currently Bun's spelling, but this file runs
// under NODE (see below), which uses `import.meta.dirname`.
const root = join(import.meta.dir, "..");        // ← wrong
const root = join(import.meta.dirname, "..");    // ← apply this
```

After that, run `bun run demo:build && bun run demo:verify` and expect it to either
pass cleanly or report findings. **It has never completed a successful run**, so treat
the first green as unproven until you have watched it fail on something deliberately
broken (e.g. shrink a slide's frame or add a `.demo-nonexistent` rule and confirm it is
reported).

### Why it runs under Node, not Bun

Playwright drives the browser over `--remote-debugging-pipe`, and when asked, a
WebSocket. **Neither survives Bun on this platform** — the browser process starts (you
see a pid) and the connection then times out at 30s or 180s. I tried, in order:
`chromium.launch()` under Bun (timeout), launching Chrome myself with
`--remote-debugging-port` and `chromium.connectOverCDP()` under Bun (the HTTP endpoint
answers and returns a `webSocketDebuggerUrl`, then the WS connect times out). Node 26
runs it fine and strips TypeScript natively, so the script stays a `.ts` file with no
build step.

Consequences, already handled in the file but worth knowing if you refactor:
- it may **not** import workspace packages (Node cannot resolve them), which is why the
  deck listing is inlined instead of using `listDemoDirs`
- the relative import must carry its extension: `from "./_browser.ts"`
- `package.json` runs it as `node scripts/demo-verify.ts`, not `bun run`

### Also true of the browser itself

Playwright pins an exact browser build and reports "no browser" when the installed one
differs — with a perfectly good Chrome on disk. `scripts/_browser.ts` resolves this for
both `demo:verify` and `demo:render`: explicit env override → Playwright's cache,
newest build first → system Chrome. Remotion had the identical failure (its own
download reports success and then cannot be found; `remotion browser ensure` fails the
same way), which is why the lookup is shared rather than duplicated.

If you decide the rendered check is not worth the trouble, **deleting it is a legitimate
call** — say so explicitly rather than committing it broken. The `_browser.ts` +
`demo-render.ts` changes are independently good and should land either way.

## What to do

1. Apply the one-line fix; get `demo:verify` to a proven pass **and** a proven failure.
2. `bun run check` green.
3. Commit the working tree (NOT `.codex/`).
4. Merge PR #49 into main: `gh pr merge 49 --squash --delete-branch`.
   Merging to main auto-publishes plugins at their current versions and runs deploy —
   that is expected and correct here; no plugin changed in these 9 commits.
5. `git checkout main && git pull --ff-only` and confirm CI green on main.

## Known-good verification commands

```bash
bun run demo:check                    # gates both demos (structure/evidence/de-slop/budget/video)
bun run demo:build                    # derives deck, runbook, evidence, storyboard, canvas
bun run demo:render objectcore        # renders Opener/Frame/BRoll MP4s (needs packages/demo-video install)
bunx @slidev/cli@latest dist/demos/objectcore/deck.md     # open a deck
bun run design:seed --list            # the 15 curated palettes
```

Two demos exist: `demos/objectcore` (indigo, the dogfood) and `demos/operating-layer`
(inkwell/paper, warm editorial — recreates a reference consulting deck the maintainer
supplied, using the stats/chain/timeline/columns archetypes).

## Still open, beyond this branch

- **`record-eval-history` is unarmed.** The workflow is inert until the repo variable
  `OBJECTCORE_RECORD_HISTORY=true` is set, so the graded-73 datapoint from the PR #48
  merge was never recorded and the OQ4 trend is not accumulating. Arming it grants CI
  `contents: write` to push to main — a posture change I deliberately left to the
  maintainer. `gh variable set OBJECTCORE_RECORD_HISTORY --body true` then
  `gh workflow run record-history.yml` backfills.
- **Forge hook-script gap** (`plans/notes/016-demo-studio-forge-gaps.md`, Gap 1). Forge
  emits `hooks.json` referencing a script it never writes; the plugin passes every gate
  and ships a dangling hook. Recommended fix is a write-time guard in
  `packages/forge/src/scaffold.ts` — inside the F7 self-edit boundary, so
  `forge-improver` can do it. Not implemented.
- **Code-card archetype.** The reference deck leans heavily on terminal-plus-annotation
  slides; we have `stats`/`chain`/`timeline`/`columns`/`canvas`/`scene` but no code card.
  Adding one is a table entry in `checkItemList` plus a renderer and CSS block.

## Lessons worth not relearning

Captured in the KB already: `retrieval-id-magnet`,
`a-prose-lint-cannot-tell-mention-from-use-...`,
`forge-emits-hooks-json-but-never-the-script-...`,
`the-demo-engine-emits-render-formats-and-depends-on-no-renderer-...`.

Not yet captured, and the biggest one: **a generated visual artifact needs rendered
verification, because the whole class of defect it suffers from is invisible to types
and unit tests.** Slidev's layout NAME and its CSS CLASS are not the same string
(`two-cols` → `two-columns`, `cover` → `cover` but never `slidev-layout-cover`) — I
assumed otherwise twice. Read class names off the element, never from the docs' shape.
