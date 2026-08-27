import type { PaseoApi, PaseoWorkspace } from "@getpaseo/client";
import { type PluginSurfaceProps, usePaseo } from "@getpaseo/plugin";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Image, Pressable, Text, TextInput, View } from "react-native";
import {
  type AgentEntry,
  age,
  BUCKET_TITLES,
  BUCKETS,
  type Bucket,
  bucketOf,
  buildRoster,
  childCounts,
  matches,
  PARENT_AGENT_ID_LABEL,
  type ProjectGroup,
  placement,
  shouldCollapseWorkspace,
  stateLabel,
  title,
  type WorkspaceGroup,
  type WorkspaceSummary,
  waitingSince,
} from "../lib/monitor.shared";
import {
  DEFAULT_SETTINGS,
  initialBucket,
  loadPersistedState,
  type MonitorSettings,
  savePersistedState,
} from "../lib/monitor-settings";
import { DiffStat, SettingsPanel, type SettingsPanelStyles } from "./settings-panel.client";

const PAGE_LIMIT = 200;
const MAX_PAGES = 10;
const REFRESH_DEBOUNCE_MS = 750;
const BACKSTOP_REFETCH_MS = 30_000;
const CLOCK_INTERVAL_MS = 15_000;

const SETTINGS_GEAR_PATH =
  "M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915";

function settingsGearIconUri(color: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ` +
    `fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="${SETTINGS_GEAR_PATH}"/><circle cx="12" cy="12" r="3"/></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}
const ARCHIVE_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="COLOR" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-archive-icon lucide-archive">` +
  `<rect width="20" height="5" x="2" y="3" rx="1"/>` +
  `<path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/>` +
  `<path d="M10 12h4"/>` +
  `</svg>`;

