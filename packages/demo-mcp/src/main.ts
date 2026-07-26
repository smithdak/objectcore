// stdio entry for the demo MCP server (`bun run demo:mcp`, and the repo-root .mcp.json
// dogfood wiring). Resolves the demos dir, constructs the server, and connects a
// StdioServerTransport. A project with no demos/ dir serves an empty list rather than
// crashing (listDemoDirs self-gates), matching the KB server's posture.
//
// Demos dir:      `--dir <path>` > OBJECTCORE_DEMOS_DIR > <cwd>/demos.
// Render command: `--render <cmd...>` > OBJECTCORE_DEMO_RENDER (space-separated) >
//                 absent — and when absent, `demo_render` is NOT registered
//                 (sink-gated). We never assume a renderer, or its license.

import { join } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createDemoServer, type DemoMcpOptions } from "./server";

const argv = process.argv.slice(2);

function flag(name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 ? argv[i + 1] : undefined;
}

const demosDir = flag("dir") ?? process.env.OBJECTCORE_DEMOS_DIR ?? join(process.cwd(), "demos");

const renderRaw = flag("render") ?? process.env.OBJECTCORE_DEMO_RENDER;
const renderCommand = renderRaw ? renderRaw.split(/\s+/).filter(Boolean) : undefined;

const opts: DemoMcpOptions = {};
if (renderCommand && renderCommand.length > 0) opts.renderCommand = renderCommand;

const server = createDemoServer(demosDir, opts);
const transport = new StdioServerTransport();
await server.connect(transport);
