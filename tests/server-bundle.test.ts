import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Glob } from "bun";
import { build } from "esbuild";

// The daemon compiles plugin server code with esbuild `format: "cjs"` and runs the
// result through an indirect `eval`, so the bundle executes in global scope with no
// `import.meta`, no `__dirname`, and a cwd outside the plugin checkout. Anything that
// reaches for those at module scope throws while the plugin loads, and the daemon
// surfaces only "Plugin failed to load" with the bare Node error.
// Mirrors packages/server/src/server/plugins/{compiler,plugin-process}.ts in Paseo.
const pluginRoot = join(import.meta.dirname, "..");
const nodeRequire = createRequire(join(pluginRoot, "index.ts"));

const sdkStub = {
  defineRpc: (contract: unknown) => contract,
  defineAttachmentSource: (contract: unknown) => contract,
  Icon() {
    throw new Error("Icon is available only in plugin client code");
  },
};

function runtimeRequire(name: string): unknown {
  return name.startsWith("@getpaseo/plugin") ? sdkStub : nodeRequire(name);
}

async function compileServerBundle(entryPath: string) {
  const result = await build({
    stdin: {
      contents: await Bun.file(entryPath).text(),
      loader: "tsx",
      resolveDir: dirname(entryPath),
      sourcefile: entryPath,
    },
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node20",
    external: ["@getpaseo/plugin", "@getpaseo/plugin/server", "@getpaseo/client", "zod"],
    logLevel: "silent",
    treeShaking: true,
    write: false,
  });
  return { code: result.outputFiles[0]?.text ?? "", warnings: result.warnings };
}

const serverModules = [...new Glob("src/**/*.ts").scanSync(pluginRoot)]
  .filter((path) => !path.includes(".client."))
  .sort();

describe("plugin server bundle", () => {
  test("covers the server-reachable modules", () => {
    expect(serverModules.length).toBeGreaterThan(0);
  });

  for (const module of serverModules) {
    test(`${module} loads inside the daemon's cjs plugin sandbox`, async () => {
      const { code, warnings } = await compileServerBundle(join(pluginRoot, module));

      // esbuild names this failure precisely ("import.meta" is not available with the
      // "cjs" output format), and the daemon compiles with logLevel "silent".
      expect(warnings.map((warning) => warning.text)).toEqual([]);

      // The daemon evaluates plugin bundles the same way; reproducing it here is the
      // whole point of this test.
      // biome-ignore lint/security/noGlobalEval: mirrors the daemon's plugin loader
      const factory = globalThis.eval(
        `(function(require) {\nconst module = { exports: {} };\nconst exports = module.exports;\n${code}\nreturn module.exports;\n})`,
      ) as (require: (name: string) => unknown) => unknown;

      // The daemon forks the plugin child without a cwd, so it inherits the daemon's,
      // never the plugin checkout.
      const originalCwd = process.cwd();
      process.chdir(await mkdtemp(join(tmpdir(), "plugin-server-bundle-")));
      try {
        expect(() => factory(runtimeRequire)).not.toThrow();
      } finally {
        process.chdir(originalCwd);
      }
    });
  }
});
