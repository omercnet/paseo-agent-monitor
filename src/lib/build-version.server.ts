import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { PACKAGE_VERSION } from "./build-version.shared";

const execFileAsync = promisify(execFile);
const pluginDir = join(import.meta.dirname, "..", "..");

async function git(...args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd: pluginDir });
    return stdout.trim();
  } catch {
    return "";
  }
}

export async function getBuildVersion(): Promise<{ version: string }> {
  const normalizedTag = (await git("describe", "--tags", "--exact-match", "HEAD")).replace(
    /^v/,
    "",
  );
  if (normalizedTag === PACKAGE_VERSION) return { version: PACKAGE_VERSION };

  const hash = await git("rev-parse", "--short", "HEAD");
  return { version: hash ? `${PACKAGE_VERSION}+${hash}` : PACKAGE_VERSION };
}
