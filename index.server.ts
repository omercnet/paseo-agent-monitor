import type { PluginServerContext } from "@getpaseo/plugin/server";
import { monitorSettings } from "./shared/monitor-settings";

export default function contribute(server: PluginServerContext) {
  server.registerSettings(monitorSettings);
  return () => {};
}
