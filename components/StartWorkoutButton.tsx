import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text } from "react-native";
import { colors, radius, spacing } from "@/constants/theme";

type Props = {
  onPress?: () => void;
};

export function StartWorkoutButton({ onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
    >
      <Ionicons name="add-circle" size={22} color={colors.textPrimary} />
      <Text style={styles.label}>Start Empty Workout</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.accentAction,
    borderRadius: radius.lg,
    paddingVertical: spacing.md + 2,
    shadowColor: colors.accentAction,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  label: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.textPrimary,
  },
});
