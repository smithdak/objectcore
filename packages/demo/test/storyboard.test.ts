import { describe, expect, test } from "bun:test";
import { deriveDemo } from "../src/derive";
import { runDemoGate } from "../src/gate";
import { validateDemoSpec } from "../src/schema";
import {
  buildStoryboard, checkCanvases, checkStoryboardDeterminism, checkVideoBalance, DEFAULT_FPS,
} from "../src/storyboard";
import { CanvasSink, StoryboardSink } from "../src/sinks";
import { validDemo } from "./fixture";
import type { DemoSpec } from "../src/spec";

/** The fixture plus a modest video track on the framing beats (opener + star). */
function withVideo(): DemoSpec {
  const spec = validDemo();
  spec.beats[0]!.visual = {
    kind: "scene",
    scene: "TitleCard",
    props: { headline: "The pull request nobody read" },
    transition: "fade",
  };
  spec.beats.find((b) => b.id === "the-moment")!.visual = {
    kind: "scene",
    scene: "QuoteCard",
    props: { quote: "You watched it fail." },
  };
  return spec;
}

const board = (spec: DemoSpec) => buildStoryboard(deriveDemo(spec));

describe("buildStoryboard", () => {
  test("a demo with no visuals has an empty video track", () => {
    const b = board(validDemo());
    expect(b.scenes).toEqual([]);
    expect(b.canvases).toEqual([]);
    expect(b.visualSec).toBe(0);
    expect(b.liveSec).toBe(420);
  });

  test("places scenes on the frame timeline from the beat timeline", () => {
    const b = board(withVideo());
    expect(b.fps).toBe(DEFAULT_FPS);
    expect(b.scenes).toHaveLength(2);

    const [opener, star] = b.scenes;
    expect(opener!.from).toBe(0);
    expect(opener!.durationInFrames).toBe(60 * DEFAULT_FPS);
    expect(opener!.transition).toBe("fade");
    expect(star!.transition).toBe("cut"); // defaulted, not invented per-render

    // the star beat starts at 60+120+120+420+90+120 = 930s
    expect(star!.from).toBe(930 * DEFAULT_FPS);
  });

  test("fps is configurable and rescales every frame number", () => {
    const b = buildStoryboard(deriveDemo(withVideo()), { fps: 60 });
    expect(b.scenes[0]!.durationInFrames).toBe(60 * 60);
    expect(b.totalFrames).toBe(1080 * 60);
  });

  test("is deterministic", () => {
    expect(JSON.stringify(board(withVideo()))).toBe(JSON.stringify(board(withVideo())));
  });
});

