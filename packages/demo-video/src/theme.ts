// The video's visual system, kept deliberately in step with the deck's stylesheet
// (`BASE_CSS` in @objectcore/demo) so the opener and the slides read as one piece.
// Values are literals rather than imports because a Remotion bundle is built by its
// own toolchain — the coupling is a review-time convention, noted here so it stays one.

export const THEME = {
  bg: "#0b0d12",
  surface: "#141821",
  fg: "#f2f4f8",
  muted: "#8d97ab",
  accent: "#8b9bff",
  border: "#232936",
  danger: "#ff6b6b",
  ok: "#5ad19b",
} as const;

export const FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, Helvetica, Arial, sans-serif';

export const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/** Ease used everywhere so motion feels like one hand made it. */
export const EASE = [0.22, 1, 0.36, 1] as const;
