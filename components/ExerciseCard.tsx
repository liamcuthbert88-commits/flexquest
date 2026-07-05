import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, radius, spacing } from "@/constants/theme";

export type SetEntry = {
  id: string;
  weight: string;
  reps: string;
};

export type ExerciseBlock = {
  id: string;
  name: string;
  sets: SetEntry[];
  /** Hint text shown on empty weight/reps inputs, e.g. from a routine template. */
  placeholderWeight?: string;
  placeholderReps?: string;
};

type Props = {
  exercise: ExerciseBlock;
  onChangeName: (name: string) => void;
  onAddSet: () => void;
  onChangeSet: (setId: string, field: "weight" | "reps", value: string) => void;
};

export function ExerciseCard({ exercise, onChangeName, onAddSet, onChangeSet }: Props) {
  return (
    <View style={styles.card}>
      <TextInput
        value={exercise.name}
        onChangeText={onChangeName}
        placeholder="Exercise name"
        placeholderTextColor={colors.textTertiary}
        style={styles.nameInput}
      />

      <View style={styles.columnHeaderRow}>
        <Text style={[styles.columnHeader, styles.setColumn]}>SET</Text>
        <Text style={[styles.columnHeader, styles.valueColumn]}>WEIGHT</Text>
        <Text style={[styles.columnHeader, styles.valueColumn]}>REPS</Text>
      </View>

      {exercise.sets.map((set, index) => (
        <View key={set.id} style={styles.setRow}>
          <View style={[styles.setColumn, styles.setBadge]}>
            <Text style={styles.setBadgeText}>{index + 1}</Text>
          </View>
          <TextInput
            value={set.weight}
            onChangeText={(value) => onChangeSet(set.id, "weight", value)}
            placeholder={exercise.placeholderWeight ?? "0"}
            placeholderTextColor={colors.textTertiary}
            keyboardType="numeric"
            style={[styles.valueInput, styles.valueColumn]}
          />
          <TextInput
            value={set.reps}
            onChangeText={(value) => onChangeSet(set.id, "reps", value)}
            placeholder={exercise.placeholderReps ?? "0"}
            placeholderTextColor={colors.textTertiary}
            keyboardType="numeric"
            style={[styles.valueInput, styles.valueColumn]}
          />
        </View>
      ))}

      <Pressable style={styles.addSetButton} onPress={onAddSet}>
        <Ionicons name="add" size={16} color={colors.accentPrimary} />
        <Text style={styles.addSetText}>Add Set</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  nameInput: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.textPrimary,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  columnHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  columnHeader: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    color: colors.textTertiary,
    textAlign: "center",
  },
  setColumn: {
    width: 36,
  },
  valueColumn: {
    flex: 1,
  },
  setRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  setBadge: {
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentPrimaryMuted,
  },
  setBadgeText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.accentPrimary,
  },
  valueInput: {
    height: 40,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    color: colors.textPrimary,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "600",
  },
  addSetButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    marginTop: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.accentPrimary,
  },
  addSetText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.accentPrimary,
  },
});