describe("the video boundary (the Devin lesson, structurally)", () => {
  test("the schema rejects a visual on a live-demo beat", () => {
    const spec = validDemo();
    spec.beats.find((b) => b.kind === "live-demo")!.visual = { kind: "scene", scene: "TerminalSimulator" };
    const errors = validateDemoSpec(spec).filter((i) => i.level === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("may not carry a `visual`");
  });

  test("video that outweighs the live run fails the gate", () => {
    const spec = withVideo();
    // give the two long non-live beats a video treatment as well: 60+120+120+90 = 390s
    // is still under the 420s live beat...
    spec.beats.find((b) => b.id === "today-hurts")!.visual = { kind: "scene", scene: "StatCard" };
    spec.beats.find((b) => b.id === "still-hard")!.visual = { kind: "scene", scene: "StatCard" };
    expect(checkVideoBalance(board(spec))).toEqual([]);

    // ...but adding one more tips it to 510s, past the live run
    spec.beats.find((b) => b.id === "what-changes")!.visual = { kind: "scene", scene: "StatCard" };
    const issues = checkVideoBalance(board(spec));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain("video frames the demo, it never replaces it");
  });

  test("a demo that is all video and no live run fails distinctly", () => {
    const spec = withVideo();
    const i = spec.beats.findIndex((b) => b.kind === "live-demo");
    spec.beats.splice(i, 1);
    expect(checkVideoBalance(board(spec))[0]!.message).toContain("that is a reel");
  });

  test("a demo with no video track is unaffected by the balance rule", () => {
    expect(checkVideoBalance(board(validDemo()))).toEqual([]);
  });
});

describe("determinism lint", () => {
  test.each(["Math.random", "Date.now", "new Date", "performance.now"])(
    "rejects %s hidden in a scene prop",
    (token) => {
      const spec = withVideo();
      (spec.beats[0]!.visual as { props: Record<string, unknown> }).props = {
        seed: `${token}()`,
      };
      const issues = checkStoryboardDeterminism(board(spec));
      expect(issues).toHaveLength(1);
      expect(issues[0]!.message).toContain(token);
    },
  );

  test("walks nested props, not just top-level ones", () => {
    const spec = withVideo();
    (spec.beats[0]!.visual as { props: Record<string, unknown> }).props = {
      layers: [{ config: { jitter: "Math.random()" } }],
    };
    const issues = checkStoryboardDeterminism(board(spec));
    expect(issues[0]!.path).toBe("beats[cold-open].visual.props.layers[0].config.jitter");
  });

  test("clean props pass", () => {
    expect(checkStoryboardDeterminism(board(withVideo()))).toEqual([]);
  });
});

describe("architecture canvas", () => {
  const withCanvas = (): DemoSpec => {
    const spec = validDemo();
    spec.beats.find((b) => b.id === "what-changes")!.visual = {
      kind: "canvas",
      nodes: [
        { id: "agent", label: "Agent", group: "runtime" },
        { id: "gate", label: "Eval gate", group: "runtime" },
        { id: "kb", label: "Knowledge base", group: "storage" },
      ],
      edges: [{ from: "agent", to: "gate", label: "runs" }, { from: "gate", to: "kb" }],
    };
    return spec;
  };

  test("derives positions from the graph — authors never place nodes", () => {
    const c = board(withCanvas()).canvases[0]!;
    expect(c.nodes.map((n) => [n.id, n.x, n.y])).toEqual([
      ["agent", 0, 0],
      ["gate", 0, 160],
      ["kb", 320, 0],
    ]);
    expect(c.issues).toEqual([]);
  });

  test("the same graph always lays out the same way", () => {
    expect(JSON.stringify(board(withCanvas()).canvases))
      .toBe(JSON.stringify(board(withCanvas()).canvases));
  });

  test("an edge naming an unknown node fails the gate", () => {
    const spec = withCanvas();
    (spec.beats.find((b) => b.id === "what-changes")!.visual as { edges: Array<{ from: string; to: string }> })
      .edges.push({ from: "gate", to: "ghost" });
    const issues = checkCanvases(board(spec));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain('unknown node "ghost"');
    expect(runDemoGate(deriveDemo(spec)).ok).toBe(false);
  });
});

describe("sinks", () => {
  test("StoryboardSink emits the manifest and states the live-beat boundary", () => {
    const files = new StoryboardSink().emit(deriveDemo(withVideo()));
    expect(files).toHaveLength(1);
    expect(files[0]!.path).toBe("storyboard.json");

    const parsed = JSON.parse(files[0]!.content);
    expect(parsed.scenes).toHaveLength(2);
    expect(parsed.fps).toBe(DEFAULT_FPS);
    expect(parsed.note).toContain("never pre-rendered");
  });

  test("StoryboardSink renders exactly what the gate measured", () => {
    const output = deriveDemo(withVideo());
    const parsed = JSON.parse(new StoryboardSink().emit(output)[0]!.content);
    expect(parsed.scenes).toEqual(JSON.parse(JSON.stringify(buildStoryboard(output).scenes)));
  });

  test("CanvasSink emits nothing when there are no canvases", () => {
    expect(new CanvasSink().emit(deriveDemo(withVideo()))).toEqual([]);
  });

  test("a demo with a video track still passes the whole gate", () => {
    const result = runDemoGate(deriveDemo(withVideo()));
    expect(result.issues.filter((i) => i.level === "error")).toEqual([]);
    expect(result.stats.visualSec).toBe(120);
  });
});
