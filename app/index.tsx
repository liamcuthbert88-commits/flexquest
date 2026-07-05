import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { HeaderBar } from "@/components/HeaderBar";
import { RoutineModal } from "@/components/RoutineModal";
import { StartWorkoutButton } from "@/components/StartWorkoutButton";
import { TodaysWorkoutCard } from "@/components/TodaysWorkoutCard";
import { WeeklyCalendarBar } from "@/components/WeeklyCalendarBar";
import { colors, radius, spacing, typography } from "@/constants/theme";

export default function HomeScreen() {
  const router = useRouter();
  const [isRoutineModalVisible, setRoutineModalVisible] = useState(false);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <HeaderBar />

        <Pressable style={styles.gymButton} onPress={() => router.push("/tycoon")}>
          <Text style={styles.gymButtonText}>Go to My Gym 🏢</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.accentPrimary} />
        </Pressable>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={typography.label}>THIS WEEK</Text>
            <Pressable
              style={styles.editRoutineButton}
              onPress={() => setRoutineModalVisible(true)}
            >
              <Ionicons name="create-outline" size={14} color={colors.accentPrimary} />
              <Text style={styles.editRoutineText}>Edit Routine</Text>
            </Pressable>
          </View>
          <WeeklyCalendarBar />
        </View>

        <View style={styles.section}>
          <TodaysWorkoutCard />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <StartWorkoutButton onPress={() => router.push("/workout")} />
      </View>

      <RoutineModal
        visible={isRoutineModalVisible}
        onClose={() => setRoutineModalVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.xl,
  },
  section: {
    gap: spacing.md,
  },
  gymButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accentPrimary,
    backgroundColor: colors.accentPrimaryMuted,
  },
  gymButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  editRoutineButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.accentPrimaryMuted,
  },
  editRoutineText: {
    fontSize: 12,
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
});
