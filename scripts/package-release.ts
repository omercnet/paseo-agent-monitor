import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { zipSync } from "fflate";
import packageJson from "../package.json";

const releaseFiles = [
  "LICENSE",
  "README.md",
  "CHANGELOG.md",
  "index.client.tsx",
  "index.server.ts",
  "client/agent-monitor.tsx",
  "client/diff-stat.tsx",
  "client/monitor.ts",
  "client/settings-screen.tsx",
  "shared/monitor-settings.ts",
  "docs/images/agent-monitor-roster.png",
  "docs/images/agent-monitor-settings.png",
  "package.json",
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
