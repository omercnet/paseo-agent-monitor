import { describe, expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { getBuildVersion } from "../src/lib/build-version.server";
import { PACKAGE_VERSION } from "../src/lib/build-version.shared";

const execFileAsync = promisify(execFile);

describe("getBuildVersion", () => {
  test("resolves the plugin repo hash regardless of process cwd", async () => {
    // Regression: git/package.json lookups previously used the process cwd,
    // so a host running the plugin from an unrelated repo (or a non-repo dir)
    // reported that repo's hash instead of the plugin's.
    const originalCwd = process.cwd();
    const unrelatedDir = await mkdtemp(join(tmpdir(), "build-version-"));
    try {
      process.chdir(unrelatedDir);
      const fromElsewhere = await getBuildVersion();
      process.chdir(originalCwd);
      const fromPluginDir = await getBuildVersion();

      expect(fromElsewhere).toEqual(fromPluginDir);
      expect(fromElsewhere.version.startsWith(PACKAGE_VERSION)).toBe(true);

      const { stdout } = await execFileAsync("git", ["rev-parse", "--short", "HEAD"]);
      const pluginHash = stdout.trim();
      if (fromPluginDir.version !== PACKAGE_VERSION) {
        expect(fromPluginDir.version).toBe(`${PACKAGE_VERSION}+${pluginHash}`);
      }
    } finally {
      process.chdir(originalCwd);
    }
  });
});
