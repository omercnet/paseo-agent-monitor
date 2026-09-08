import type { PluginClientContext, PluginSurfaceProps } from "@getpaseo/plugin/client";
import { AgentMonitor } from "./client/agent-monitor";
import { MonitorSettingsScreen } from "./client/settings-screen";

export default function contribute(client: PluginClientContext) {
  function MonitorSurface(props: PluginSurfaceProps) {
    return <AgentMonitor {...props} onOpenSettings={() => client.openSettings("monitor")} />;
  }

  const removeSettings = client.addSettingsScreen({
    id: "monitor",
    title: "Monitor settings",
    icon: "Settings",
    Component: MonitorSettingsScreen,
  });
  const removeSurface = client.addSurface("monitor", MonitorSurface);
  const removeSidebarItem = client.addSidebarItem({
    id: "monitor",
    title: "Agent monitor",
    icon: "Radar",
    surface: "monitor",
  });
  const removeOpenMonitor = client.addCommandCenterItem({
    id: "open-monitor",
    title: "Open agent monitor",
    icon: "Radar",
    keywords: ["agents", "sessions", "monitor", "triage"],
    context: "global",
    onSelect({ openSurface }) {
      openSurface("monitor");
    },
  });
  const removeConfigureMonitor = client.addCommandCenterItem({
    id: "configure-monitor",
    title: "Configure agent monitor",
    icon: "Settings",
    keywords: ["settings", "preferences", "monitor"],
    context: "global",
    onSelect({ openSettings }) {
      openSettings("monitor");
    },
  });

  return () => {
    removeConfigureMonitor();
    removeOpenMonitor();
    removeSidebarItem();
    removeSurface();
    removeSettings();
  };
}
