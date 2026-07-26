import { describe, expect, test } from "bun:test";
import { deriveDemo } from "../src/derive";
import { clock, RunbookSink, SlidevSink } from "../src/sinks";
import { validDemo } from "./fixture";

const derived = () => deriveDemo(validDemo());

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
    expect(files).toHaveLength(1);
    expect(files[0]!.path).toBe("deck.md");

    const deck = files[0]!.content;
    expect(deck.startsWith("---\ntheme: none\n")).toBe(true);

    // title slide + one per beat + the takeaway slide
    const slides = deck.split("\n\n---\n\n");
    expect(slides).toHaveLength(validDemo().beats.length + 2);
  });

  // Found by actually opening a generated deck: Slidev's `default` theme is a separate
  // npm package the CLI offers to install INTERACTIVELY, so a generated deck opened by a
  // script or in CI dies with "cannot prompt for installation". `none` is built in.
  test("defaults to a built-in theme so the deck opens with no install step", () => {
    expect(new SlidevSink().emit(derived())[0]!.content).toContain("\ntheme: none\n");
  });

  test("an explicit theme still wins", () => {
    expect(new SlidevSink({ theme: "seriph" }).emit(derived())[0]!.content)
      .toContain("\ntheme: seriph\n");
  });

  test("renders every claim with its evidence ref (never a bare assertion)", () => {
    const deck = new SlidevSink().emit(derived())[0]!.content;
    expect(deck).toContain("Rework and review latency dominate our measured cycle time.");
    expect(deck).toContain("<sup>`cycle-time`</sup>");
  });

  test("carries the takeaway", () => {
    expect(new SlidevSink().emit(derived())[0]!.content).toContain(validDemo().takeaway);
  });

  test("is deterministic", () => {
    expect(new SlidevSink().emit(derived())[0]!.content)
      .toBe(new SlidevSink().emit(derived())[0]!.content);
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
    const deck = new SlidevSink().emit(out)[0]!.content;

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