function archiveSvgUri(color: string): string {
  const svg = ARCHIVE_SVG.replace("COLOR", color);
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

const PIN_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="COLOR" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
  `<path d="M12 17v5"/>` +
  `<path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>` +
  `</svg>`;

function pinSvgUri(color: string): string {
  return `data:image/svg+xml;base64,${btoa(PIN_SVG.replace("COLOR", color))}`;
}

const CHEVRON_DOWN_PATH = "m6 9 6 6 6-6";
const CHEVRON_RIGHT_PATH = "m9 18 6-6-6-6";

function chevronIconUri(path: string, color: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ` +
    `fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="${path}"/></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

type MonitorData = { entries: AgentEntry[]; workspaces: ReadonlyMap<string, WorkspaceSummary> };

async function loadAgents(paseo: PaseoApi): Promise<AgentEntry[]> {
  const entries: AgentEntry[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await paseo.agents.list({
      sort: [{ key: "updated_at", direction: "desc" }],
      page: { limit: PAGE_LIMIT, ...(cursor ? { cursor } : {}) },
    });
    entries.push(...result.entries);
    cursor = result.pageInfo.hasMore ? (result.pageInfo.nextCursor ?? undefined) : undefined;
    if (!cursor) break;
  }
  return entries;
}

async function loadWorkspaces(paseo: PaseoApi): Promise<PaseoWorkspace[]> {
  const workspaces: PaseoWorkspace[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await paseo.workspaces.list({
      page: { limit: PAGE_LIMIT, ...(cursor ? { cursor } : {}) },
    });
    workspaces.push(...result.entries);
    cursor = result.pageInfo.hasMore ? (result.pageInfo.nextCursor ?? undefined) : undefined;
    if (!cursor) break;
  }
  return workspaces;
}

async function loadDirectory(paseo: PaseoApi): Promise<MonitorData> {
  const [entries, workspaces] = await Promise.all([loadAgents(paseo), loadWorkspaces(paseo)]);
  const workspaceSummaries = new Map<string, WorkspaceSummary>();
  for (const workspace of workspaces) {
    workspaceSummaries.set(workspace.id, {
      id: workspace.id,
      name: workspace.name,
      projectId: workspace.projectId,
      projectName: workspace.projectDisplayName,
      pinned: workspace.pinnedAt != null,
      labels: workspace.labels ?? [],
      additions: workspace.diffStat?.additions ?? 0,
      deletions: workspace.diffStat?.deletions ?? 0,
    });
  }
  return { entries, workspaces: workspaceSummaries };
}

export function AgentMonitor({ theme, layout, host }: PluginSurfaceProps) {
  const paseo = usePaseo();
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["agent-monitor", "agents", host.id], [host.id]);
  const settingsIconUri = useMemo(
    () => settingsGearIconUri(theme.colors.foregroundMuted),
    [theme.colors.foregroundMuted],
  );
  const archiveIconUri = useMemo(
    () => archiveSvgUri(theme.colors.foregroundMuted),
    [theme.colors.foregroundMuted],
  );
  const archiveIconPressedUri = useMemo(
    () => archiveSvgUri(theme.colors.statusDanger),
    [theme.colors.statusDanger],
  );
  const pinIconUri = useMemo(() => pinSvgUri(theme.colors.accent), [theme.colors.accent]);
  const chevronDownIconUri = useMemo(
    () => chevronIconUri(CHEVRON_DOWN_PATH, theme.colors.foregroundMuted),
    [theme.colors.foregroundMuted],
  );
  const chevronRightIconUri = useMemo(
    () => chevronIconUri(CHEVRON_RIGHT_PATH, theme.colors.foregroundMuted),
    [theme.colors.foregroundMuted],
  );
  const { data, error, isPending, isFetching, refetch } = useQuery({
    queryKey,
    queryFn: () => loadDirectory(paseo),
    refetchInterval: BACKSTOP_REFETCH_MS,
  });

  const [boot] = useState(() => {
    const persisted = loadPersistedState();
    return {
      settings: persisted.settings,
      selected: initialBucket(persisted.settings, persisted.lastBucket),
    };
  });
  const [settings, setSettings] = useState<MonitorSettings>(boot.settings);
  const [selected, setSelected] = useState<Bucket | null>(boot.selected);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [needle, setNeedle] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [sweepArmed, setSweepArmed] = useState(false);
  const [collapsedProjects, setCollapsedProjects] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), CLOCK_INTERVAL_MS);
    return () => clearInterval(clock);
  }, []);

  useEffect(() => {
    savePersistedState({ settings, lastBucket: selected });
  }, [settings, selected]);

  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const invalidate = () => {
      if (debounce) return;
      debounce = setTimeout(() => {
        debounce = undefined;
        void queryClient.invalidateQueries({ queryKey });
      }, REFRESH_DEBOUNCE_MS);
    };
    const unsubscribeAgents = paseo.agents.subscribe(invalidate);
    const unsubscribeWorkspaces = paseo.workspaces.subscribe(invalidate);
    return () => {
      clearTimeout(debounce);
      unsubscribeAgents();
      unsubscribeWorkspaces();
    };
  }, [paseo, queryClient, queryKey]);

  const archive = useMutation({
    mutationFn: async (agentIds: readonly string[]) => {
      for (const agentId of agentIds) await paseo.agents.ref(agentId).archive();
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const patchSettings = useCallback((patch: Partial<MonitorSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS });
  }, []);

  const entries = data?.entries ?? [];
  const workspaces = data?.workspaces ?? new Map<string, WorkspaceSummary>();
  const counts = useMemo(() => {
    const totals: Record<Bucket, number> = { attention: 0, running: 0, idle: 0, closed: 0 };
    for (const entry of entries) totals[bucketOf(entry.agent)] += 1;
    return totals;
  }, [entries]);
  const childrenByParent = useMemo(() => childCounts(entries), [entries]);
  const closedIds = useMemo(
    () =>
      entries.filter((entry) => bucketOf(entry.agent) === "closed").map((entry) => entry.agent.id),
    [entries],
  );
  const roster = useMemo(() => {
    const search = needle.trim().toLowerCase();
    const filtered = entries.filter((entry) => {
      const bucket = bucketOf(entry.agent);
      if (selected !== null) {
        if (bucket !== selected) return false;
      } else if (settings.hideClosedUnlessFiltered && bucket === "closed") {
        return false;
      }
      return matches(entry, search);
    });
    return buildRoster(filtered, workspaces, settings);
  }, [entries, needle, selected, settings, workspaces]);

  const styles = useMemo(() => {
    const gutter = layout.compact ? 12 : 20;
    const rowPad = settings.density === "compact" ? 6 : 10;
    const muted = theme.colors.foregroundMuted;
    const borderMuted = `${muted}40`;
    const fill = { position: "absolute" as const, top: 0, right: 0, bottom: 0, left: 0 };
    const rowAlign = {
      flexDirection: "row" as const,
      alignItems: "center" as const,
    };
    const chipBase = {
      minHeight: 28,
      paddingHorizontal: 8,
      borderRadius: 6,
      borderWidth: 1,
      justifyContent: "center" as const,
    };
    return {
      screen: { flex: 1, backgroundColor: theme.colors.surface0 },
      header: { paddingHorizontal: gutter, paddingTop: gutter, gap: 10 },
      summaryLine: { ...rowAlign, gap: 8 },
      summary: { flex: 1, color: muted, fontSize: 13 },
      syncing: { color: muted, fontSize: 11, opacity: 0.8 },
      syncingHidden: { opacity: 0 },
      chips: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 8 },
      chip: { ...chipBase, borderColor: borderMuted },
      chipOn: {
        ...chipBase,
        borderColor: theme.colors.accent,
        backgroundColor: theme.colors.accent,
      },
      chipText: { color: muted, fontSize: 12 },
      chipTextOn: { color: theme.colors.accentForeground, fontSize: 12 },
      search: {
        color: theme.colors.foreground,
        borderRadius: 6,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderWidth: 1,
        borderColor: borderMuted,
        fontSize: 13,
      },
      actions: { ...rowAlign, gap: 8 },
      action: {
        paddingVertical: 7,
        paddingHorizontal: 12,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: borderMuted,
      },
      refreshAction: {
        paddingVertical: 3,
        paddingHorizontal: 8,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: borderMuted,
      },
      gearButton: {
        width: 26,
        height: 26,
        borderRadius: 13,
        borderWidth: 1,
        borderColor: borderMuted,
        alignItems: "center" as const,
        justifyContent: "center" as const,
      },
      gearGlyph: { width: 16, height: 16 },
      gearGlyphFallback: { fontSize: 14, lineHeight: 16, color: muted, marginTop: -1 },
      actionText: { color: theme.colors.foreground, fontSize: 12 },
      dangerText: { color: theme.colors.statusDanger, fontSize: 12 },
      row: {
        paddingHorizontal: gutter,
        paddingVertical: rowPad,
        flexDirection: "row" as const,
        gap: 10,
        alignItems: "flex-start" as const,
      },
      rowSweepTarget: { backgroundColor: `${theme.colors.statusDanger}1A` },
      rowMain: {
        flex: 1,
        flexDirection: "row" as const,
        gap: 10,
        alignItems: "flex-start" as const,
      },
      dot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
      rowBody: { flex: 1, gap: 3 },
      rowTitleLine: { ...rowAlign, gap: 6 },
      rowTitle: { flex: 1, color: theme.colors.foreground, fontSize: 14 },
      rowStatus: {
        color: muted,
        fontSize: 11,
        fontVariant: ["tabular-nums" as const],
        minWidth: 64,
        textAlign: "right" as const,
      },
      rowMeta: { color: muted, fontSize: 12 },
      childCount: { color: muted, fontSize: 11 },
      rowError: { color: theme.colors.statusDanger, fontSize: 12 },
      childRow: {
        paddingLeft: gutter,
        borderLeftWidth: 2,
        borderLeftColor: `${muted}26`,
      },
      projectHeader: {
        paddingHorizontal: gutter,
        paddingTop: 14,
        paddingBottom: 6,
        gap: 2,
        backgroundColor: theme.colors.surface0,
      },
      projectHeaderPressed: { backgroundColor: `${muted}0D` },
      projectDisclosure: { width: 14, height: 14, opacity: 0.72 },
      workspaceHeader: {
        paddingHorizontal: gutter,
        paddingTop: 8,
        paddingBottom: 4,
        gap: 2,
        backgroundColor: theme.colors.surface0,
      },
      headerTitleLine: { ...rowAlign, gap: 8 },
      pinIcon: { width: 12, height: 12 },
      pinDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.accent },
      projectTitle: {
        flex: 1,
        color: theme.colors.foreground,
        fontSize: 14,
        fontWeight: "700" as const,
      },
      workspaceTitle: {
        flex: 1,
        color: muted,
        fontSize: 12,
        fontWeight: "600" as const,
      },
      headerMeta: { color: muted, fontSize: 11 },
      diffStat: { flexDirection: "row" as const, gap: 4 },
      diffAdd: { color: theme.colors.accent, fontSize: 11 },
      diffDel: { color: theme.colors.statusDanger, fontSize: 11 },
      diffMuted: { color: muted, fontSize: 11 },
      rowRight: { ...rowAlign, height: 20, gap: 10 },
      iconButton: {
        width: 32,
        height: 32,
        borderRadius: 6,
        alignItems: "center" as const,
        justifyContent: "center" as const,
      },
      iconButtonPressed: { opacity: 0.55 },
      archiveSvg: { width: 16, height: 16 },
      archiveIcon: {
        width: 16,
        height: 12,
        marginTop: 2,
        borderWidth: 1.5,
        borderRadius: 2,
        alignItems: "center" as const,
        paddingTop: 3,
      },
      archiveLid: {
        position: "absolute" as const,
        top: -4,
        left: -2,
        width: 17,
        height: 4,
        borderWidth: 1.5,
        borderRadius: 1,
      },
      archiveSlot: { width: 5, height: 1.5, borderRadius: 1 },
      separator: { height: 1, backgroundColor: muted, opacity: 0.15 },
      listContent: { paddingTop: 6 },
      empty: { padding: gutter, color: muted },
      error: { paddingHorizontal: gutter, paddingTop: 10, color: theme.colors.statusDanger },
      settingsOverlay: { ...fill, zIndex: 20, justifyContent: "flex-end" as const },
      settingsBackdrop: { ...fill, backgroundColor: `${theme.colors.foreground}66` },
      settingsSheet: {
        alignSelf: "center" as const,
        width: "100%" as const,
        maxWidth: 560,
        maxHeight: "88%" as const,
        backgroundColor: theme.colors.surface0,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        paddingHorizontal: gutter,
        paddingTop: 8,
        paddingBottom: gutter,
        borderTopWidth: 1,
        borderColor: `${muted}33`,
      },
      settingsHandle: {
        alignSelf: "center" as const,
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: `${muted}40`,
        marginTop: 2,
        marginBottom: 6,
      },
      settingsHeader: {
        ...rowAlign,
        justifyContent: "space-between" as const,
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: `${muted}26`,
      },
      settingsTitle: { color: theme.colors.foreground, fontSize: 16, fontWeight: "700" as const },
      settingsCloseButton: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: `${muted}1A`,
        alignItems: "center" as const,
        justifyContent: "center" as const,
      },
      settingsCloseText: { color: muted, fontSize: 18, lineHeight: 22, marginTop: -2 },
      settingsBody: { paddingBottom: 4 },
      settingsSection: { marginTop: 16 },
      settingsSectionTitle: {
        color: muted,
        fontSize: 11,
        fontWeight: "700" as const,
        letterSpacing: 1,
        textTransform: "uppercase" as const,
        marginBottom: 8,
      },
      settingsGroup: {
        borderRadius: 8,
        borderWidth: 1,
        borderColor: `${muted}26`,
        overflow: "hidden" as const,
      },
      settingsRow: { paddingHorizontal: 12 },
      settingsRowDivider: {
        borderTopWidth: 1,
        borderTopColor: `${muted}1A`,
      },
      settingsField: { marginBottom: 12 },
      settingsFieldLabel: { color: muted, fontSize: 12, marginBottom: 6 },
      choiceGroup: {
        flexDirection: "row" as const,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: `${muted}33`,
        overflow: "hidden" as const,
      },
      choiceOption: {
        flex: 1,
        minHeight: 34,
        alignItems: "center" as const,
        justifyContent: "center" as const,
        paddingHorizontal: 8,
        paddingVertical: 7,
      },
      choiceOptionDivider: { borderLeftWidth: 1, borderLeftColor: `${muted}33` },
      choiceOptionOn: { backgroundColor: theme.colors.accent },
      choiceOptionText: { color: muted, fontSize: 12 },
      choiceOptionTextOn: {
        color: theme.colors.accentForeground,
        fontSize: 12,
        fontWeight: "600" as const,
      },
      toggleRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 12,
        paddingVertical: 9,
      },
      toggleLabelBlock: { flex: 1, gap: 1 },
      toggleLabel: { color: theme.colors.foreground, fontSize: 13 },
      toggleHint: { color: muted, fontSize: 11 },
      toggleTrack: {
        width: 36,
        height: 21,
        borderRadius: 11,
        padding: 2,
        flexDirection: "row" as const,
        justifyContent: "center" as const,
        backgroundColor: `${muted}33`,
      },
      toggleTrackOn: {
        width: 36,
        height: 21,
        borderRadius: 11,
        padding: 2,
        flexDirection: "row" as const,
        justifyContent: "flex-end" as const,
        backgroundColor: theme.colors.accent,
      },
      toggleThumb: {
        width: 17,
        height: 17,
        borderRadius: 9,
        backgroundColor: theme.colors.surface0,
      },
      settingsFooter: { marginTop: 18, alignItems: "center" as const },
      settingsReset: { paddingVertical: 6, paddingHorizontal: 10 },
    } satisfies Record<string, object> & SettingsPanelStyles;
  }, [layout.compact, settings.density, theme]);

  const renderRow = useCallback(
    ({ item }: { item: AgentEntry }) => {
      const { agent } = item;
      const bucket = bucketOf(agent);
      const children = childrenByParent.get(agent.id) ?? 0;
      const state = stateLabel(agent);
      const status =
        bucket === "running" || !settings.showAge
          ? state
          : `${state} · ${age(waitingSince(agent), now)}`;
      const dotColor =
        bucket === "attention"
          ? theme.colors.statusDanger
          : bucket === "running"
            ? theme.colors.accent
            : theme.colors.foregroundMuted;
      const meta = agent.model ?? agent.provider;
      const showPlacement = settings.grouping === "compact" && settings.showPlacementInCompact;
      const body = (
        <>
          <View style={[styles.dot, { backgroundColor: dotColor }]} />
          <View style={styles.rowBody}>
            <View style={styles.rowTitleLine}>
              <Text style={styles.rowTitle} numberOfLines={1} ellipsizeMode="tail">
                {title(item)}
              </Text>
              {settings.showSubagentCounts && children > 0 ? (
                <Text style={styles.childCount}>
                  {children} {children === 1 ? "subagent" : "subagents"}
                </Text>
              ) : null}
            </View>
            {showPlacement ? (
              <Text style={styles.rowMeta} numberOfLines={1} ellipsizeMode="tail">
                {placement(item)}
              </Text>
            ) : null}
            {settings.showModel && meta ? (
              <Text style={styles.rowMeta} numberOfLines={1} ellipsizeMode="tail">
                {meta}
              </Text>
            ) : null}
            {settings.showLastError && agent.lastError ? (
              <Text style={styles.rowError} numberOfLines={1}>
                {agent.lastError}
              </Text>
            ) : null}
          </View>
        </>
      );
      return (
        <View
          accessibilityState={{ selected: sweepArmed && bucket === "closed" }}
          style={[styles.row, sweepArmed && bucket === "closed" ? styles.rowSweepTarget : null]}
        >
          {layout.platform === "web" ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open agent ${title(item)}`}
              onPress={() =>
                globalThis.location.assign(
                  `/h/${encodeURIComponent(host.id)}/agent/${encodeURIComponent(agent.id)}`,
                )
              }
              style={styles.rowMain}
            >
              {body}
            </Pressable>
          ) : (
            <View style={styles.rowMain}>{body}</View>
          )}
          <View style={styles.rowRight}>
            <Text style={styles.rowStatus}>{status}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Archive agent ${title(item)}`}
              hitSlop={4}
              onPress={() => archive.mutate([agent.id])}
              style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
            >
              {({ pressed }) => {
                const glyph = pressed ? theme.colors.statusDanger : theme.colors.foregroundMuted;
                return layout.platform === "web" ? (
                  <Image
                    source={{ uri: pressed ? archiveIconPressedUri : archiveIconUri }}
                    style={styles.archiveSvg}
                    accessible={false}
                  />
                ) : (
                  <View style={[styles.archiveIcon, { borderColor: glyph }]}>
                    <View style={[styles.archiveLid, { borderColor: glyph }]} />
                    <View style={[styles.archiveSlot, { backgroundColor: glyph }]} />
                  </View>
                );
              }}
            </Pressable>
          </View>
        </View>
      );
    },
    [
      archive,
      archiveIconPressedUri,
      archiveIconUri,
      childrenByParent,
      host.id,
      layout.platform,
      now,
      settings,
      styles,
      sweepArmed,
      theme,
    ],
  );

  const renderWorkspaceHeader = useCallback(
    (workspace: WorkspaceSummary) => (
      <View style={styles.workspaceHeader}>
        <View style={styles.headerTitleLine}>
          {settings.showPinDots && workspace.pinned ? (
            layout.platform === "web" ? (
              <Image
                source={{ uri: pinIconUri }}
                style={styles.pinIcon}
                accessibilityLabel="Pinned workspace"
              />
            ) : (
              <View accessibilityLabel="Pinned workspace" style={styles.pinDot} />
            )
          ) : null}
          <Text style={styles.workspaceTitle} numberOfLines={1} ellipsizeMode="tail">
            {workspace.name}
          </Text>
          {settings.showDiffStats ? (
            <DiffStat
              additions={workspace.additions}
              deletions={workspace.deletions}
              colorDiffStats={settings.colorDiffStats}
              styles={styles}
            />
          ) : null}
        </View>
        {workspace.labels.length > 0 ? (
          <Text style={styles.headerMeta} numberOfLines={1} ellipsizeMode="tail">
            {workspace.labels.slice(0, 2).join(" · ")}
          </Text>
        ) : null}
      </View>
    ),
    [layout.platform, pinIconUri, settings, styles],
  );

  const renderWorkspaceGroup = useCallback(
    (group: WorkspaceGroup, project?: ProjectGroup) => {
      const collapse = project
        ? shouldCollapseWorkspace(project, group.workspace, settings.collapseMatchingWorkspace)
        : false;
      return (
        <View key={group.workspace.id}>
          {collapse ? null : renderWorkspaceHeader(group.workspace)}
          {group.entries.map((entry) => (
            <View
              key={entry.agent.id}
              style={PARENT_AGENT_ID_LABEL in entry.agent.labels ? styles.childRow : undefined}
            >
              {renderRow({ item: entry })}
            </View>
          ))}
        </View>
      );
    },
    [renderRow, renderWorkspaceHeader, settings.collapseMatchingWorkspace, styles.childRow],
  );

  const renderProject = useCallback(
    ({ item: project }: { item: ProjectGroup }) => {
      const collapsed = collapsedProjects.has(project.id);
      const collapsedWorkspace =
        project.workspaces.length === 1 &&
        shouldCollapseWorkspace(
          project,
          project.workspaces[0].workspace,
          settings.collapseMatchingWorkspace,
        )
          ? project.workspaces[0].workspace
          : null;
      return (
        <View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${collapsed ? "Expand" : "Collapse"} ${project.name} project`}
            accessibilityState={{ expanded: !collapsed }}
            onPress={() => {
              setCollapsedProjects((current) => {
                const next = new Set(current);
                if (next.has(project.id)) next.delete(project.id);
                else next.add(project.id);
                return next;
              });
            }}
            style={({ pressed }) => [styles.projectHeader, pressed && styles.projectHeaderPressed]}
          >
            <View style={styles.headerTitleLine}>
              <Image
                source={{ uri: collapsed ? chevronRightIconUri : chevronDownIconUri }}
                style={styles.projectDisclosure}
                accessible={false}
              />
              {settings.showPinDots && (collapsedWorkspace?.pinned || project.pinned) ? (
                layout.platform === "web" ? (
                  <Image
                    source={{ uri: pinIconUri }}
                    style={styles.pinIcon}
                    accessibilityLabel="Pinned project"
                  />
                ) : (
                  <View accessibilityLabel="Pinned project" style={styles.pinDot} />
                )
              ) : null}
              <Text style={styles.projectTitle} numberOfLines={1} ellipsizeMode="tail">
                {project.name}
              </Text>
              {settings.showDiffStats && collapsedWorkspace ? (
                <DiffStat
                  additions={collapsedWorkspace.additions}
                  deletions={collapsedWorkspace.deletions}
                  colorDiffStats={settings.colorDiffStats}
                  styles={styles}
                />
              ) : null}
            </View>
            {collapsedWorkspace && collapsedWorkspace.labels.length > 0 ? (
              <Text style={styles.headerMeta} numberOfLines={1} ellipsizeMode="tail">
                {collapsedWorkspace.labels.slice(0, 2).join(" · ")}
              </Text>
            ) : null}
          </Pressable>
          {collapsed
            ? null
            : project.workspaces.map((group) => renderWorkspaceGroup(group, project))}
        </View>
      );
    },
    [
      chevronDownIconUri,
      chevronRightIconUri,
      collapsedProjects,
      layout.platform,
      pinIconUri,
      renderWorkspaceGroup,
      settings,
      styles,
    ],
  );

  const separator = useCallback(() => <View style={styles.separator} />, [styles]);
  const empty = (
    <Text style={styles.empty}>
      {isPending ? "Loading agents…" : "No agents match this filter."}
    </Text>
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.summaryLine}>
          <Text style={styles.summary} numberOfLines={1} ellipsizeMode="tail">
            {entries.length} agents on {host.label}
          </Text>
          <Text style={[styles.syncing, isFetching ? null : styles.syncingHidden]}>syncing</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh agents"
            onPress={() => void refetch()}
            style={styles.refreshAction}
          >
            <Text style={styles.actionText}>Refresh</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open monitor settings"
            onPress={() => setSettingsOpen(true)}
            style={styles.gearButton}
          >
            {layout.platform === "web" ? (
              <Image
                source={{ uri: settingsIconUri }}
                style={styles.gearGlyph}
                accessible={false}
              />
            ) : (
              <Text style={styles.gearGlyphFallback} accessible={false}>
                ⚙
              </Text>
            )}
          </Pressable>
        </View>
        <View style={styles.chips}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Show all agents"
            onPress={() => setSelected(null)}
            style={selected === null ? styles.chipOn : styles.chip}
          >
            <Text style={selected === null ? styles.chipTextOn : styles.chipText}>
              All {entries.length}
            </Text>
          </Pressable>
          {BUCKETS.map((bucket) => (
            <Pressable
              key={bucket}
              accessibilityRole="button"
              accessibilityLabel={`Show ${BUCKET_TITLES[bucket]} agents`}
              onPress={() => setSelected(selected === bucket ? null : bucket)}
              style={selected === bucket ? styles.chipOn : styles.chip}
            >
              <Text style={selected === bucket ? styles.chipTextOn : styles.chipText}>
                {BUCKET_TITLES[bucket]} {counts[bucket]}
              </Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          style={styles.search}
          value={needle}
          onChangeText={setNeedle}
          placeholder="Filter by title, project, path, model"
          placeholderTextColor={theme.colors.foregroundMuted}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Filter agents"
        />
        {closedIds.length > 0 ? (
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Archive ${closedIds.length} closed agents`}
              onPress={() => {
                if (!sweepArmed) {
                  setSweepArmed(true);
                  return;
                }
                setSweepArmed(false);
                archive.mutate(closedIds);
              }}
              style={styles.action}
            >
              <Text style={styles.dangerText}>
                {sweepArmed
                  ? `Confirm: archive ${closedIds.length} closed`
                  : `Archive ${closedIds.length} closed`}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error.message}</Text> : null}
      {archive.error ? <Text style={styles.error}>{archive.error.message}</Text> : null}
      {roster.kind === "compact" ? (
        <FlatList
          data={roster.entries}
          keyExtractor={(entry) => entry.agent.id}
          contentContainerStyle={styles.listContent}
          renderItem={renderRow}
          ItemSeparatorComponent={separator}
          ListEmptyComponent={empty}
        />
      ) : roster.kind === "workspace" ? (
        <FlatList
          data={roster.groups}
          keyExtractor={(group) => group.workspace.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => renderWorkspaceGroup(item)}
          ItemSeparatorComponent={separator}
          ListEmptyComponent={empty}
        />
      ) : (
        <FlatList
          data={roster.projects}
          keyExtractor={(project) => project.id}
          contentContainerStyle={styles.listContent}
          renderItem={renderProject}
          ItemSeparatorComponent={separator}
          ListEmptyComponent={empty}
        />
      )}
      <SettingsPanel
        open={settingsOpen}
        settings={settings}
        styles={styles}
        onChange={patchSettings}
        onClose={() => setSettingsOpen(false)}
        onReset={resetSettings}
      />
    </View>
  );
}
