// The scene components — the video analogue of the deck's slide layouts.
//
// DETERMINISM IS THE HARD RULE HERE. Remotion renders each frame independently and
// often out of order across threads, so a component that reads a clock or an RNG
// produces a different film every pass and cannot be reviewed or re-rendered. Every
// value below is a pure function of `useCurrentFrame()` — no `Math.random()`, no
// `Date.now()`, no `new Date()`. `@objectcore/demo`'s gate lints the storyboard for
// those tokens; `determinism.test.ts` lints these sources for the same ones, so the
// rule is enforced on both sides of the seam rather than merely intended.

import React from "react";
import {
  AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Sequence,
} from "remotion";
import { EASE, FONT, MONO, THEME } from "./theme";

/** Rise + fade, the film's single entrance gesture (the deck uses the same curve). */
function useRise(delay = 0, distance = 28) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200, mass: 0.7 } });
  return {
    opacity: interpolate(s, [0, 1], [0, 1]),
    transform: `translateY(${interpolate(s, [0, 1], [distance, 0])}px)`,
  };
}

const fill: React.CSSProperties = {
  backgroundColor: THEME.bg,
  color: THEME.fg,
  fontFamily: FONT,
  padding: "0 140px",
  justifyContent: "center",
};

/** The small-caps arc label, matching the deck's kicker. */
export const Kicker: React.FC<{ text: string; delay?: number }> = ({ text, delay = 0 }) => {
  const style = useRise(delay, 14);
  return (
    <div style={{
      ...style,
      display: "flex", alignItems: "center", gap: 16,
      fontSize: 20, letterSpacing: "0.2em", textTransform: "uppercase",
      color: THEME.muted, fontWeight: 560, marginBottom: 40,
    }}>
      {text}
      <span style={{ flex: "0 0 64px", height: 1, backgroundColor: THEME.border }} />
    </div>
  );
};

// ── The opener ───────────────────────────────────────────────────────────────

export const TitleCard: React.FC<{ headline: string; sub?: string; kicker?: string }> =
  ({ headline, sub, kicker }) => {
    const h = useRise(6);
    const s = useRise(16);
    const frame = useCurrentFrame();
    // A hairline that draws itself across the frame — the only ornament in the film.
    const rule = interpolate(frame, [0, 45], [0, 1], {
      extrapolateRight: "clamp", easing: (t) => t * (2 - t),
    });
    return (
      <AbsoluteFill style={fill}>
        {kicker ? <Kicker text={kicker} /> : null}
        <h1 style={{
          ...h, fontSize: 96, lineHeight: 1.02, fontWeight: 620,
          letterSpacing: "-0.035em", margin: 0, maxWidth: "16ch",
        }}>
          {headline}
        </h1>
        <div style={{
          height: 1, backgroundColor: THEME.accent, marginTop: 48,
          width: `${rule * 42}%`, opacity: 0.8,
        }} />
        {sub ? (
          <p style={{ ...s, fontSize: 30, lineHeight: 1.45, color: THEME.muted, maxWidth: "34ch", marginTop: 36 }}>
            {sub}
          </p>
        ) : null}
      </AbsoluteFill>
    );
  };

// ── The statement / closing card ─────────────────────────────────────────────

export const QuoteCard: React.FC<{ quote: string; attribution?: string }> =
  ({ quote, attribution }) => {
    const q = useRise(4);
    const a = useRise(20, 16);
    return (
      <AbsoluteFill style={fill}>
        <p style={{
          ...q, fontSize: 76, lineHeight: 1.1, fontWeight: 600,
          letterSpacing: "-0.03em", margin: 0, maxWidth: "18ch",
        }}>
          {quote}
        </p>
        {attribution ? (
          <p style={{ ...a, fontSize: 22, color: THEME.muted, marginTop: 40, letterSpacing: "0.04em" }}>
            {attribution}
          </p>
        ) : null}
      </AbsoluteFill>
    );
  };

// ── B-roll: the agent run, as the recorded fallback ──────────────────────────

export interface TerminalLine {
  text: string;
  kind?: "cmd" | "out" | "tool" | "fail" | "ok";
}

const LINE_COLOR: Record<string, string> = {
  cmd: THEME.fg,
  out: THEME.muted,
  tool: THEME.accent,
  fail: THEME.danger,
  ok: THEME.ok,
};

/** A terminal that types itself. Every character is a function of the frame, so the
 *  same segment renders identically every time. */
