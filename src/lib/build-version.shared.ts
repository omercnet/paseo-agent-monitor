import packageJson from "../../package.json";

// Plugin server bundles are compiled to CJS and evaluated with an indirect `eval`,
// so they have no `import.meta`, no `__dirname`, and no cwd inside the plugin
// checkout. The version has to be a compile-time constant; it cannot be read back
// from the plugin's own files at runtime.
export const PACKAGE_VERSION = packageJson.version;
