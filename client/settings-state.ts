import type { SettingsState } from "@getpaseo/plugin/client";
import type { monitorSettings } from "../shared/monitor-settings";

export type MonitorSettingsState = SettingsState<typeof monitorSettings.schema>;
export type ReadyMonitorSettings = Extract<MonitorSettingsState, { status: "ready" }>;

export function settingsAreReady(settings: MonitorSettingsState): settings is ReadyMonitorSettings {
  return settings.status === "ready";
}
