import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "@/constants/theme";

type Props = {
  title: string;
  description: string;
  rewardCash: number;
  rewardRenown: number;
  isCompletedToday: boolean;
  onClaim: () => void;
};

export function ChallengeCard({
  title,
  description,
  rewardCash,
  rewardRenown,
  isCompletedToday,
  onClaim,
}: Props) {
  return (
    <View style={[styles.card, isCompletedToday && styles.cardComplete]}>
      <View style={styles.info}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
        <Text style={styles.reward}>
          +${rewardCash} · +{rewardRenown} Renown
        </Text>
      </View>

      <Pressable
        style={[styles.tickButton, isCompletedToday && styles.tickButtonDone]}
        disabled={isCompletedToday}
        onPress={onClaim}
      >
        <Ionicons
          name={isCompletedToday ? "checkmark-circle" : "ellipse-outline"}
          size={18}
          color={isCompletedToday ? colors.success : colors.textSecondary}
        />
        <Text style={[styles.tickButtonText, isCompletedToday && styles.tickButtonTextDone]}>
          {isCompletedToday ? "Done today" : "Tick ✓"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  cardComplete: {
    borderColor: colors.success,
    backgroundColor: "rgba(52, 211, 153, 0.08)",
  },
  info: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  description: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.textSecondary,
  },
  reward: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.accentRenown,
    marginTop: 2,
  },
  tickButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceElevated,
  },
  tickButtonDone: {
    backgroundColor: "rgba(52, 211, 153, 0.16)",
  },
  tickButtonText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textSecondary,
  },
  tickButtonTextDone: {
    color: colors.success,
  },
});
