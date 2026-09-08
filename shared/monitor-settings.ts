import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export type GroupingMode = "compact" | "workspace" | "project";
export type AgentSort = "triage" | "updated" | "title";
export type Density = "comfortable" | "compact";
export type DefaultBucket = "all" | "attention" | "running" | "idle" | "closed" | "remember";
export type RememberedBucket = "attention" | "running" | "idle" | "closed" | null;

export type MonitorSettings = {
  grouping: GroupingMode;
  floatPinned: boolean;
  agentSort: AgentSort;
  collapseMatchingWorkspace: boolean;
  showDiffStats: boolean;
  colorDiffStats: boolean;
  showPinDots: boolean;
  showModel: boolean;
  showAge: boolean;
  showSubagentCounts: boolean;
  showLastError: boolean;
  showPlacementInCompact: boolean;
  density: Density;
  defaultBucket: DefaultBucket;
  hideClosedUnlessFiltered: boolean;
};

export const DEFAULT_SETTINGS: MonitorSettings = {
  grouping: "project",
  floatPinned: true,
  agentSort: "triage",
  collapseMatchingWorkspace: true,
  showDiffStats: true,
  colorDiffStats: true,
  showPinDots: true,
  showModel: true,
  showAge: true,
  showSubagentCounts: true,
  showLastError: true,
  showPlacementInCompact: true,
  density: "comfortable",
  defaultBucket: "all",
  hideClosedUnlessFiltered: false,
};

export const monitorSettingsSchema = z.object({
  grouping: z.enum(["compact", "workspace", "project"]).default(DEFAULT_SETTINGS.grouping),
  floatPinned: z.boolean().default(DEFAULT_SETTINGS.floatPinned),
  agentSort: z.enum(["triage", "updated", "title"]).default(DEFAULT_SETTINGS.agentSort),
  collapseMatchingWorkspace: z.boolean().default(DEFAULT_SETTINGS.collapseMatchingWorkspace),
  showDiffStats: z.boolean().default(DEFAULT_SETTINGS.showDiffStats),
  colorDiffStats: z.boolean().default(DEFAULT_SETTINGS.colorDiffStats),
  showPinDots: z.boolean().default(DEFAULT_SETTINGS.showPinDots),
  showModel: z.boolean().default(DEFAULT_SETTINGS.showModel),
  showAge: z.boolean().default(DEFAULT_SETTINGS.showAge),
  showSubagentCounts: z.boolean().default(DEFAULT_SETTINGS.showSubagentCounts),
  showLastError: z.boolean().default(DEFAULT_SETTINGS.showLastError),
  showPlacementInCompact: z.boolean().default(DEFAULT_SETTINGS.showPlacementInCompact),
  density: z.enum(["comfortable", "compact"]).default(DEFAULT_SETTINGS.density),
  defaultBucket: z
    .enum(["all", "attention", "running", "idle", "closed", "remember"])
    .default(DEFAULT_SETTINGS.defaultBucket),
  hideClosedUnlessFiltered: z.boolean().default(DEFAULT_SETTINGS.hideClosedUnlessFiltered),
});

export const monitorSettings = defineSettings({
  id: "monitor",
  scope: "host",
  version: 1,
  schema: monitorSettingsSchema,
});

export const GROUPING_OPTIONS: readonly { id: GroupingMode; label: string; hint: string }[] = [
  { id: "compact", label: "Compact", hint: "Flat agent list, original triage feel" },
  { id: "workspace", label: "Workspace", hint: "Group by workspace" },
  { id: "project", label: "Project", hint: "Project → workspace hierarchy" },
];

export const SORT_OPTIONS: readonly { id: AgentSort; label: string }[] = [
  { id: "triage", label: "Triage" },
  { id: "updated", label: "Recently updated" },
  { id: "title", label: "Title A–Z" },
];

export const DENSITY_OPTIONS: readonly { id: Density; label: string }[] = [
  { id: "comfortable", label: "Comfortable" },
  { id: "compact", label: "Compact" },
];

export const DEFAULT_BUCKET_OPTIONS: readonly { id: DefaultBucket; label: string }[] = [
  { id: "all", label: "All" },
  { id: "attention", label: "Attention" },
  { id: "running", label: "Running" },
  { id: "idle", label: "Idle" },
  { id: "closed", label: "Closed" },
  { id: "remember", label: "Remember last" },
];

export function initialBucket(
  settings: MonitorSettings,
  lastBucket: RememberedBucket,
): RememberedBucket {
  if (settings.defaultBucket === "all") return null;
  if (settings.defaultBucket === "remember") return lastBucket;
  return settings.defaultBucket;
}
