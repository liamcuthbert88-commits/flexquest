import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AnimatedCashCounter } from "@/components/AnimatedCashCounter";
import { colors, radius, spacing } from "@/constants/theme";

type GymTopBarProps = {
  cash: number;
  gymLevel: number;
  memberCount: number;
  onBack: () => void;
  onSnapshot: () => void;
  onDevRiches: () => void;
};

/** Global floating header — visible on every tab of the tycoon screen,
 * showing only the essentials (cash, gym level, member count) rather than
 * the full detailed Gym Level card (renown bar, prestige button), which
 * moved to the Shop & Upgrades page since it's a bigger, more detailed
 * economic surface than a "clean, minimal" bar should carry. */
export function GymTopBar({ cash, gymLevel, memberCount, onBack, onSnapshot, onDevRiches }: GymTopBarProps) {
  return (
    <View style={styles.bar}>
      <Pressable onPress={onBack} hitSlop={12} style={styles.iconButton}>
        <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
      </Pressable>

      <View style={styles.statsRow}>
        <View style={styles.statChip}>
          <Ionicons name="cash-outline" size={13} color={colors.success} />
          <AnimatedCashCounter value={cash} style={styles.statValue} />
        </View>
        <View style={styles.statChip}>
          <Ionicons name="star" size={13} color={colors.accentRenown} />
          <Text style={styles.statValue}>Lv {gymLevel}</Text>
        </View>
        <View style={styles.statChip}>
          <Ionicons name="people-outline" size={13} color={colors.accentPrimary} />
          <Text style={styles.statValue}>{memberCount}</Text>
        </View>
      </View>

      <View style={styles.rightGroup}>
        {__DEV__ && (
          <Pressable onPress={onDevRiches} hitSlop={8} style={styles.devButton}>
            <Text style={styles.devButtonText}>DEV 🔧</Text>
          </Pressable>
        )}
        <Pressable onPress={onSnapshot} hitSlop={12} style={styles.iconButton}>
          <Ionicons name="camera-outline" size={22} color={colors.textPrimary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  statsRow: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.xs,
  },
  statChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  statValue: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  rightGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  devButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.accentRenown,
  },
  devButtonText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.accentRenown,
  },
});
