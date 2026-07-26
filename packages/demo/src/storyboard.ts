// The storyboard — the demo's VIDEO track, derived rather than authored. Beats that
// carry a `visual` become scenes with computed frame ranges; beats that don't are gaps
// where the room is watching a person or a terminal, which is most of a good demo.
//
// The architectural rule this file enforces, from the research brief: **video frames
// the demo, it never replaces it.** Rendering the agentic run itself reproduces the
// documented failure mode — an opaque reel a technical audience picks apart. The
// schema already forbids a visual on a `live-demo` beat; `checkVideoBalance` here adds
// the quantitative half, so a demo cannot drift into being a video with a person
// standing next to it.
//
// Determinism is the second rule. Remotion renders by frame index, so a scene whose
// output depends on `Math.random()` or `Date.now()` renders differently every pass and
// cannot be reviewed or re-rendered reliably. `checkStoryboardDeterminism` rejects
// those tokens anywhere in a scene's props. Frame ranges are computed from durations
// and a fixed fps — never wall-clock. Pure; never throws.

import type { DemoOutput, DerivedBeat } from "./derive";
import type { DemoIssue } from "./schema";
import type { CanvasEdge, CanvasNode } from "./spec";

/** Frames per second the storyboard is computed against. Remotion's own default. */
export const DEFAULT_FPS = 30;

export interface StoryboardOptions {
  fps?: number;
}

/** One rendered scene, placed on the frame timeline. */
export interface StoryboardScene {
  beatId: string;
  beatTitle: string;
  /** remocn/Remotion component name. */
  scene: string;
  props: Record<string, unknown>;
  transition: "cut" | "fade" | "wipe" | "slide";
  /** Inclusive start frame, exclusive end frame — Remotion's `Sequence` convention. */
  from: number;
  durationInFrames: number;
}

/** One architecture canvas, with positions DERIVED from the graph. */
export interface StoryboardCanvas {
  beatId: string;
  beatTitle: string;
  nodes: Array<CanvasNode & { x: number; y: number }>;
  edges: CanvasEdge[];
  /** Resolution issues: an edge naming a node that isn't there. */
  issues: DemoIssue[];
}

export interface Storyboard {
  fps: number;
  /** Total frames across the whole demo (including the un-videoed parts). */
  totalFrames: number;
  scenes: StoryboardScene[];
  canvases: StoryboardCanvas[];
  /** Seconds covered by a visual — what `checkVideoBalance` measures. */
  visualSec: number;
  /** Seconds of live agentic run — the substance the video must not outweigh. */
  liveSec: number;
}

/** A DURATION in frames. Floors at 1: a zero-length scene renders nothing, which is
 *  never what the author meant. */
const durationFrames = (sec: number, fps: number): number => Math.max(1, Math.round(sec * fps));

/** An OFFSET in frames. No floor — frame 0 is where the demo starts, and clamping it
 *  to 1 would silently shift the whole timeline by a frame. */
const frameAt = (sec: number, fps: number): number => Math.round(sec * fps);

/** Derive the storyboard. Pure: same demo, same frames, every time. */
export function buildStoryboard(output: DemoOutput, opts: StoryboardOptions = {}): Storyboard {
  const fps = opts.fps ?? DEFAULT_FPS;
  const scenes: StoryboardScene[] = [];
  const canvases: StoryboardCanvas[] = [];
  let visualSec = 0;
  let liveSec = 0;

  for (const b of output.beats) {
    if (b.beat.kind === "live-demo") liveSec += b.beat.durationSec;

    const visual = b.beat.visual;
    if (!visual) continue;
    visualSec += b.beat.durationSec;

    if (visual.kind === "scene") {
      scenes.push({
        beatId: b.beat.id,
        beatTitle: b.beat.title,
        scene: visual.scene,
        props: visual.props ?? {},
        transition: visual.transition ?? "cut",
        from: frameAt(b.startSec, fps),
        durationInFrames: durationFrames(b.beat.durationSec, fps),
      });
    } else {
      canvases.push(layoutCanvas(b, visual.nodes, visual.edges));
    }
  }

  return {
    fps,
    totalFrames: durationFrames(output.totalSec, fps),
    scenes,
    canvases,
    visualSec,
    liveSec,
  };
}

