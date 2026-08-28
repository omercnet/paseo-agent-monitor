import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function git(...args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args);
    return stdout.trim();
  } catch {
    return "";
  }
}

export async function getBuildVersion(): Promise<{ version: string }> {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as { version: string };
  const normalizedTag = (await git("describe", "--tags", "--exact-match", "HEAD")).replace(
    /^v/,
    "",
  );
  if (normalizedTag === packageJson.version) return { version: packageJson.version };

  const hash = await git("rev-parse", "--short", "HEAD");
  return { version: hash ? `${packageJson.version}+${hash}` : packageJson.version };
}
