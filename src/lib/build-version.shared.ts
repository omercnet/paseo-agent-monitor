import { defineRpc } from "@getpaseo/plugin/server";
import { z } from "zod";
import packageJson from "../../package.json";

export const PACKAGE_VERSION = packageJson.version;

export const buildVersion = defineRpc({
  name: "agent-monitor.build-version",
  input: z.object({}),
  output: z.object({ version: z.string() }),
});
