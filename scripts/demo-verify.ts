// `bun run demo:verify [<name>]` — the RENDERED check.
//
// Every other gate in this repo reasons about the spec: `demo:check` proves a claim
// resolves and the arc oscillates, `design:check` proves contrast in the token math,
// `tsc` proves the types line up. None of them render anything. Building the demo
// engine, every real defect lived in that blind spot — a deck that would not open, a
// stylesheet that never applied because a `<style>` inside a slide is slide-scoped,
// nineteen slides emitted for a ten-slide deck, and twice a CSS rule written against a
// class name the framework does not actually use. `tsc` was clean and 178 unit tests
// were green through all of it.
//
// So this loads the built deck in a real browser and asserts on the RESULT:
//
//   1. OVERFLOW      — no element's box extends past its slide frame. Catches the
//                      clipped-content class directly.
//   2. DEAD RULES    — every `.demo-*` class the stylesheet defines matches at least
//                      one element somewhere in the deck. This is the one that catches
//                      a rule written for `.two-cols` when the framework emits
//                      `two-columns`: the CSS is present, valid, and matches nothing.
//   3. EMPTY SLIDES  — no slide renders with no visible text. Catches a doubled slide
//                      separator, which silently inserts blanks between real slides.
//
// NOT part of `bun run check`, for the same reason as `check:versions` and `kb:verify`:
// it needs something the gate cannot assume — here a browser. Self-gates to a clean
// skip when Playwright is absent, and says how to get it.
//
//   bun add -d playwright-chromium      # once, then re-run
//
// Runs under NODE rather than Bun. Playwright drives the browser over a debugging pipe
// (and, when asked, a WebSocket); neither survives Bun on this platform — the browser
// starts and the connection then times out. Node 22+ strips TypeScript natively, so the
// script stays a .ts file with no build step. The cost is that it may not import
// workspace packages, which is why the deck listing below is inlined.

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { readdirSync } from "node:fs";
import { findBrowser } from "./_browser.ts";

const root = join(import.meta.dirname, "..");
const distRoot = join(root, "dist", "demos");
const only = process.argv[2];

interface Finding {
  demo: string;
  slide: number;
  kind: "overflow" | "dead-rule" | "empty-slide";
  detail: string;
}

// ── Playwright is optional; absence is a skip, never a silent pass ───────────
let chromium: typeof import("playwright-chromium").chromium;
try {
  ({ chromium } = await import("playwright-chromium"));
} catch {
  console.log(
    "demo:verify — [skipped] Playwright is not installed.\n" +
    "  Install it once with `bun add -d playwright-chromium`, then re-run.\n" +
    "  (This check is deliberately outside `bun run check` because it needs a browser.)",
  );
  process.exit(0);
}

/** Built decks under the dist demos root. Inlined rather than imported from
 *  `@objectcore/demo`: this script runs under Node (see the header), which cannot
 *  resolve the workspace's TypeScript sources. One readdir is a fair price for that. */
