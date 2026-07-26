// Where is a usable Chrome on this machine? (not runnable — underscore prefix)
//
// Two different tools needed this answer and both got it wrong on their own, in the
// same way: a bundled-browser download that either reports success and cannot be found
// again (Remotion) or resolves to a build number the installed one does not match
// (Playwright pinning `chromium_headless_shell-1234` against an existing `-1228`).
// Both failures look like "no browser" while a perfectly good browser sits on disk.
//
// So the lookup lives in one place, in resolution order:
//   1. an explicit override, for CI or an unusual install;
//   2. Playwright's own cache — newest build first, so an upgrade does not strand us;
//   3. the ordinary system Chrome locations.
// Returning undefined is a legitimate answer: the caller falls back to its tool's own
// bundled browser, which is the happy path on most machines.

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SYSTEM_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

/** Relative paths to the executable inside a Playwright browser directory. */
const PLAYWRIGHT_BINARIES = [
  join("chrome-headless-shell-win64", "chrome-headless-shell.exe"),
  join("chrome-win64", "chrome.exe"),
  join("chrome-linux", "chrome"),
  join("chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"),
];

/** Absolute path to a Chrome executable, or undefined if none is found. */
export function findBrowser(): string | undefined {
  const explicit = process.env.OBJECTCORE_BROWSER_EXECUTABLE ?? process.env.REMOTION_BROWSER_EXECUTABLE;
  if (explicit && existsSync(explicit)) return explicit;

  for (const cacheDir of playwrightCaches()) {
    let entries: string[];
    try {
      entries = readdirSync(cacheDir);
    } catch {
      continue;
    }
    // Newest build first: "chromium-1234" must beat "chromium-1228".
    const dirs = entries
      .filter((d) => d.startsWith("chromium_headless_shell-") || d.startsWith("chromium-"))
      .sort((a, b) => buildNumber(b) - buildNumber(a));

    for (const d of dirs) {
      for (const rel of PLAYWRIGHT_BINARIES) {
        const candidate = join(cacheDir, d, rel);
        if (existsSync(candidate)) return candidate;
      }
    }
  }

  return SYSTEM_CANDIDATES.find((c) => existsSync(c));
}

function playwrightCaches(): string[] {
  const dirs: string[] = [];
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) dirs.push(process.env.PLAYWRIGHT_BROWSERS_PATH);
  if (process.env.LOCALAPPDATA) dirs.push(join(process.env.LOCALAPPDATA, "ms-playwright"));
  if (process.env.HOME) {
    dirs.push(join(process.env.HOME, ".cache", "ms-playwright"));
    dirs.push(join(process.env.HOME, "Library", "Caches", "ms-playwright"));
  }
  return dirs;
}

/** Trailing build number of a Playwright browser dir; 0 when it has none. */
function buildNumber(dir: string): number {
  const m = dir.match(/-(\d+)$/);
  return m ? Number(m[1]) : 0;
}
