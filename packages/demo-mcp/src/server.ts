// The demo engine's ACCESS seam — an MCP server over the same `deriveDemo` pipeline
// the CLIs use, the demo analogue of `@objectcore/knowledge-mcp` over the KB store.
// Nothing here re-derives or re-gates: every tool is a thin projection of
// `deriveDemo` → `runDemoGate` → a sink, so an agent driving this server and a human
// running `bun run demo:check` cannot get different answers.
//
// `@objectcore/demo-mcp` is the only demo-side package allowed to depend on
// `@modelcontextprotocol/sdk` (plus the zod its tool-schema API needs) — mirroring
// knowledge-mcp's relationship to @objectcore/knowledge, and registry-db's to
// @libsql/client. `@objectcore/demo` stays zero-dep.
//
// Surface: two resources + three tools.
//   - demo://list                 — the committed demos and their gate verdicts.
//   - demo://storyboard/{name}    — the Remotion scene manifest for one demo.
//   - demo_check                  — run the deterministic gate, return issues + stats.
//   - demo_storyboard             — the storyboard as structured data (frame ranges),
//                                   for a Motion-Graphics agent to hand to a renderer.
//   - demo_render                 — invoke the operator's OWN configured render command.
//                                   SINK-GATED: registered only when `opts.renderCommand`
//                                   is provided (the registry `events`-route posture).
//
// On `demo_render` and licensing: this package never bundles or invokes Remotion. It
// emits a manifest and, if the operator has configured a render command, shells out to
// THEIR project. Remotion is source-available with paid tiers above a small-company
// threshold, and its license is the operator's to hold, not ours to assume — the same
// reason the design engine emits Tailwind config without depending on Tailwind.

import { spawn } from "node:child_process";
import { join } from "node:path";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  FileDemoSource,
  listDemoDirs,
  deriveDemo,
  runDemoGate,
  buildStoryboard,
  type DemoIssue,
} from "@objectcore/demo";

export interface DemoMcpOptions {
  /** Server name advertised in the MCP handshake. Default: "objectcore-demo". */
  name?: string;
  /** Server version advertised in the MCP handshake. Default: "0.0.1". */
  version?: string;
  /** Command + args used to render a storyboard, e.g. `["npx", "remotion", "render"]`.
   *  SINK-GATED: when absent, `demo_render` is NOT registered — the tool does not
   *  exist rather than existing and failing. */
  renderCommand?: string[];
  /** Max milliseconds a render may take before it is killed. Default 10 minutes. */
  renderTimeoutMs?: number;
}

const DEFAULT_RENDER_TIMEOUT_MS = 10 * 60 * 1000;

const fmt = (issues: DemoIssue[]): string =>
  issues.map((i) => `${i.level === "error" ? "✗" : "!"} ${i.path ? `${i.path}: ` : ""}${i.message}`)
    .join("\n") || "(none)";

/** Load + derive one demo. Throws with the demo name attached — an MCP tool error
 *  must say WHICH demo is broken. */
async function load(demosDir: string, name: string) {
  const spec = await new FileDemoSource(join(demosDir, name)).load();
  return deriveDemo(spec);
}

export function createDemoServer(demosDir: string, opts: DemoMcpOptions = {}): McpServer {
  const server = new McpServer({
    name: opts.name ?? "objectcore-demo",
    version: opts.version ?? "0.0.1",
  });

  // ── Resources ──────────────────────────────────────────────────────────────

  server.registerResource(
    "list",
    "demo://list",
    {
      title: "Committed demos",
      description: "Every demo under demos/, with its deterministic gate verdict.",
      mimeType: "application/json",
    },
    async (uri) => {
      const names = await listDemoDirs(demosDir);
      const rows = [];
      for (const name of names) {
        try {
          const result = runDemoGate(await load(demosDir, name));
          rows.push({ name, ok: result.ok, stats: result.stats });
        } catch (e) {
          // A demo that will not even load is reported, not swallowed — the caller
          // needs to know it exists and is broken.
          rows.push({ name, ok: false, error: (e as Error).message });
        }
      }
      return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(rows, null, 2) }] };
    },
  );

  server.registerResource(
    "storyboard",
    new ResourceTemplate("demo://storyboard/{name}", { list: undefined }),
    {
      title: "Demo storyboard",
      description: "The Remotion scene manifest (component, props, frame ranges) for one demo.",
      mimeType: "application/json",
    },
    async (uri, { name }) => {
      const board = buildStoryboard(await load(demosDir, String(name)));
      return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(board, null, 2) }] };
    },
  );

  // ── Tools ──────────────────────────────────────────────────────────────────

  server.registerTool(
    "demo_check",
    {
      title: "Check a demo",
      description:
        "Run the deterministic demo gate (structure, live safety, evidence, de-slop, " +
        "budget, video balance) and return its issues and stats.",
      inputSchema: { name: z.string().describe("Demo directory name under demos/.") },
    },
    async ({ name }) => {
      const result = runDemoGate(await load(demosDir, name));
      return {
        content: [{
          type: "text",
          text: `${result.ok ? "GREEN" : "RED"}\n\n${fmt(result.issues)}\n\n${JSON.stringify(result.stats, null, 2)}`,
        }],
        isError: !result.ok,
      };
    },
  );

  server.registerTool(
    "demo_storyboard",
    {
      title: "Get a demo's storyboard",
      description:
        "Return the Remotion scene manifest for a demo: component names, props, and " +
        "Sequence frame ranges. The live agentic beat is deliberately absent — it is " +
        "never pre-rendered.",
      inputSchema: {
        name: z.string().describe("Demo directory name under demos/."),
        fps: z.number().optional().describe("Frames per second (default 30)."),
      },
    },
    async ({ name, fps }) => {
      const output = await load(demosDir, name);
      const board = buildStoryboard(output, fps === undefined ? {} : { fps });
      return { content: [{ type: "text", text: JSON.stringify(board, null, 2) }] };
    },
  );

  // Sink-gated: no configured renderer ⇒ the tool is not registered at all.
  if (opts.renderCommand && opts.renderCommand.length > 0) {
    const [cmd, ...baseArgs] = opts.renderCommand;
    server.registerTool(
      "demo_render",
      {
        title: "Render a demo's storyboard",
        description:
          "Invoke the operator's configured render command for a demo. This server does " +
          "not bundle a renderer; it shells out to the project you configured.",
        inputSchema: { name: z.string().describe("Demo directory name under demos/.") },
      },
      async ({ name }) => {
        // Gate first: rendering a demo that fails the gate would produce a polished
        // artifact of something we already know should not be shown.
        const result = runDemoGate(await load(demosDir, name));
        if (!result.ok) {
          return {
            content: [{ type: "text", text: `refusing to render — the gate is RED:\n${fmt(result.issues)}` }],
            isError: true,
          };
        }
        const out = await run(cmd!, [...baseArgs, name], opts.renderTimeoutMs ?? DEFAULT_RENDER_TIMEOUT_MS);
        return { content: [{ type: "text", text: out.text }], isError: out.code !== 0 };
      },
    );
  }

  return server;
}

function run(cmd: string, args: string[], timeoutMs: number): Promise<{ code: number; text: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { timeout: timeoutMs });
    let text = "";
    child.stdout?.on("data", (d) => { text += String(d); });
    child.stderr?.on("data", (d) => { text += String(d); });
    child.on("error", (e) => resolve({ code: 1, text: `render command failed to start: ${e.message}` }));
    child.on("close", (code) => resolve({ code: code ?? 1, text: text || "(no output)" }));
  });
}
