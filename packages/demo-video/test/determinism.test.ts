import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Remotion renders frames independently and often out of order across threads, so a
// scene that reads a clock or an RNG produces a different film on every pass — it
// cannot be reviewed, diffed, or re-rendered. `@objectcore/demo`'s gate already lints
// the STORYBOARD for those tokens (`checkStoryboardDeterminism`); this lints the
// COMPONENTS, so the rule holds on both sides of the seam instead of only the side
// that happens to be data.

const SRC = join(import.meta.dir, "..", "src");
const NONDETERMINISTIC = ["Math.random", "Date.now", "new Date", "performance.now"];

/** Strip comments before scanning. A source lint that cannot tell MENTION from USE
 *  flags the very comment documenting the rule — which is exactly what happened here,
 *  and is the same failure the KB records for the prose de-slop lint and the forge
 *  stub marker. For code, unlike prose, there is a correct fix: look at the code. */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")   // block comments, including JSDoc
    .replace(/(^|[^:])\/\/.*$/gm, "$1");  // line comments, sparing `https://`
}

const sources = readdirSync(SRC)
  .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
  .map((f) => ({ file: f, text: readFileSync(join(SRC, f), "utf8") }))
  .map(({ file, text }) => ({ file, text, code: stripComments(text) }));

describe("scene determinism", () => {
  test("there are scene sources to check", () => {
    expect(sources.length).toBeGreaterThan(2);
  });

  test.each(NONDETERMINISTIC)("no scene source calls %s", (token) => {
    const offenders = sources
      .filter(({ code }) => code.includes(token))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  test("animation is driven by the frame, not by elapsed time", () => {
    const scenes = sources.find((s) => s.file === "scenes.tsx")!.text;
    expect(scenes).toContain("useCurrentFrame");
    // `interpolate`/`spring` are Remotion's pure frame→value helpers.
    expect(scenes).toContain("interpolate");
    expect(scenes).toContain("spring");
  });

  test("no scene invents a value the storyboard did not carry", () => {
    // The film is a view of the derived manifest; a hardcoded demo name or repo here
    // would be a second source of truth.
    const root = sources.find((s) => s.file === "Root.tsx")!.text;
    expect(root).toContain("storyboard.json");
    expect(root).not.toContain("objectcore/objectcore");
  });
});
