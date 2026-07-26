// Remotion build config. Kept minimal on purpose — the film's content comes from
// `src/storyboard.json`, which `bun run demo:render` copies in from the demo's build
// output, so this file never needs to know about a specific demo.
import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