const COLUMN_WIDTH = 320;
const ROW_HEIGHT = 160;

/** Deterministic layered layout: one column per `group` in first-appearance order,
 *  nodes stacked within it. Authors describe the graph; positions are never authored,
 *  so two people describing the same architecture get the same diagram. */
function layoutCanvas(b: DerivedBeat, nodes: CanvasNode[], edges: CanvasEdge[]): StoryboardCanvas {
  const groups: string[] = [];
  for (const n of nodes) {
    const g = n.group ?? "";
    if (!groups.includes(g)) groups.push(g);
  }

  const rowByGroup = new Map<string, number>();
  const placed = nodes.map((n) => {
    const g = n.group ?? "";
    const row = rowByGroup.get(g) ?? 0;
    rowByGroup.set(g, row + 1);
    return { ...n, x: groups.indexOf(g) * COLUMN_WIDTH, y: row * ROW_HEIGHT };
  });

  const ids = new Set(nodes.map((n) => n.id));
  const issues: DemoIssue[] = [];
  for (const e of edges) {
    for (const end of [e.from, e.to]) {
      if (!ids.has(end)) {
        issues.push({
          level: "error",
          path: `beats[${b.beat.id}].visual.edges`,
          message: `edge references unknown node "${end}"`,
        });
      }
    }
  }

  return { beatId: b.beat.id, beatTitle: b.beat.title, nodes: placed, edges, issues };
}

const NONDETERMINISTIC = ["Math.random", "Date.now", "new Date", "performance.now"];

/** Reject nondeterminism smuggled into scene props. Remotion renders by frame index;
 *  a scene that reads a clock or an RNG renders differently every pass, which makes it
 *  unreviewable and unreproducible. */
export function checkStoryboardDeterminism(board: Storyboard): DemoIssue[] {
  const issues: DemoIssue[] = [];

  const walk = (value: unknown, scene: StoryboardScene, path: string): void => {
    if (typeof value === "string") {
      for (const token of NONDETERMINISTIC) {
        if (value.includes(token)) {
          issues.push({
            level: "error",
            path: `beats[${scene.beatId}].visual.${path}`,
            message:
              `scene prop contains "${token}" — a scene must render identically from its ` +
              "frame index alone, or it cannot be re-rendered or reviewed",
          });
        }
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, scene, `${path}[${i}]`));
      return;
    }
    if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) walk(v, scene, `${path}.${k}`);
    }
  };

  for (const scene of board.scenes) walk(scene.props, scene, "props");
  return issues;
}

/** The quantitative half of "video frames the demo, it never replaces it": the
 *  pre-rendered runtime must not outweigh the live agentic runtime. Only fires when
 *  the demo actually has a video track — a demo with no visuals is unaffected. */
export function checkVideoBalance(board: Storyboard): DemoIssue[] {
  if (board.visualSec === 0) return [];

  if (board.liveSec === 0) {
    return [{
      level: "error",
      path: "beats",
      message:
        `${Math.round(board.visualSec)}s of pre-rendered video and no live beat — ` +
        "that is a reel, which is the failure mode this gate exists to prevent",
    }];
  }

  if (board.visualSec >= board.liveSec) {
    return [{
      level: "error",
      path: "beats",
      message:
        `${Math.round(board.visualSec)}s of pre-rendered video vs ${Math.round(board.liveSec)}s ` +
        "of live agentic run — video frames the demo, it never replaces it; cut the video " +
        "track or lengthen the live beat",
    }];
  }

  return [];
}

/** Canvas resolution issues, surfaced through the same gate as everything else. */
export function checkCanvases(board: Storyboard): DemoIssue[] {
  return board.canvases.flatMap((c) => c.issues);
}
