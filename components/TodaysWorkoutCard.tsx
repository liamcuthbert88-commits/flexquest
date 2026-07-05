import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "@/constants/theme";
import { getTodayKey } from "@/constants/week";
import { isWorkoutDay, useRoutine, type DayRoutine } from "@/contexts/RoutineContext";

type CardContent = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
};

function getCardContent(todayRoutine: DayRoutine): CardContent {
  if (!todayRoutine.name.trim()) {
    return {
      icon: "calendar-outline",
      title: "No Workout Set",
      subtitle: "Tap Edit Routine to plan your week",
    };
  }

  if (!isWorkoutDay(todayRoutine)) {
    return {
      icon: "moon-outline",
      title: "Rest Day",
      subtitle: "Time to Recover!",
    };
  }

  return {
    icon: "barbell-outline",
    title: `Today's Focus: ${todayRoutine.name}`,
    subtitle: "Let's make it count 💪",
  };
}

export function TodaysWorkoutCard() {
  const { routine } = useRoutine();
  const todayRoutine = routine[getTodayKey()];
  const { icon, title, subtitle } = getCardContent(todayRoutine);

  return (
    <LinearGradient
      colors={[colors.surfaceElevated, colors.surface]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      <View style={styles.header}>
        <Text style={styles.label}>TODAY'S WORKOUT</Text>
        <View style={styles.iconBadge}>
          <Ionicons name={icon} size={18} color={colors.accentPrimary} />
        </View>
      </View>

      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    color: colors.textTertiary,
  },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentPrimaryMuted,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
});
