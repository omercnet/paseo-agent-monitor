import type { PluginContext } from "@getpaseo/plugin";
import { AgentMonitor } from "./src/components/agent-monitor.client";

export default function contribute(plugin: PluginContext) {
  plugin.addSurface("monitor", AgentMonitor);
  plugin.addSidebarItem({
    id: "monitor",
    title: "Agent monitor",
    icon: "Radar",
    surface: "monitor",
  });
  plugin.addCommandCenterItem({
    id: "open-monitor",
    title: "Open agent monitor",
    icon: "Radar",
    keywords: ["agents", "sessions", "monitor", "triage"],
    context: "global",
    onSelect({ openSurface }) {
      openSurface("monitor");
    },
  });
  return () => {};
}
