import { Text, View } from "react-native";

export type DiffStatStyles = {
  diffStat: object;
  diffAdd: object;
  diffDel: object;
  diffMuted: object;
};

export function DiffStat({
  additions,
  deletions,
  colorDiffStats,
  styles,
}: {
  additions: number;
  deletions: number;
  colorDiffStats: boolean;
  styles: DiffStatStyles;
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
