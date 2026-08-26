import { Pressable, ScrollView, Text, View } from "react-native";
import {
  type AgentSort,
  DEFAULT_BUCKET_OPTIONS,
  DENSITY_OPTIONS,
  type DefaultBucket,
  type Density,
  GROUPING_OPTIONS,
  type GroupingMode,
  type MonitorSettings,
  SORT_OPTIONS,
} from "../lib/monitor-settings";

export type SettingsPanelStyles = {
  diffStat: object;
  diffAdd: object;
  diffDel: object;
  diffMuted: object;
  settingsOverlay: object;
  settingsBackdrop: object;
  settingsSheet: object;
  settingsHandle: object;
  settingsHeader: object;
  settingsTitle: object;
  settingsCloseButton: object;
  settingsCloseText: object;
  settingsBody: object;
  settingsSection: object;
  settingsSectionTitle: object;
  settingsGroup: object;
  settingsRow: object;
  settingsRowDivider: object;
  settingsField: object;
  settingsFieldLabel: object;
  choiceGroup: object;
  choiceOption: object;
  choiceOptionDivider: object;
  choiceOptionOn: object;
  choiceOptionText: object;
  choiceOptionTextOn: object;
  toggleRow: object;
  toggleLabelBlock: object;
  toggleLabel: object;
  toggleHint: object;
  toggleTrack: object;
  toggleTrackOn: object;
  toggleThumb: object;
  settingsFooter: object;
  settingsReset: object;
  dangerText: object;
};

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
    hint: "Additions in accent, deletions in danger",
  },
  { key: "showPinDots", label: "Pin dots", hint: "Accent dot on pinned workspace headers" },
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

export function SettingsPanel({
  open,
  settings,
  styles,
  onChange,
  onClose,
  onReset,
}: {
  open: boolean;
  settings: MonitorSettings;
  styles: SettingsPanelStyles;
  onChange: (patch: Partial<MonitorSettings>) => void;
  onClose: () => void;
  onReset: () => void;
}) {
  if (!open) return null;

  const segmented = <T extends string>(
    label: string,
    options: readonly { id: T; label: string }[],
    value: T,
    onSelect: (id: T) => void,
  ) => (
    <View style={styles.settingsField}>
      <Text style={styles.settingsFieldLabel}>{label}</Text>
      <View style={styles.choiceGroup}>
        {options.map((option, index) => {
          const on = option.id === value;
          return (
            <Pressable
              key={option.id}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => onSelect(option.id)}
              style={[
                styles.choiceOption,
                index > 0 ? styles.choiceOptionDivider : null,
                on ? styles.choiceOptionOn : null,
              ]}
            >
              <Text style={on ? styles.choiceOptionTextOn : styles.choiceOptionText}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const toggleGroup = (toggles: readonly { key: ToggleKey; label: string; hint: string }[]) => (
    <View style={styles.settingsGroup}>
      {toggles.map((item, index) => {
        const value = Boolean(settings[item.key]);
        return (
          <View key={item.key} style={index > 0 ? styles.settingsRowDivider : null}>
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: value }}
              accessibilityLabel={item.label}
              onPress={() => onChange({ [item.key]: !value })}
              style={[styles.settingsRow, styles.toggleRow]}
            >
              <View style={styles.toggleLabelBlock}>
                <Text style={styles.toggleLabel}>{item.label}</Text>
                <Text style={styles.toggleHint}>{item.hint}</Text>
              </View>
              <View style={value ? styles.toggleTrackOn : styles.toggleTrack}>
                <View style={styles.toggleThumb} />
              </View>
            </Pressable>
          </View>
        );
      })}
    </View>
  );

  return (
    <View style={styles.settingsOverlay} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close settings"
        onPress={onClose}
        style={styles.settingsBackdrop}
      />
      <View style={styles.settingsSheet} accessibilityViewIsModal>
        <View style={styles.settingsHandle} />
        <View style={styles.settingsHeader}>
          <Text style={styles.settingsTitle}>Monitor settings</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Done"
            onPress={onClose}
            style={styles.settingsCloseButton}
          >
            <Text style={styles.settingsCloseText}>×</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.settingsBody}>
          <View style={styles.settingsSection}>
            <Text style={styles.settingsSectionTitle}>Layout</Text>
            {segmented("Grouping", GROUPING_OPTIONS, settings.grouping, (grouping: GroupingMode) =>
              onChange({ grouping }),
            )}
            {segmented("Density", DENSITY_OPTIONS, settings.density, (density: Density) =>
              onChange({ density }),
            )}
            {toggleGroup(LAYOUT_TOGGLES)}
          </View>

          <View style={styles.settingsSection}>
            <Text style={styles.settingsSectionTitle}>Sorting</Text>
            {segmented("Agent order", SORT_OPTIONS, settings.agentSort, (agentSort: AgentSort) =>
              onChange({ agentSort }),
            )}
            {toggleGroup(SORTING_TOGGLES)}
          </View>

          <View style={styles.settingsSection}>
            <Text style={styles.settingsSectionTitle}>Display</Text>
            {toggleGroup(DISPLAY_TOGGLES)}
          </View>

          <View style={styles.settingsSection}>
            <Text style={styles.settingsSectionTitle}>Filters</Text>
            {segmented(
              "Default bucket",
              DEFAULT_BUCKET_OPTIONS,
              settings.defaultBucket,
              (defaultBucket: DefaultBucket) => onChange({ defaultBucket }),
            )}
            {toggleGroup(FILTER_TOGGLES)}
          </View>

          <View style={styles.settingsFooter}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reset settings to defaults"
              onPress={onReset}
              style={styles.settingsReset}
            >
              <Text style={styles.dangerText}>Reset to defaults</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

export function DiffStat({
  additions,
  deletions,
  colorDiffStats,
  styles,
}: {
  additions: number;
  deletions: number;
  colorDiffStats: boolean;
  styles: SettingsPanelStyles;
}) {
  if (additions === 0 && deletions === 0) return null;
  return (
    <View style={styles.diffStat}>
      <Text style={colorDiffStats ? styles.diffAdd : styles.diffMuted}>
        +{additions.toLocaleString()}
      </Text>
      <Text style={colorDiffStats ? styles.diffDel : styles.diffMuted}>
        −{deletions.toLocaleString()}
      </Text>
    </View>
  );
}
