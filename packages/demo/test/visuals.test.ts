import { describe, expect, test } from "bun:test";
import { deriveDemo } from "../src/derive";
import { SlidevSink } from "../src/sinks";
import { runDemoGate } from "../src/gate";
import { buildStoryboard } from "../src/storyboard";
import { validateDemoSpec } from "../src/schema";
import { validDemo } from "./fixture";
import type { BeatVisual, DemoSpec } from "../src/spec";

/** Put a visual on a non-live beat and render the deck. */
function withVisual(visual: BeatVisual): { spec: DemoSpec; deck: string } {
  const spec = validDemo();
  spec.beats.find((b) => b.id === "what-changes")!.visual = visual;
  const deck = new SlidevSink().emit(deriveDemo(spec)).find((f) => f.path === "deck.md")!.content;
  return { spec, deck };
}

const errors = (spec: DemoSpec) => validateDemoSpec(spec).filter((i) => i.level === "error");

describe("figure archetypes", () => {
  test("stats render as a figure row with staggered entrances", () => {
    const { deck } = withVisual({
      kind: "stats",
      items: [{ value: "45", label: "repositories" }, { value: "10", label: "languages" }],
      note: "the fine print",
    });
    expect(deck).toContain('class="demo-stats"');
    expect(deck).toContain(">45<");
    expect(deck).toContain(">repositories<");
    expect(deck).toContain("the fine print");
    // second figure enters after the first
    expect(deck).toContain("animation-delay:90ms");
  });

  test("a chain renders its steps with connectors between them", () => {
    const { deck } = withVisual({
      kind: "chain",
      steps: [{ label: "Context" }, { label: "Tools", detail: "what can change?" }, { label: "Feedback" }],
    });
    expect(deck).toContain('class="demo-chain"');
    expect(deck).toContain(">Context<");
    expect(deck).toContain("what can change?");
    // n steps ⇒ n-1 connectors, never a trailing one
    expect(deck.match(/demo-step-link/g)).toHaveLength(2);
  });

  test("a timeline renders dated milestones under one rule", () => {
    const { deck } = withVisual({
      kind: "timeline",
      items: [{ when: "Dec", label: "Document" }, { when: "Mar", label: "Remember" }],
    });
    expect(deck).toContain('class="demo-timeline"');
    expect(deck).toContain("demo-timeline-rule");
    expect(deck).toContain(">Dec<");
  });

  test("columns render headings, points and an optional tag", () => {
    const { deck } = withVisual({
      kind: "columns",
      columns: [
        { heading: "Verifier", points: ["Does it build?"], tag: "Evidence required" },
        { heading: "Critic", points: ["What remains?"] },
      ],
    });
    expect(deck).toContain('class="demo-columns"');
    expect(deck).toContain(">Verifier<");
    expect(deck).toContain("Does it build?");
    expect(deck).toContain("Evidence required");
  });

  test("authored content is escaped inside every archetype", () => {
    const { deck } = withVisual({
      kind: "stats",
      items: [{ value: "<b>9</b>", label: "a & b" }, { value: "2", label: "x" }],
    });
    expect(deck).toContain("&lt;b&gt;9&lt;/b&gt;");
    expect(deck).toContain("a &amp; b");
  });

  test("every archetype leaves the demo gate green", () => {
    for (const visual of [
      { kind: "stats", items: [{ value: "1", label: "a" }, { value: "2", label: "b" }] },
      { kind: "chain", steps: [{ label: "a" }, { label: "b" }] },
      { kind: "timeline", items: [{ when: "Dec", label: "a" }, { when: "Mar", label: "b" }] },
      { kind: "columns", columns: [{ heading: "a", points: ["x"] }, { heading: "b", points: ["y"] }] },
    ] as BeatVisual[]) {
      const spec = validDemo();
      spec.beats.find((b) => b.id === "what-changes")!.visual = visual;
      expect(errors(spec)).toEqual([]);
      expect(runDemoGate(deriveDemo(spec)).ok).toBe(true);
    }
  });

  // These are slide layouts, not pre-rendered film. Counting them would make an
  // ordinarily-illustrated deck look like a reel to the video-balance rule.
  test("figure archetypes do not count as pre-rendered video", () => {
    const { spec } = withVisual({
      kind: "stats",
      items: [{ value: "1", label: "a" }, { value: "2", label: "b" }],
    });
    expect(buildStoryboard(deriveDemo(spec)).visualSec).toBe(0);
  });

  test("a scene still counts as video", () => {
    const { spec } = withVisual({ kind: "scene", scene: "TitleCard" });
    expect(buildStoryboard(deriveDemo(spec)).visualSec).toBe(120);
  });
});

describe("figure archetype validation", () => {
  test("rejects an unknown archetype", () => {
    const spec = validDemo();
    (spec.beats[2] as unknown as Record<string, unknown>).visual = { kind: "pie-chart" };
    expect(errors(spec)[0]!.message).toContain("must be one of: scene, canvas, stats");
  });

  test.each([
    ["stats", { kind: "stats", items: [{ value: "1", label: "a" }] }, "items"],
    ["chain", { kind: "chain", steps: [{ label: "a" }] }, "steps"],
    ["timeline", { kind: "timeline", items: [{ when: "Dec", label: "a" }] }, "items"],
    ["columns", { kind: "columns", columns: [{ heading: "a", points: ["x"] }] }, "columns"],
  ])("a %s needs at least two entries", (_name, visual, key) => {
    const spec = validDemo();
    spec.beats[2]!.visual = visual as BeatVisual;
    const found = errors(spec);
    expect(found).toHaveLength(1);
    expect(found[0]!.path).toContain(key);
  });

  test("rejects a missing required field and an unknown one", () => {
    const spec = validDemo();
    spec.beats[2]!.visual = {
      kind: "stats",
      items: [{ value: "1" }, { value: "2", label: "b", colour: "red" }],
    } as unknown as BeatVisual;
    const messages = errors(spec).map((e) => `${e.path} ${e.message}`).join("\n");
    expect(messages).toContain("items[0].label");
    expect(messages).toContain('unknown field "colour"');
  });

  test("a column's points must be a non-empty array of strings", () => {
    const spec = validDemo();
    spec.beats[2]!.visual = {
      kind: "columns",
      columns: [{ heading: "a", points: [] }, { heading: "b", points: ["y"] }],
    } as BeatVisual;
    expect(errors(spec)[0]!.path).toContain("columns[0].points");
  });
});
