import { describe, expect, test } from "bun:test";
import { deriveDemo } from "../src/derive";
import { clock, RunbookSink, SlidevSink } from "../src/sinks";
import { validDemo } from "./fixture";

const derived = () => deriveDemo(validDemo());

/** deck.md is no longer the only file the sink emits — grab it by name. */
const deckOf = (files: Array<{ path: string; content: string }>) =>
  files.find((f) => f.path === "deck.md")!.content;

describe("clock", () => {
  test("formats seconds as mm:ss", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(9)).toBe("0:09");
    expect(clock(615)).toBe("10:15");
    expect(clock(3600)).toBe("60:00");
  });
});

describe("SlidevSink", () => {
  test("emits one deck with valid frontmatter and a slide per beat", () => {
    const files = new SlidevSink().emit(derived());
    const deck = deckOf(files);
    expect(deck.startsWith("---\ntheme: none\n")).toBe(true);

    // Each slide opens with its own `---\nlayout: x\n---`, and in Slidev THAT is the
    // separator. Emitting a slide break as well once produced a blank slide ahead of
    // every real one (19 slides for a 10-slide deck).
    const layouts = deck.match(/(?<=\n)layout: /g) ?? [];
    expect(layouts).toHaveLength(validDemo().beats.length + 2);
  });

  // Found by actually opening a generated deck: Slidev's `default` theme is a separate
  // npm package the CLI offers to install INTERACTIVELY, so a generated deck opened by a
  // script or in CI dies with "cannot prompt for installation". `none` is built in.
  test("defaults to a built-in theme so the deck opens with no install step", () => {
    expect(deckOf(new SlidevSink().emit(derived()))).toContain("\ntheme: none\n");
  });

  test("an explicit theme still wins", () => {
    expect(deckOf(new SlidevSink({ theme: "seriph" }).emit(derived())))
      .toContain("\ntheme: seriph\n");
  });

  // A keynote cites; it does not wear its citations as badges. Refs render as
  // superscript footnote markers numbered within the slide; the ids stay in the
  // speaker notes and the evidence appendix, where they are actually looked up.
  test("renders every claim with a footnote marker (never a bare assertion)", () => {
    const deck = deckOf(new SlidevSink().emit(derived()));
    expect(deck).toContain("Rework and review latency dominate our measured cycle time.");
    expect(deck).toContain('<span class="demo-ref">1</span>');
    // the live beat cites two sources on one claim
    expect(deck).toContain('<span class="demo-ref">1,2</span>');
  });

  test("a claim with no backing renders no marker", () => {
    const spec = validDemo();
    spec.beats[1]!.claims![0]!.evidence = [];
    const deck = deckOf(new SlidevSink().emit(deriveDemo(spec)));
    expect(deck).toContain("- Rework and review latency dominate our measured cycle time.\n");
  });

  // The arc IS the design: layout is derived from beat kind, never authored.
  test("derives a Slidev layout per beat kind", () => {
    const deck = deckOf(new SlidevSink().emit(derived()));
    expect(deck).toContain("layout: cover");      // opener
    expect(deck).toContain("layout: two-cols");   // the live beat splits task vs traces
    expect(deck).toContain("layout: statement");  // the STAR moment
    expect(deck).toContain("layout: center");     // the close
  });

  // Slidev scopes a `<style>` block inside a slide to THAT slide — the deck rendered
  // completely unstyled until this moved out into an injected style.css.
  test("emits the stylesheet as a separate style.css, not an in-slide <style>", () => {
    const files = new SlidevSink().emit(derived());
    expect(files.map((f) => f.path).sort())
      .toEqual(["deck.md", "global-bottom.vue", "style.css"]);

    const css = files.find((f) => f.path === "style.css")!.content;
    expect(css).toContain(".slidev-layout h1");
    // written against the design engine's semantic roles, with fallbacks
    expect(css).toContain("var(--bg-base,");
    expect(css).toContain("var(--accent-default,");
    expect(css).toContain("html.dark");

    expect(files.find((f) => f.path === "deck.md")!.content).not.toContain("<style>");
  });

  test("injected design-system CSS lands ahead of the base styles", () => {
    const css = new SlidevSink({ css: ":root { --accent-default: hotpink; }" })
      .emit(derived()).find((f) => f.path === "style.css")!.content;
    expect(css).toContain("--accent-default: hotpink");
    expect(css.indexOf("hotpink")).toBeLessThan(css.indexOf(".slidev-layout h1"));
  });

  // Slidev has no autoplay, but the spec knows every beat's planned length.
  test("emits a rehearsal player carrying the derived timeline", () => {
    const player = new SlidevSink().emit(derived())
      .find((f) => f.path === "global-bottom.vue")!.content;
    const spec = validDemo();
    // title slide (0) + one per beat + takeaway (0)
    expect(player).toContain(`[0, ${spec.beats.map((b) => b.durationSec).join(", ")}, 0]`);
    expect(player).toContain("useNav");
  });

  // A slide carrying nothing but a title is an outline, not a deck.
  test("a claimless beat still puts its persona's question on the slide", () => {
    const deck = deckOf(new SlidevSink().emit(derived()));
    expect(deck).toContain("Cycle time and defect escape rate, not model benchmarks.");
  });

  test("the live beat splits the task from what stays visible", () => {
    const deck = deckOf(new SlidevSink().emit(derived()));
    expect(deck).toContain("::right::");
    expect(deck).toContain("On screen throughout");
    expect(deck).toContain('<div class="demo-live">$ ');
  });

  // Prose that lands inside an HTML element is escaped. Claim bullets are NOT — they
  // are markdown by design, so an author can write `code` or emphasis in a claim.
  test("escapes prose that lands inside an HTML element", () => {
    const spec = validDemo();
    spec.beats.find((b) => b.kind === "live-demo")!.live!.task = "run <script> & wait";
    const deck = deckOf(new SlidevSink().emit(deriveDemo(spec)));
    expect(deck).toContain("run &lt;script&gt; &amp; wait");
  });

  test("declares a slide transition — a deck with none reads as a PDF", () => {
    expect(deckOf(new SlidevSink().emit(derived()))).toContain("transition: slide-left");
    expect(deckOf(new SlidevSink({ transition: "fade" }).emit(derived())))
      .toContain("transition: fade");
  });

  test("reveals multi-item lists one click at a time", () => {
    const deck = deckOf(new SlidevSink().emit(derived()));
    expect(deck).toContain("<v-clicks>");
    expect(deckOf(new SlidevSink({ progressiveReveal: false }).emit(derived())))
      .not.toContain("<v-clicks>");
  });

  test("draws a canvas beat as an assembling SVG with staggered timings", () => {
    const spec = validDemo();
    spec.beats.find((b) => b.id === "what-changes")!.visual = {
      kind: "canvas",
      nodes: [
        { id: "a", label: "Source", group: "in" },
        { id: "b", label: "Seam", group: "mid" },
      ],
      edges: [{ from: "a", to: "b" }],
    };
    const deck = deckOf(new SlidevSink().emit(deriveDemo(spec)));

    expect(deck).toContain('<svg class="demo-canvas"');
    expect(deck).toContain(">Source<");
    expect(deck).toContain('class="demo-edge"');
    // nodes stagger, then the edges draw after the last node
    expect(deck).toContain("animation-delay:0ms");
    expect(deck).toContain("animation-delay:140ms");
    expect(deck).toContain("animation-delay:280ms");
  });

  test("never draws an edge the gate reported as dangling", () => {
    const spec = validDemo();
    spec.beats.find((b) => b.id === "what-changes")!.visual = {
      kind: "canvas",
      nodes: [{ id: "a", label: "Source" }],
      edges: [{ from: "a", to: "ghost" }],
    };
    const deck = deckOf(new SlidevSink().emit(deriveDemo(spec)));
    expect(deck).toContain(">Source<");
    expect(deck).not.toContain('class="demo-edge"');
  });

  test("the stylesheet honours prefers-reduced-motion", () => {
    const css = new SlidevSink().emit(derived())
      .find((f) => f.path === "style.css")!.content;
    expect(css).toContain("@keyframes demoRise");
    expect(css).toContain("prefers-reduced-motion: reduce");
  });

  test("carries the takeaway", () => {
    expect(deckOf(new SlidevSink().emit(derived()))).toContain(validDemo().takeaway);
  });

  test("is deterministic", () => {
    expect(deckOf(new SlidevSink().emit(derived())))
      .toBe(deckOf(new SlidevSink().emit(derived())));
  });
});

