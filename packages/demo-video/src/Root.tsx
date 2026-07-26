// The Remotion root — three compositions, all driven by a demo's `storyboard.json`,
// which is itself derived from the same `deriveDemo` output as the deck and the runbook.
// Nothing here is authored per demo: change the demo spec, re-run `demo:build`, and the
// film changes with it.
//
//   Opener — a ~15s cinematic open to play before you go live.
//   Frame  — opener + architecture + closing card, wiped together: the whole
//            non-substantive shell the brief calls "the frame".
//   BRoll  — the recorded fallback for a live beat, derived from the beat's own task,
//            trace surfaces and planned failure. This is the segment you cut to when
//            the live run dies; the runbook already tells the operator when.
//
// The live agentic run is never itself pre-rendered as the demo — that is the Devin
// failure mode, and the schema forbids a `visual` on a live beat. B-roll is the
// fallback the gate already REQUIRES, not a replacement for going live.

import React from "react";
import { Composition, staticFile } from "remotion";
import {
  ArchitectureCard, QuoteCard, Reel, TerminalSimulator, TitleCard,
  type TerminalLine,
} from "./scenes";
import storyboard from "./storyboard.json";

const FPS = storyboard.fps ?? 30;
const W = 1920;
const H = 1080;

const sceneProps = (name: string): Record<string, unknown> =>
  (storyboard.scenes.find((s: { scene: string }) => s.scene === name)?.props ?? {}) as Record<string, unknown>;

const titleProps = sceneProps("TitleCard");
const quoteProps = sceneProps("QuoteCard");
const canvas = storyboard.canvases?.[0];
const broll = storyboard.broll?.[0];

/** The B-roll script, derived from the live beat: the command, then the trace
 *  surfaces the gate made it declare, then the planned failure and its recovery. */
function brollLines(): TerminalLine[] {
  if (!broll) return [{ text: "no live beat in this demo", kind: "out" }];
  const lines: TerminalLine[] = [{ text: broll.task, kind: "cmd" }];
  for (const t of broll.traceSurfaces) lines.push({ text: `• ${t}`, kind: "tool" });
  if (broll.checkpoints[0]) lines.push({ text: `⏸ ${broll.checkpoints[0]}`, kind: "out" });
  if (broll.expectedFailure) {
    lines.push({ text: "✗ gate failed — see below", kind: "fail" });
    lines.push({ text: broll.expectedFailure, kind: "out" });
    lines.push({ text: "✓ fixed, re-running the gate", kind: "ok" });
  }
  return lines;
}

const OPENER_FRAMES = 15 * FPS;
const CANVAS_FRAMES = 8 * FPS;
const CLOSING_FRAMES = 7 * FPS;

export const RemotionRoot: React.FC = () => {
  const lines = brollLines();
  // Long enough to type every line, plus a beat to read the last one.
  const brollFrames = Math.max(6 * FPS, lines.length * 42 + 2 * FPS);

  return (
    <>
      <Composition
        id="Opener"
        component={TitleCard as React.FC<Record<string, unknown>>}
        durationInFrames={OPENER_FRAMES}
        fps={FPS}
        width={W}
        height={H}
        defaultProps={{
          headline: (titleProps.headline as string) ?? storyboard.title,
          sub: (titleProps.sub as string) ?? undefined,
          kicker: storyboard.demo,
        }}
      />

      <Composition
        id="Frame"
        component={FrameFilm}
        durationInFrames={OPENER_FRAMES + (canvas ? CANVAS_FRAMES : 0) + CLOSING_FRAMES}
        fps={FPS}
        width={W}
        height={H}
      />

      <Composition
        id="BRoll"
        component={BRollFilm}
        durationInFrames={brollFrames}
        fps={FPS}
        width={W}
        height={H}
      />
    </>
  );
};

const FrameFilm: React.FC = () => {
  const segments = [
    {
      node: (
        <TitleCard
          headline={(titleProps.headline as string) ?? storyboard.title}
          sub={titleProps.sub as string | undefined}
          kicker={storyboard.demo}
        />
      ),
      durationInFrames: OPENER_FRAMES,
    },
  ];

  if (canvas) {
    segments.push({
      node: <ArchitectureCard title="How it fits together" nodes={canvas.nodes} edges={canvas.edges} />,
      durationInFrames: CANVAS_FRAMES,
    });
  }

  segments.push({
    node: (
      <QuoteCard
        quote={(quoteProps.quote as string) ?? storyboard.takeaway}
        attribution={(quoteProps.attribution as string) ?? undefined}
      />
    ),
    durationInFrames: CLOSING_FRAMES,
  });

  return <Reel segments={segments} />;
};

const BRollFilm: React.FC = () => (
  <TerminalSimulator repo={broll?.repo ?? "—"} lines={brollLines()} />
);

// Referenced so bundlers keep public assets available to future scenes.
void staticFile;