export const TerminalSimulator: React.FC<{
  repo: string;
  lines: TerminalLine[];
  framesPerLine?: number;
}> = ({ repo, lines, framesPerLine = 42 }) => {
  const frame = useCurrentFrame();
  const chrome = useRise(2, 18);

  return (
    <AbsoluteFill style={{ ...fill, padding: "0 120px" }}>
      <div style={{ ...chrome, borderRadius: 14, border: `1px solid ${THEME.border}`, backgroundColor: THEME.surface, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px", borderBottom: `1px solid ${THEME.border}` }}>
          <span style={{ width: 11, height: 11, borderRadius: "50%", backgroundColor: THEME.accent }} />
          <span style={{ width: 11, height: 11, borderRadius: "50%", backgroundColor: THEME.border }} />
          <span style={{ width: 11, height: 11, borderRadius: "50%", backgroundColor: THEME.border }} />
          <span style={{ marginLeft: 12, fontFamily: MONO, fontSize: 15, color: THEME.muted }}>{repo}</span>
        </div>

        <div style={{ padding: "22px 24px", fontFamily: MONO, fontSize: 21, lineHeight: 1.75, minHeight: 420 }}>
          {lines.map((line, i) => {
            const start = i * framesPerLine;
            if (frame < start) return null;
            // Type the line out character by character — deterministic in the frame.
            const chars = Math.floor(
              interpolate(frame - start, [0, framesPerLine * 0.7], [0, line.text.length], {
                extrapolateLeft: "clamp", extrapolateRight: "clamp",
              }),
            );
            const shown = line.text.slice(0, chars);
            const done = chars >= line.text.length;
            return (
              <div key={i} style={{ color: LINE_COLOR[line.kind ?? "out"], whiteSpace: "pre-wrap" }}>
                {line.kind === "cmd" ? <span style={{ color: THEME.accent }}>$ </span> : null}
                {shown}
                {!done ? <span style={{ opacity: (frame % 30) < 15 ? 1 : 0 }}>▋</span> : null}
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── The architecture canvas, assembling ──────────────────────────────────────

export interface CanvasNodeIn { id: string; label: string; x: number; y: number }
export interface CanvasEdgeIn { from: string; to: string }

export const ArchitectureCard: React.FC<{
  title?: string;
  nodes: CanvasNodeIn[];
  edges: CanvasEdgeIn[];
}> = ({ title, nodes, edges }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const W = 260;
  const H = 96;
  const PAD = 40;
  const width = Math.max(...nodes.map((n) => n.x), 0) + W + PAD * 2;
  const height = Math.max(...nodes.map((n) => n.y), 0) + H + PAD * 2;
  const at = (id: string) => nodes.find((n) => n.id === id);
  const t = useRise(2);

  return (
    <AbsoluteFill style={fill}>
      {title ? <Kicker text={title} /> : null}
      <svg viewBox={`0 0 ${width} ${height}`} style={{ ...t, width: "100%", maxHeight: 620 }}>
        {edges.map((e, i) => {
          const a = at(e.from);
          const b = at(e.to);
          if (!a || !b) return null; // never draw a relationship the gate rejected
          const x1 = a.x + PAD + W;
          const y1 = a.y + PAD + H / 2;
          const x2 = b.x + PAD;
          const y2 = b.y + PAD + H / 2;
          const mid = (x1 + x2) / 2;
          const draw = spring({
            frame: frame - (nodes.length * 8 + i * 9), fps, config: { damping: 200 },
          });
          return (
            <path
              key={`${e.from}-${e.to}`}
              d={`M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`}
              fill="none" stroke={THEME.accent} strokeWidth={2.4} opacity={0.8}
              strokeDasharray={600} strokeDashoffset={interpolate(draw, [0, 1], [600, 0])}
            />
          );
        })}
        {nodes.map((n, i) => {
          const s = spring({ frame: frame - i * 8, fps, config: { damping: 200, mass: 0.6 } });
          return (
            <g key={n.id} opacity={s} transform={`translate(0 ${interpolate(s, [0, 1], [14, 0])})`}>
              <rect x={n.x + PAD} y={n.y + PAD} width={W} height={H} rx={12}
                fill={THEME.surface} stroke={THEME.border} strokeWidth={1.5} />
              <text x={n.x + PAD + W / 2} y={n.y + PAD + H / 2 + 8}
                fill={THEME.fg} fontSize={26} textAnchor="middle" fontFamily={FONT}>
                {n.label}
              </text>
            </g>
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};

// ── Transition ───────────────────────────────────────────────────────────────

/** A wipe that carries the accent across the cut — used BETWEEN scenes so the film
 *  reads as one piece rather than a slideshow of cards. */
export const Wipe: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [0, durationInFrames], [0, 1], { extrapolateRight: "clamp" });
  const cover = p < 0.5
    ? interpolate(p, [0, 0.5], [0, 100])
    : interpolate(p, [0.5, 1], [100, 0]);
  const fromLeft = p < 0.5;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{
        position: "absolute", top: 0, bottom: 0,
        [fromLeft ? "left" : "right"]: 0,
        width: `${cover}%`,
        backgroundColor: THEME.accent,
        opacity: 0.92,
      }} />
    </AbsoluteFill>
  );
};

/** Compose a list of scenes back to back with wipes over the seams. */
export const Reel: React.FC<{
  segments: Array<{ node: React.ReactNode; durationInFrames: number }>;
  wipeFrames?: number;
}> = ({ segments, wipeFrames = 18 }) => {
  let cursor = 0;
  const out: React.ReactNode[] = [];
  segments.forEach((seg, i) => {
    const from = cursor;
    out.push(
      <Sequence key={`s${i}`} from={from} durationInFrames={seg.durationInFrames}>
        {seg.node}
      </Sequence>,
    );
    cursor += seg.durationInFrames;
    if (i < segments.length - 1) {
      out.push(
        <Sequence key={`w${i}`} from={cursor - Math.floor(wipeFrames / 2)} durationInFrames={wipeFrames}>
          <Wipe durationInFrames={wipeFrames} />
        </Sequence>,
      );
    }
  });
  return <AbsoluteFill style={{ backgroundColor: THEME.bg }}>{out}</AbsoluteFill>;
};
