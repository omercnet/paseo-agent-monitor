export type GroupingMode = "compact" | "workspace" | "project";
export type AgentSort = "triage" | "updated" | "title";
export type Density = "comfortable" | "compact";
export type DefaultBucket = "all" | "attention" | "running" | "idle" | "closed" | "remember";

export type MonitorSettings = {
  /** Flat sessions, workspace groups, or project → workspace. */
  grouping: GroupingMode;
  /** Pinned workspaces/projects float above triage order. */
  floatPinned: boolean;
  /** How agents are ordered inside a group (or the whole list in compact). */
  agentSort: AgentSort;
  /** Hide a sole workspace header when its name matches the project. */
  collapseMatchingWorkspace: boolean;
  showDiffStats: boolean;
  /** Color +additions / −deletions with accent/danger instead of muted. */
  colorDiffStats: boolean;
  showPinDots: boolean;
  showModel: boolean;
  /** Include wait age next to the state label. */
  showAge: boolean;
  showSubagentCounts: boolean;
  showLastError: boolean;
  /** In compact mode, append project/workspace under the title. */
  showPlacementInCompact: boolean;
  density: Density;
  /** Initial chip when the surface opens. */
  defaultBucket: DefaultBucket;
  /** Keep closed agents out of All until the Closed chip is selected. */
  hideClosedUnlessFiltered: boolean;
};

export type PersistedMonitorState = {
  settings: MonitorSettings;
  /** Used when defaultBucket === "remember". */
  lastBucket: "attention" | "running" | "idle" | "closed" | null;
};

export const SETTINGS_STORAGE_KEY = "paseo.plugin.agent-monitor.state.v1";

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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function pickBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeSettings(input: unknown): MonitorSettings {
  const raw = isObject(input) ? input : {};
  return {
    grouping: pickEnum(
      raw.grouping,
      ["compact", "workspace", "project"],
      DEFAULT_SETTINGS.grouping,
    ),
    floatPinned: pickBool(raw.floatPinned, DEFAULT_SETTINGS.floatPinned),
    agentSort: pickEnum(raw.agentSort, ["triage", "updated", "title"], DEFAULT_SETTINGS.agentSort),
    collapseMatchingWorkspace: pickBool(
      raw.collapseMatchingWorkspace,
      DEFAULT_SETTINGS.collapseMatchingWorkspace,
    ),
    showDiffStats: pickBool(raw.showDiffStats, DEFAULT_SETTINGS.showDiffStats),
    colorDiffStats: pickBool(raw.colorDiffStats, DEFAULT_SETTINGS.colorDiffStats),
    showPinDots: pickBool(raw.showPinDots, DEFAULT_SETTINGS.showPinDots),
    showModel: pickBool(raw.showModel, DEFAULT_SETTINGS.showModel),
    showAge: pickBool(raw.showAge, DEFAULT_SETTINGS.showAge),
    showSubagentCounts: pickBool(raw.showSubagentCounts, DEFAULT_SETTINGS.showSubagentCounts),
    showLastError: pickBool(raw.showLastError, DEFAULT_SETTINGS.showLastError),
    showPlacementInCompact: pickBool(
      raw.showPlacementInCompact,
      DEFAULT_SETTINGS.showPlacementInCompact,
    ),
    density: pickEnum(raw.density, ["comfortable", "compact"], DEFAULT_SETTINGS.density),
    defaultBucket: pickEnum(
      raw.defaultBucket,
      ["all", "attention", "running", "idle", "closed", "remember"],
      DEFAULT_SETTINGS.defaultBucket,
    ),
    hideClosedUnlessFiltered: pickBool(
      raw.hideClosedUnlessFiltered,
      DEFAULT_SETTINGS.hideClosedUnlessFiltered,
    ),
  };
}

export function normalizePersistedState(input: unknown): PersistedMonitorState {
  const raw = isObject(input) ? input : {};
  const last = raw.lastBucket;
  return {
    settings: normalizeSettings(raw.settings ?? raw),
    lastBucket:
      last === null ||
      last === "attention" ||
      last === "running" ||
      last === "idle" ||
      last === "closed"
        ? last
        : null,
  };
}

function storage(): Storage | null {
  try {
    const candidate = (globalThis as { localStorage?: Storage }).localStorage;
    if (!candidate) return null;
    const probe = "__agent_monitor_probe__";
    candidate.setItem(probe, "1");
    candidate.removeItem(probe);
    return candidate;
  } catch {
    return null;
  }
}

export function loadPersistedState(): PersistedMonitorState {
  const store = storage();
  if (!store) return { settings: { ...DEFAULT_SETTINGS }, lastBucket: null };
  try {
    const raw = store.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { settings: { ...DEFAULT_SETTINGS }, lastBucket: null };
    return normalizePersistedState(JSON.parse(raw) as unknown);
  } catch {
    return { settings: { ...DEFAULT_SETTINGS }, lastBucket: null };
  }
}

export function savePersistedState(state: PersistedMonitorState): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        settings: normalizeSettings(state.settings),
        lastBucket: state.lastBucket,
      }),
    );
  } catch {
    // Persistence is best-effort on web/desktop; native may lack localStorage.
  }
}

export function initialBucket(
  settings: MonitorSettings,
  lastBucket: PersistedMonitorState["lastBucket"],
): "attention" | "running" | "idle" | "closed" | null {
  if (settings.defaultBucket === "all") return null;
  if (settings.defaultBucket === "remember") return lastBucket;
  return settings.defaultBucket;
}
