// `bun run demo:build [<name>]` — derive every committed demo's output views into
// `dist/demos/<name>/` (gitignored build artifacts, like the design engine's views):
// the Slidev deck, the operator runbook, the evidence appendix + its JSON proof, and
// (when the demo declares visuals) the Remotion storyboard and architecture canvases.
//
// Build refuses to emit a demo the gate rejects. That is the point of putting the
// gate under the sinks: an unbacked claim cannot reach a slide by way of a build.

import { mkdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { existsSync } from "node:fs";
import {
  FileDemoSource,
  listDemoDirs,
  deriveDemo,
  runDemoGate,
  SlidevSink,
  RunbookSink,
  EvidenceSink,
  StoryboardSink,
  CanvasSink,
  type DemoSink,
} from "@objectcore/demo";

const root = join(import.meta.dir, "..");
const demosDir = join(root, "demos");
const outRoot = join(root, "dist", "demos");

const only = process.argv[2];

const names = existsSync(demosDir) ? await listDemoDirs(demosDir) : [];
const targets = only ? names.filter((n) => n === only) : names;

if (only && targets.length === 0) {
  console.error(`demo:build — no demo named "${only}" under demos/`);
  process.exit(1);
}
if (targets.length === 0) {
  console.log("demo:build — no demos under demos/*/ (nothing to build).");
  process.exit(0);
}

const sinks: DemoSink[] = [
  new SlidevSink(),
  new RunbookSink(),
  new EvidenceSink(),
  // The video track emits only when the demo declares visuals (CanvasSink returns
  // no files otherwise), so a demo with no video costs nothing here.
  new StoryboardSink(),
  new CanvasSink(),
];
let failed = 0;

for (const name of targets) {
  const dir = join(demosDir, name);
  const spec = await new FileDemoSource(dir).load();
  const output = deriveDemo(spec);

  const result = runDemoGate(output);
  if (!result.ok) {
    failed++;
    console.error(`✗ ${name} — gate failed, not building. Run \`bun run demo:check\`.`);
    for (const i of result.issues.filter((i) => i.level === "error")) {
      console.error(`    ${i.path ? `${i.path}: ` : ""}${i.message}`);
    }
    continue;
  }

  const outDir = join(outRoot, name);
  await mkdir(outDir, { recursive: true });

  const written: string[] = [];
  for (const sink of sinks) {
    for (const file of sink.emit(output)) {
      const path = join(outDir, file.path);
      await writeFile(path, file.content, "utf8");
      written.push(relative(root, path));
    }
  }

  console.log(`✓ ${name} → ${written.join(", ")}`);
}

if (failed) process.exit(1);
