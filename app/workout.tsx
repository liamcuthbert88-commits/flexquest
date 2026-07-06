import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ExerciseCard, type ExerciseBlock } from "@/components/ExerciseCard";
import { colors, radius, spacing, typography } from "@/constants/theme";
import { getTodayKey } from "@/constants/week";
import { isWorkoutDay, useRoutine, type DayRoutine } from "@/contexts/RoutineContext";
import { useUser } from "@/contexts/UserContext";

const WORKOUT_XP_REWARD = 50;
const WORKOUT_CASH_REWARD = 100;
const TARGET_BONUS_XP = 25;
const TARGET_BONUS_CASH = 50;

let idCounter = 0;
function createId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function createEmptyExercise(): ExerciseBlock {
  return {
    id: createId("exercise"),
    name: "",
    sets: [{ id: createId("set"), weight: "", reps: "" }],
  };
}

/** Pre-populate the tracker with today's planned exercises, each with empty
 * set rows ready for input (hinted with the template's default weight/reps). */
function seedExercisesFromRoutine(dayRoutine: DayRoutine): ExerciseBlock[] {
  return dayRoutine.exercises.map((template) => ({
    id: createId("exercise"),
    name: template.name,
    sets: Array.from({ length: template.targetSets }, () => ({
      id: createId("set"),
      weight: "",
      reps: "",
    })),
    placeholderWeight: String(template.defaultWeight),
    placeholderReps: String(template.defaultReps),
  }));
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getFocusLabel(dayRoutine: DayRoutine): string {
  if (!dayRoutine.name.trim()) return "Freestyle Workout";
  if (!isWorkoutDay(dayRoutine)) return "Rest Day";
  return dayRoutine.name;
}

export default function WorkoutScreen() {
  const router = useRouter();
  const { routine } = useRoutine();
  const { addXp, addCash, cashRewardMultiplier, globalMultiplier } = useUser();
  const todayRoutine = routine[getTodayKey()];
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [exercises, setExercises] = useState<ExerciseBlock[]>(() =>
    seedExercisesFromRoutine(todayRoutine)
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  function handleAddExercise() {
    setExercises((prev) => [...prev, createEmptyExercise()]);
  }

  function handleChangeName(exerciseId: string, name: string) {
    setExercises((prev) =>
      prev.map((exercise) => (exercise.id === exerciseId ? { ...exercise, name } : exercise))
    );
  }

  function handleAddSet(exerciseId: string) {
    setExercises((prev) =>
      prev.map((exercise) =>
        exercise.id === exerciseId
          ? { ...exercise, sets: [...exercise.sets, { id: createId("set"), weight: "", reps: "" }] }
          : exercise
      )
    );
  }

  function handleChangeSet(exerciseId: string, setId: string, field: "weight" | "reps", value: string) {
    setExercises((prev) =>
      prev.map((exercise) =>
        exercise.id === exerciseId
          ? {
              ...exercise,
              sets: exercise.sets.map((set) => (set.id === setId ? { ...set, [field]: value } : set)),
            }
          : exercise
      )
    );
  }

  function handleFinishWorkout() {
    const totalTargetSets = todayRoutine.exercises.reduce(
      (total, exercise) => total + exercise.targetSets,
      0
    );
    const totalCompletedSets = exercises.reduce(
      (total, exercise) => total + exercise.sets.filter((set) => set.reps.trim().length > 0).length,
      0
    );
    const bonusEarned = totalTargetSets > 0 && totalCompletedSets >= totalTargetSets;

    const xpAward = WORKOUT_XP_REWARD + (bonusEarned ? TARGET_BONUS_XP : 0);
    const cashAwardBeforeMultiplier = WORKOUT_CASH_REWARD + (bonusEarned ? TARGET_BONUS_CASH : 0);
    const finalCashAward = Math.round(
      cashAwardBeforeMultiplier * cashRewardMultiplier * globalMultiplier
    );

    const { leveledUp, newLevel } = addXp(xpAward);
    addCash(finalCashAward);

    const title = leveledUp ? "Level Up! 🎉" : "Workout Complete! 💪";
    const lines = [
      leveledUp ? `You reached Level ${newLevel}!` : `+${WORKOUT_XP_REWARD} XP`,
      `+$${finalCashAward} Cash`,
    ];
    if (bonusEarned) {
      lines.push(`🎯 Plan Completed! +${TARGET_BONUS_XP} XP bonus`);
    }
    if (cashRewardMultiplier > 1) {
      lines.push("⚡ Facility bonus applied");
    }
    if (globalMultiplier > 1) {
      lines.push("🏙️ Prestige/location bonus applied");
    }

    if (Platform.OS === "web") {
      // react-native-web's Alert.alert is a no-op, so the OK button's
      // onPress (where navigation lives) would never fire on web.
      router.back();
    } else {
      Alert.alert(title, lines.join("\n"), [{ text: "OK", onPress: () => router.back() }]);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backButton}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.timer}>{formatDuration(elapsedSeconds)}</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View>
          <Text style={typography.label}>TODAY'S FOCUS</Text>
          <Text style={styles.focusTitle}>{getFocusLabel(todayRoutine)}</Text>
        </View>

        <View style={styles.exerciseList}>
          {exercises.map((exercise) => (
            <ExerciseCard
              key={exercise.id}
              exercise={exercise}
              onChangeName={(name) => handleChangeName(exercise.id, name)}
              onAddSet={() => handleAddSet(exercise.id)}
              onChangeSet={(setId, field, value) => handleChangeSet(exercise.id, setId, field, value)}
            />
          ))}
        </View>

        <Pressable style={styles.addExerciseButton} onPress={handleAddExercise}>
          <Ionicons name="add-circle-outline" size={20} color={colors.accentPrimary} />
          <Text style={styles.addExerciseText}>Add Exercise</Text>
        </Pressable>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.finishButton} onPress={handleFinishWorkout}>
          <Text style={styles.finishButtonText}>Finish Workout</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  timer: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.xl,
  },
  focusTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  exerciseList: {
    gap: spacing.md,
  },
  addExerciseButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accentPrimary,
    backgroundColor: colors.accentPrimaryMuted,
  },
  addExerciseText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.accentPrimary,
  },
  footer: {
    padding: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  finishButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md + 2,
    borderRadius: radius.lg,
    backgroundColor: colors.accentAction,
    shadowColor: colors.accentAction,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  finishButtonText: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.textPrimary,
  },
});
