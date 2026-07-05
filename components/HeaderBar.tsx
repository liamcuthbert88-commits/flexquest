import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "@/constants/theme";
import { useUser } from "@/contexts/UserContext";

export function HeaderBar() {
  const { level, xp, xpToNextLevel } = useUser();
  const fillPercent = Math.min(100, Math.max(0, (xp / xpToNextLevel) * 100));

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View>
          <Text style={styles.greeting}>Welcome back</Text>
          <Text style={styles.name}>Champion</Text>
        </View>

        <View style={styles.levelBadge}>
          <Text style={styles.levelBadgeLabel}>LVL</Text>
          <Text style={styles.levelBadgeValue}>{level}</Text>
        </View>
      </View>

      <View style={styles.xpRow}>
        <View style={styles.xpTrack}>
          <View style={[styles.xpFill, { width: `${fillPercent}%` }]} />
        </View>
        <Text style={styles.xpLabel}>
          {xp} / {xpToNextLevel} XP
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  greeting: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.textSecondary,
  },
  name: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.textPrimary,
    marginTop: 2,
  },
  levelBadge: {
    alignItems: "center",
    justifyContent: "center",
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.accentPrimaryMuted,
    borderWidth: 1.5,
    borderColor: colors.accentPrimary,
  },
  levelBadgeLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    color: colors.accentPrimary,
  },
  levelBadgeValue: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
    marginTop: -2,
  },
  xpRow: {
    gap: spacing.xs,
  },
  xpTrack: {
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  xpFill: {
    height: "100%",
    borderRadius: radius.pill,
    backgroundColor: colors.accentPrimary,
  },
  xpLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textTertiary,
    alignSelf: "flex-end",
  },
});
