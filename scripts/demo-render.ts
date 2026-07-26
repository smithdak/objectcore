// `bun run demo:render <demo> [--composition Opener|Frame|BRoll|all] [--studio]`
//
// Renders a demo's video track. The pipeline is deliberately one-way: `demo:build`
// derives `storyboard.json` from the same `deriveDemo` output as the deck and the
// runbook, this copies that manifest into the Remotion project, and Remotion renders
// it. Nothing about the film is authored twice — change the demo spec and the film
// changes with it.
//
// `--studio` opens Remotion's preview instead of rendering, which is the fast loop
// while iterating on a scene.
//
// Licensing, stated plainly because it is a real constraint and not ours to assume:
// Remotion is source-available. It is FREE for individuals and companies of up to
// three people, including commercially. Automated/served rendering at volume needs a
// paid tier. This script runs the operator's own local Remotion; the repo ships no
// licence key and renders nothing on anyone's behalf. See the KB decision entry.

import { spawn } from "node:child_process";
import { copyFile, mkdir } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(import.meta.dir, "..");
const projectDir = join(root, "packages", "demo-video");

const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith("--")) ?? "objectcore";
const flag = (n: string): string | undefined => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const studio = args.includes("--studio");
const requested = flag("composition") ?? "all";

const COMPOSITIONS = ["Opener", "Frame", "BRoll"] as const;
type CompositionId = (typeof COMPOSITIONS)[number];

const storyboard = join(root, "dist", "demos", name, "storyboard.json");
if (!existsSync(storyboard)) {
  console.error(`✗ no storyboard for "${name}" — run \`bun run demo:build ${name}\` first.`);
  process.exit(1);
}

// The manifest is the ONLY input the project takes; copying it in keeps the Remotion
// bundle free of any path back into the workspace.
await copyFile(storyboard, join(projectDir, "src", "storyboard.json"));

if (!existsSync(join(projectDir, "node_modules"))) {
  console.error(
    `✗ Remotion is not installed. Run:\n    cd ${relative(root, projectDir)} && bun install\n` +
    `  (Remotion is free for individuals and companies of up to three people.)`,
  );
  process.exit(1);
}

/** Remotion downloads its own Chrome Headless Shell on first render. On some Windows
 *  setups that download reports success and then cannot be located again ("No browser
 *  found for rendering frames"), and `remotion browser ensure` fails the same way. So:
 *  look for a Chrome already on the machine and hand Remotion the path.
 *
 *  Order: an explicit override, then Playwright's bundled Chromium (present in any repo
 *  that runs browser tests), then the usual system Chrome locations. Returning
 *  undefined is fine — Remotion falls back to its own download, which is the happy path
 *  on most machines. */
function findBrowser(): string | undefined {
  const explicit = process.env.REMOTION_BROWSER_EXECUTABLE;
  if (explicit && existsSync(explicit)) return explicit;

  const local = process.env.LOCALAPPDATA;
  if (local) {
    const pw = join(local, "ms-playwright");
    try {
      // Newest install wins, so a Playwright upgrade does not strand this.
      const dirs = readdirSync(pw)
        .filter((d) => d.startsWith("chromium_headless_shell-") || d.startsWith("chromium-"))
        .sort()
        .reverse();
      for (const d of dirs) {
        for (const rel of [
          join("chrome-headless-shell-win64", "chrome-headless-shell.exe"),
          join("chrome-win64", "chrome.exe"),
        ]) {
          const candidate = join(pw, d, rel);
          if (existsSync(candidate)) return candidate;
        }
      }
    } catch {
      // no Playwright install — fall through
    }
  }

  for (const candidate of [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

const browser = findBrowser();
const browserArgs = browser ? ["--browser-executable", `"${browser}"`] : [];
if (browser) console.log(`  using browser: ${browser}`);

function run(cmd: string, argv: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, argv, { cwd: projectDir, stdio: "inherit", shell: true });
    child.on("error", () => resolve(1));
    child.on("close", (code) => resolve(code ?? 1));
  });
}

if (studio) {
  console.log(`▸ opening Remotion studio for "${name}" …`);
  process.exit(await run("bunx", ["remotion", "studio", "src/index.ts", ...browserArgs]));
}

const targets: CompositionId[] =
  requested === "all"
    ? [...COMPOSITIONS]
    : COMPOSITIONS.includes(requested as CompositionId)
      ? [requested as CompositionId]
      : [];

if (targets.length === 0) {
  console.error(`✗ unknown composition "${requested}" (expected: ${COMPOSITIONS.join(", ")}, or all)`);
  process.exit(1);
}

const outDir = join(root, "dist", "demos", name, "video");
await mkdir(outDir, { recursive: true });

let failed = 0;
for (const id of targets) {
  const out = join(outDir, `${id.toLowerCase()}.mp4`);
  console.log(`\n▸ rendering ${id} → ${relative(root, out)}`);
  const code = await run("bunx", ["remotion", "render", "src/index.ts", id, `"${out}"`, ...browserArgs]);
  if (code !== 0) {
    failed++;
    console.error(`✗ ${id} failed (exit ${code})`);
  }
}

console.log(
  failed
    ? `\n✗ demo:render — ${failed}/${targets.length} composition(s) failed`
    : `\n✓ demo:render — ${targets.length} composition(s) → ${relative(root, outDir)}`,
);
if (failed) process.exit(1);
