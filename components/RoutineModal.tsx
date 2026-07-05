import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DAY_KEYS, DAY_LABELS, getTodayKey, type DayKey } from "@/constants/week";
import { REST_FOCUS, useRoutine, type DayRoutine, type Routine } from "@/contexts/RoutineContext";
import { EXERCISE_TEMPLATES_BY_PRESET } from "@/constants/routineTemplates";
import { colors, radius, spacing, typography } from "@/constants/theme";

const PRESETS = ["Push", "Pull", "Legs", REST_FOCUS];

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function RoutineModal({ visible, onClose }: Props) {
  const { routine, setRoutine } = useRoutine();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<Routine>(routine);
  const todayKey = getTodayKey();

  // Re-sync the draft from the committed routine each time the sheet opens,
  // so a cancelled edit never leaks into the next open.
  useEffect(() => {
    if (visible) {
      setDraft(routine);
    }
  }, [visible, routine]);

  function handleSave() {
    setRoutine(draft);
    onClose();
  }

  function setDayRoutine(day: DayKey, dayRoutine: DayRoutine) {
    setDraft((prev) => ({ ...prev, [day]: dayRoutine }));
  }

  function setDayName(day: DayKey, name: string) {
    setDayRoutine(day, { ...draft[day], name });
  }

  function togglePreset(day: DayKey, preset: string) {
    if (draft[day].name === preset) {
      setDayRoutine(day, { name: "", exercises: [] });
    } else {
      setDayRoutine(day, { name: preset, exercises: EXERCISE_TEMPLATES_BY_PRESET[preset] ?? [] });
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.sheetWrapper}
        pointerEvents="box-none"
      >
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <Text style={typography.heading}>Edit Your Routine</Text>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeButton}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>
          <Text style={styles.subheading}>
            Set a focus for each day, or leave it as Rest.
          </Text>

          <ScrollView
            style={styles.dayList}
            contentContainerStyle={styles.dayListContent}
            showsVerticalScrollIndicator={false}
          >
            {DAY_KEYS.map((day) => (
              <View key={day} style={styles.dayRow}>
                <View style={styles.dayLabelRow}>
                  <Text style={styles.dayLabel}>{DAY_LABELS[day]}</Text>
                  {day === todayKey && (
                    <View style={styles.todayTag}>
                      <Text style={styles.todayTagText}>TODAY</Text>
                    </View>
                  )}
                </View>

                <View style={styles.chipRow}>
                  {PRESETS.map((preset) => {
                    const selected = draft[day].name === preset;
                    return (
                      <Pressable
                        key={preset}
                        onPress={() => togglePreset(day, preset)}
                        style={[styles.chip, selected && styles.chipSelected]}
                      >
                        <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                          {preset}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <TextInput
                  value={draft[day].name}
                  onChangeText={(text) => setDayName(day, text)}
                  placeholder="Or type your own focus…"
                  placeholderTextColor={colors.textTertiary}
                  style={styles.input}
                />
              </View>
            ))}
          </ScrollView>

          <Pressable style={styles.saveButton} onPress={handleSave}>
            <Text style={styles.saveButtonText}>Save Routine</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  sheetWrapper: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "85%",
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomWidth: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceElevated,
  },
  subheading: {
    marginTop: spacing.xs,
    fontSize: 13,
    color: colors.textSecondary,
  },
  dayList: {
    marginTop: spacing.md,
  },
  dayListContent: {
    gap: spacing.lg,
    paddingBottom: spacing.md,
  },
  dayRow: {
    gap: spacing.sm,
  },
  dayLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  dayLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  todayTag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.accentPrimaryMuted,
  },
  todayTagText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    color: colors.accentPrimary,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  chipSelected: {
    backgroundColor: colors.accentPrimaryMuted,
    borderColor: colors.accentPrimary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  chipTextSelected: {
    color: colors.accentPrimary,
  },
  input: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 14,
    color: colors.textPrimary,
  },
  saveButton: {
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentAction,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
  },
});
