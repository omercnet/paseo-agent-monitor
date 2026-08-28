import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { zipSync } from "fflate";
import packageJson from "../package.json";

const releaseFiles = [
  "LICENSE",
  "README.md",
  "index.ts",
  "docs/images/agent-monitor-roster.png",
  "docs/images/agent-monitor-settings.png",
  "src/components/agent-monitor.client.tsx",
  "src/components/settings-panel.client.tsx",
  "src/lib/build-version.shared.ts",
  "src/lib/monitor-settings.ts",
  "src/lib/monitor.shared.ts",
  "package.json",
  "paseo-plugin.d.ts",
  "paseo-plugin.json",
  "tsconfig.json",
] as const;

const output = Bun.argv[2] ?? `dist/agent-monitor-v${packageJson.version}.zip`;
const root = "agent-monitor";
const files: Record<string, Uint8Array> = {};

for (const path of releaseFiles) {
  files[join(root, path)] = await Bun.file(path).bytes();
}

await mkdir("dist", { recursive: true });
await rm(output, { force: true });
await Bun.write(output, zipSync(files, { level: 9 }));
console.log(output);