describe("RunbookSink", () => {
  test("emits the operator runbook", () => {
    const files = new RunbookSink().emit(derived());
    expect(files).toHaveLength(1);
    expect(files[0]!.path).toBe("runbook.md");
  });

  test("carries the live beat's full choreography", () => {
    const book = new RunbookSink().emit(derived())[0]!.content;
    const live = validDemo().beats.find((b) => b.kind === "live-demo")!.live!;

    expect(book).toContain(live.repo);
    expect(book).toContain(live.task);
    expect(book).toContain(live.fallback);
    for (const c of live.checkpoints) expect(book).toContain(c);
    expect(book).toContain(live.expectedFailure!);
  });

  test("cue times agree with the derived timeline (one derivation, two views)", () => {
    const out = derived();
    const book = new RunbookSink().emit(out)[0]!.content;
    const deck = deckOf(new SlidevSink().emit(out));

    for (const b of out.beats) {
      // the cue-sheet row and the deck's speaker note quote the same start time
      expect(book).toContain(`| ${clock(b.startSec)} | ${b.beat.title} |`);
      expect(deck).toContain(`${clock(b.startSec)}–${clock(b.endSec)}`);
    }
  });

  test("is deterministic", () => {
    expect(new RunbookSink().emit(derived())[0]!.content)
      .toBe(new RunbookSink().emit(derived())[0]!.content);
  });
});