function builtDecks(): string[] {
  try {
    return readdirSync(distRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

const names = builtDecks().filter((n) => existsSync(join(distRoot, n, "deck.md")));
const targets = only ? names.filter((n) => n === only) : names;

if (targets.length === 0) {
  console.log(
    only
      ? `demo:verify — no built deck for "${only}". Run \`bun run demo:build ${only}\` first.`
      : "demo:verify — no built decks under dist/demos/*/ (run `bun run demo:build`).",
  );
  process.exit(0);
}

/** Slidev, PINNED — never `@latest`.
 *
 *  `@latest` re-resolves over the network on every run and silently changes version
 *  underneath a check whose whole job is reproducibility: the deck that passed yesterday
 *  can fail today because the renderer moved, and the finding will point at the deck.
 *  Pinning also means bunx serves it from cache after the first run.
 *
 *  It stays a `bunx` invocation rather than a root devDependency deliberately. Installing
 *  @slidev/cli here pulls ~1200 packages and a second `@types/node` into the workspace,
 *  which breaks `bunx tsc` — a check that IS in `bun run check` — for the sake of one
 *  that is not. Heavy renderer dependencies live on the far side of a seam in this repo
 *  (Remotion in `packages/demo-video`, the MCP SDK in `knowledge-mcp`); the root stays
 *  thin. */
const SLIDEV_PIN = "@slidev/cli@52.18.0";

/** The REAL bunx binary, not the shell shim.
 *
 *  `spawn("bunx", …, { shell: true })` runs a `.cmd` wrapper that launches bunx and then
 *  exits. The pid we hold dies immediately, its children are reparented, and the tree
 *  kill has nothing left to walk — which is precisely how four Slidev servers ended up
 *  orphaned on four ports during this script's development. Spawning the executable
 *  itself means the pid we hold is the pid that owns the tree.
 *
 *  Undefined means "not found": the caller falls back to the shim, which starts fine and
 *  only makes teardown best-effort. */
function findBunx(): string | undefined {
  const home = process.env.USERPROFILE ?? process.env.HOME;
  const candidates = [
    process.env.BUN_INSTALL && join(process.env.BUN_INSTALL, "bin", "bunx.exe"),
    home && join(home, ".bun", "bin", "bunx.exe"),
    process.env.APPDATA && join(process.env.APPDATA, "npm", "node_modules", "bun", "bin", "bunx.exe"),
  ].filter((c): c is string => typeof c === "string");
  return candidates.find((c) => existsSync(c));
}

const BUNX = process.platform === "win32" ? findBunx() : undefined;

/** Stop a dev server AND its descendants.
 *
 *  `child.kill()` alone is not enough: the chain is bunx -> slidev -> vite, so the pid we
 *  hold is not always the pid holding the port. A leaked server keeps its port, the next
 *  run's `--port` silently lands elsewhere, and the probe then inspects a stale deck. A
 *  false green is the worst outcome a check can have, so this kills the whole tree. */
function killTree(child: ChildProcess): void {
  if (child.pid === undefined) return;
  if (process.platform === "win32") {
    // spawnSync, not spawn: the reap must COMPLETE before we move on. Fired
    // asynchronously it loses the race against the `process.exit` at the end of the run,
    // and the server survives the process that was supposed to end it.
    try { spawnSync("taskkill", ["/F", "/T", "/PID", String(child.pid)], { stdio: "ignore" }); }
    catch { /* already gone */ }
  }
  try { child.kill(); } catch { /* already gone */ }
}

/** Start a Slidev dev server for one built deck and resolve the URL it actually bound.
 *
 *  The URL is READ OFF the banner rather than assembled from the port we asked for:
 *  Vite silently increments past a busy port, so `--port 3801` is a request, not a fact,
 *  and trusting it points the browser at nothing (or at another deck's server). */
function serve(dir: string, port: number): Promise<{ url: string; stop: () => void }> {
  return new Promise((resolve, reject) => {
    const child: ChildProcess = spawn(
      BUNX ?? "bunx",
      [SLIDEV_PIN, "deck.md", "--port", String(port)],
      { cwd: dir, shell: !BUNX && process.platform === "win32", detached: process.platform !== "win32" },
    );
    const stop = () => killTree(child);
    const timer = setTimeout(() => { stop(); reject(new Error("slidev did not start in 120s")); }, 120_000);

    // The banner is colorized, and the colour runs THROUGH the URL — the port arrives as
    // `http://localhost:\e[1m3810\e[22m/`. Strip the escapes before matching, or the
    // pattern misses a URL that is plainly there and the start times out at 180s.
    let banner = "";
    const ANSI = /\u001b\[[0-9;]*m/g;
    const watch = (buf: Buffer) => {
      banner += String(buf).replace(ANSI, "");
      if (!/public slide show/i.test(banner)) return;
      const url = banner.match(/http:\/\/localhost:\d+\//);
      if (!url) return;
      clearTimeout(timer);
      resolve({ url: url[0], stop });
    };
    child.stdout?.on("data", watch);
    child.stderr?.on("data", watch);
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
  });
}

/** What the in-page probe returns. `defined`/`used` are raw class-name lists rather than
 *  a verdict: whether a rule is dead is a question about the CORPUS, not one deck (see
 *  the dead-rule reconciliation after the loop), so the page reports and the caller
 *  decides. */
interface ProbeResult {
  slideCount: number;
  overflow: Array<{ slide: number; detail: string }>;
  empty: Array<{ slide: number; detail: string }>;
  defined: string[];
  used: string[];
}

/** The probe runs IN THE PAGE, not in this process, so it is passed as source text.
 *  That keeps `document` and friends out of this file's type environment — the
 *  alternative is adding "DOM" to the workspace tsconfig, which would let every Node
 *  script reference browser globals that do not exist there. The boundary is real, so
 *  it is spelled out rather than blurred. The shape it returns is `ProbeResult`.
 *
 *  It is an IIFE, not a bare arrow, because a string argument to `page.evaluate` is
 *  evaluated as an EXPRESSION: `"() => {...}"` yields a function object, which is not
 *  serializable, so the call resolves to `undefined` and every assertion below silently
 *  passes. Exactly the defect class this script exists to catch — it caught itself. */
const PAGE_PROBE = `(() => {
  const slides = [...document.querySelectorAll(".slidev-layout")];

  const overflow = slides.flatMap((el, i) => {
    const box = el.getBoundingClientRect();
    return [...el.querySelectorAll("h1,h2,p,li,svg")]
      .map((c) => {
        const b = c.getBoundingClientRect();
        return { over: Math.round(b.bottom - box.bottom), text: (c.textContent || "").trim().slice(0, 48) };
      })
      // 2px absorbs sub-pixel rounding; empty nodes are chrome, not content.
      .filter((x) => x.over > 2 && x.text.length > 0)
      .map((x) => ({ slide: i + 1, detail: x.over + "px past the frame: \\"" + x.text + "\\"" }));
  });

  const empty = slides
    .map((el, i) => ({ i: i + 1, text: (el.textContent || "").trim() }))
    .filter((s) => s.text.length === 0)
    .map((s) => ({ slide: s.i, detail: "slide renders no text at all" }));

  // Report what the stylesheet DEFINES and what this deck actually USES. The verdict is
  // the caller's, because the stylesheet is shared across every deck.
  const defined = new Set();
  for (const sheet of [...document.styleSheets]) {
    let rules;
    try { rules = sheet.cssRules; } catch (e) { continue; }
    for (const rule of [...rules]) {
      const sel = rule.selectorText;
      if (!sel) continue;
      const found = sel.match(/\\.demo-[a-z0-9-]+/g) || [];
      for (const f of found) defined.add(f.slice(1));
    }
  }
  const used = [...defined].filter((cls) => document.getElementsByClassName(cls).length > 0);

  return { slideCount: slides.length, overflow, empty, defined: [...defined], used };
})()`;

const findings: Finding[] = [];
let slidesChecked = 0;
let port = 3801;

// Dead rules are reconciled across the whole corpus, not per deck — see the note after
// the loop. Every deck contributes to both sets.
const definedAnywhere = new Set<string>();
const usedAnywhere = new Set<string>();

// Playwright pins an exact browser build and reports "no browser" when the installed
// one differs — with a perfectly good browser on disk. Hand it the path we found.
const executablePath = findBrowser();
if (executablePath) console.log(`  using browser: ${executablePath}`);
const browser = await chromium.launch(executablePath ? { executablePath } : {});

for (const name of targets) {
  const dir = join(distRoot, name);
  console.log(`\n▸ ${relative(root, dir)}`);

  let server: { url: string; stop: () => void };
  try {
    server = await serve(dir, port++);
  } catch (e) {
    console.error(`  ✗ could not serve the deck: ${(e as Error).message}`);
    findings.push({ demo: name, slide: 0, kind: "empty-slide", detail: (e as Error).message });
    continue;
  }

  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  try {
    // The EXPORT route, not the deck root. Slidev's normal view keeps only the current
    // slide and its neighbour in the DOM: probing the root of a ten-slide deck finds two
    // slides and calls every class belonging to the other eight a dead rule — a wall of
    // false positives. `/export` is the one route that renders the whole deck at once
    // (`/print` does not; measured, not assumed).
    await page.goto(`${server.url}export`, { waitUntil: "networkidle" });
    await page.waitForSelector(".slidev-layout", { timeout: 60_000 });
    const result = (await page.evaluate(PAGE_PROBE)) as ProbeResult;
    if (!result || typeof result.slideCount !== "number") {
      throw new Error("the in-page probe returned nothing — it must be an IIFE expression");
    }

    slidesChecked += result.slideCount;
    for (const o of result.overflow) findings.push({ demo: name, kind: "overflow", ...o });
    for (const e of result.empty) findings.push({ demo: name, kind: "empty-slide", ...e });
    for (const c of result.defined) definedAnywhere.add(c);
    for (const c of result.used) usedAnywhere.add(c);

    const bad = result.overflow.length + result.empty.length;
    console.log(
      bad === 0
        ? `  ✓ ${result.slideCount} slide(s): nothing overflows, no blank slides`
        : `  ✗ ${result.slideCount} slide(s): ${bad} finding(s)`,
    );
  } finally {
    await page.close();
    server.stop();
  }
}

await browser.close();

// ── Dead rules, reconciled across every deck ─────────────────────────────────
//
// The stylesheet is SHARED: one block of CSS is emitted for every deck, covering every
// figure archetype. So "this deck matches no `.demo-stats`" is not a defect — that deck
// simply has no stats figure. Judging per deck reported 23 healthy classes as dead.
//
// The defect actually worth catching is a rule that matches nothing ANYWHERE: a selector
// written for `.two-cols` when the renderer emits `two-columns`. Present, valid, and
// permanently inert. That is a question about the corpus, so it is answered here, once
// every deck has voted.
//
// It is therefore only sound over the FULL corpus. Verifying a single deck cannot see
// the classes its siblings use, so the check is skipped and says so — an unsound check
// silently reporting nothing is how a gate rots.
if (only) {
  console.log(
    `\n  · dead-rule check skipped: it compares the shared stylesheet against every deck,` +
    `\n    and only "${only}" was verified. Run \`bun run demo:verify\` with no argument.`,
  );
} else {
  for (const cls of [...definedAnywhere].filter((c) => !usedAnywhere.has(c)).sort()) {
    findings.push({
      demo: "(corpus)",
      slide: 0,
      kind: "dead-rule",
      detail: `.${cls} is defined but matches no element in any deck`,
    });
  }
}

for (const f of findings) {
  const where = f.slide > 0 ? `slide ${f.slide}` : "deck";
  console.error(`  ✗ [${f.demo}] ${where} — ${f.kind}: ${f.detail}`);
}

console.log(
  findings.length
    ? `\n✗ demo:verify FAILED — ${findings.length} finding(s) across ${slidesChecked} rendered slide(s)`
    : `\n✓ demo:verify passed — ${slidesChecked} rendered slide(s) across ${targets.length} demo(s)`,
);
// Exit explicitly. A dev server we spawned can outlive its kill signal briefly, and its
// pipes keep the event loop alive — the verdict prints and the process then sits there
// forever. The verdict is complete by here, so leaving is safe; anything still running is
// something `killTree` has already been told to end.
process.exit(findings.length ? 1 : 0);
