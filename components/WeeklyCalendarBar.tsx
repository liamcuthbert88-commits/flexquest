import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "@/constants/theme";
import { DAY_KEYS, DAY_LETTERS, getDayKeyForDate, getTodayKey } from "@/constants/week";
import { isWorkoutDay, useRoutine } from "@/contexts/RoutineContext";

function getWeekDates() {
  const today = new Date();
  const todayKey = getTodayKey();
  const todayIndex = DAY_KEYS.indexOf(todayKey);
  const monday = new Date(today);
  monday.setDate(today.getDate() - todayIndex);

  return DAY_KEYS.map((dayKey, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    return {
      dayKey,
      letter: DAY_LETTERS[dayKey],
      date: date.getDate(),
      isToday: getDayKeyForDate(date) === todayKey && i === todayIndex,
    };
  });
}

export function WeeklyCalendarBar() {
  const { routine } = useRoutine();
  const week = getWeekDates();

  return (
    <View style={styles.row}>
      {week.map((day) => {
        const hasWorkout = isWorkoutDay(routine[day.dayKey]);
        return (
          <View key={day.dayKey} style={styles.dayColumn}>
            <Text style={[styles.dayLetter, day.isToday && styles.dayLetterActive]}>
              {day.letter}
            </Text>
            <View
              style={[
                styles.dateCircle,
                hasWorkout && styles.dateCircleActive,
                day.isToday && styles.dateCircleToday,
              ]}
            >
              <Text
                style={[
                  styles.dateNumber,
                  (hasWorkout || day.isToday) && styles.dateNumberActive,
                ]}
              >
                {day.date}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  dayColumn: {
    alignItems: "center",
    gap: spacing.sm,
  },
  dayLetter: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textTertiary,
  },
  dayLetterActive: {
    color: colors.accentPrimary,
  },
  dateCircle: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateCircleActive: {
    backgroundColor: colors.accentPrimary,
    borderColor: colors.accentPrimary,
  },
  dateCircleToday: {
    borderColor: colors.accentPrimary,
    borderWidth: 2,
  },
  dateNumber: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  dateNumberActive: {
    color: colors.textPrimary,
  },
});
