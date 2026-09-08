import { type PluginSurfaceProps, type SettingsState, useSettings } from "@getpaseo/plugin/client";
import {
  SettingsAction,
  SettingsCard,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import { useCallback, useMemo } from "react";
import { Text, View } from "react-native";
import {
  type AgentSort,
  DEFAULT_BUCKET_OPTIONS,
  DENSITY_OPTIONS,
  type DefaultBucket,
  type Density,
  GROUPING_OPTIONS,
  type GroupingMode,
  type MonitorSettings,
  monitorSettings,
  SORT_OPTIONS,
} from "../shared/monitor-settings";

type ReadySettings = Extract<SettingsState<typeof monitorSettings.schema>, { status: "ready" }>;
type ToggleKey =
  | "collapseMatchingWorkspace"
  | "floatPinned"
  | "showDiffStats"
  | "colorDiffStats"
  | "showPinDots"
  | "showModel"
  | "showAge"
  | "showSubagentCounts"
  | "showLastError"
  | "showPlacementInCompact"
  | "hideClosedUnlessFiltered";

const LAYOUT_TOGGLES: readonly { key: ToggleKey; label: string; hint: string }[] = [
  {
    key: "collapseMatchingWorkspace",
    label: "Collapse matching workspace headers",
    hint: "Hide a workspace title that repeats its project name",
  },
];

const SORTING_TOGGLES: readonly { key: ToggleKey; label: string; hint: string }[] = [
  {
    key: "floatPinned",
    label: "Float pinned to top",
    hint: "Pinned workspaces and projects stay above triage order",
  },
];

const DISPLAY_TOGGLES: readonly { key: ToggleKey; label: string; hint: string }[] = [
  { key: "showDiffStats", label: "Diff stats", hint: "+additions −deletions on group headers" },
  {
    key: "colorDiffStats",
    label: "Color diff stats",
    hint: "Additions in success, deletions in danger",
  },
  { key: "showPinDots", label: "Pin icons", hint: "Pin marker on pinned workspace headers" },
  { key: "showModel", label: "Model / provider", hint: "Show model under each agent title" },
  { key: "showAge", label: "Wait age", hint: "Age next to state on the right rail" },
  { key: "showSubagentCounts", label: "Subagent counts", hint: "N subagents on parent rows" },
  { key: "showLastError", label: "Last error", hint: "Show lastError under the row" },
  {
    key: "showPlacementInCompact",
    label: "Placement in compact",
    hint: "Project / workspace under titles in compact mode",
  },
];

const FILTER_TOGGLES: readonly { key: ToggleKey; label: string; hint: string }[] = [
  {
    key: "hideClosedUnlessFiltered",
    label: "Hide Closed unless filtered",
    hint: "Omit closed agents from All until the Closed chip is selected",
  },
];

const groupingOptions = GROUPING_OPTIONS.map(({ id, label }) => ({ value: id, label }));
const densityOptions = DENSITY_OPTIONS.map(({ id, label }) => ({ value: id, label }));
const sortOptions = SORT_OPTIONS.map(({ id, label }) => ({ value: id, label }));
const bucketOptions = DEFAULT_BUCKET_OPTIONS.map(({ id, label }) => ({ value: id, label }));

function Controls({
  settings,
  theme,
}: {
  settings: ReadySettings;
  theme: PluginSurfaceProps["theme"];
}) {
  const styles = useMemo(
    () => ({
      root: { gap: 16 },
      error: { color: theme.colors.statusDanger },
      muted: { color: theme.colors.foregroundMuted },
      value: { color: theme.colors.foreground },
    }),
    [theme],
  );
  const save = useCallback(
    (patch: Partial<MonitorSettings>) =>
      settings.save({ ...settings.values, ...patch }, settings.revision),
    [settings],
  );
  const renderToggles = useCallback(
    (items: readonly { key: ToggleKey; label: string; hint: string }[]) =>
      items.map(({ key, label, hint }) => (
        <SettingsSwitch
          key={key}
          label={label}
          hint={hint}
          value={settings.values[key]}
          disabled={settings.saving}
          onValueChange={(value) => void save({ [key]: value })}
        />
      )),
    [save, settings.saving, settings.values],
  );

  return (
    <View style={styles.root}>
      <SettingsSection title="Layout">
        <SettingsCard>
          <SettingsSelect
            label="Grouping"
            value={settings.values.grouping}
            options={groupingOptions}
            disabled={settings.saving}
            onValueChange={(grouping) => void save({ grouping: grouping as GroupingMode })}
          />
          <SettingsSelect
            label="Density"
            value={settings.values.density}
            options={densityOptions}
            disabled={settings.saving}
            onValueChange={(density) => void save({ density: density as Density })}
          />
          {renderToggles(LAYOUT_TOGGLES)}
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Sorting">
        <SettingsCard>
          <SettingsSelect
            label="Agent order"
            value={settings.values.agentSort}
            options={sortOptions}
            disabled={settings.saving}
            onValueChange={(agentSort) => void save({ agentSort: agentSort as AgentSort })}
          />
          {renderToggles(SORTING_TOGGLES)}
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Display">
        <SettingsCard>{renderToggles(DISPLAY_TOGGLES)}</SettingsCard>
      </SettingsSection>

      <SettingsSection title="Filters">
        <SettingsCard>
          <SettingsSelect
            label="Default bucket"
            value={settings.values.defaultBucket}
            options={bucketOptions}
            disabled={settings.saving}
            onValueChange={(defaultBucket) =>
              void save({ defaultBucket: defaultBucket as DefaultBucket })
            }
          />
          {renderToggles(FILTER_TOGGLES)}
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Status">
        <SettingsCard>
          <SettingsRow label="Persistence" hint="Shared by every client connected to this host">
            <Text style={styles.value}>{settings.saving ? "Saving…" : "Saved on host"}</Text>
          </SettingsRow>
          <SettingsAction
            label="Restore default settings"
            actionLabel="Reset"
            disabled={settings.saving}
            onPress={async () => {
              await settings.reset();
            }}
          />
          {settings.saveError ? (
            <SettingsAction
              label="Reload saved values"
              hint="Use after a conflict or connection error"
              error={settings.saveError}
              actionLabel="Reload"
              disabled={settings.saving}
              onPress={settings.reload}
            />
          ) : null}
        </SettingsCard>
        {settings.saveError ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {settings.saveError}
          </Text>
        ) : null}
      </SettingsSection>
    </View>
  );
}

export function MonitorSettingsScreen({ theme }: PluginSurfaceProps) {
  const settings = useSettings(monitorSettings);
  const styles = useMemo(
    () => ({
      text: { color: theme.colors.foreground },
      error: { color: theme.colors.statusDanger },
    }),
    [theme],
  );

  if (settings.status === "loading") return <Text style={styles.text}>Loading settings…</Text>;
  if (settings.status !== "ready") {
    return (
      <SettingsSection title="Monitor settings">
        <Text accessibilityRole="alert" style={styles.error}>
          {settings.error}
        </Text>
        <SettingsCard>
          <SettingsAction
            label="Read settings again"
            actionLabel="Reload"
            onPress={settings.reload}
          />
          {settings.status === "invalid" ? (
            <SettingsAction
              label="Replace invalid data with defaults"
              actionLabel="Reset"
              disabled={settings.saving}
              onPress={async () => {
                await settings.reset();
              }}
            />
          ) : null}
        </SettingsCard>
      </SettingsSection>
    );
  }

  return <Controls settings={settings} theme={theme} />;
}
