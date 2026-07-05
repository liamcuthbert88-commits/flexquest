import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "@/constants/theme";
import { useUser } from "@/contexts/UserContext";

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function EmpireSnapshotModal({ visible, onClose }: Props) {
  const { gymLevel, prestigeCount, currentLocation, purchasedEquipmentIds, lifetimeCashEarned } =
    useUser();

  const stats = [
    { label: "Gym Level", value: `${gymLevel}` },
    { label: "Prestige Tier", value: `${prestigeCount}` },
    { label: "Location", value: currentLocation.name },
    { label: "Equipment Owned", value: `${purchasedEquipmentIds.length}` },
    { label: "Lifetime Cash Earned", value: `$${lifetimeCashEarned.toFixed(0)}` },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Pressable style={styles.closeButton} onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={20} color={colors.textSecondary} />
          </Pressable>

          <Text style={styles.eyebrow}>EMPIRE SNAPSHOT</Text>
          <Text style={styles.title}>FlexQuest Tycoon 🏆</Text>

          <View style={styles.statList}>
            {stats.map((stat) => (
              <View key={stat.label} style={styles.statRow}>
                <Text style={styles.statLabel}>{stat.label}</Text>
                <Text style={styles.statValue}>{stat.value}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.footer}>Built one rep at a time 💪</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    padding: spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.accentPrimary,
    backgroundColor: colors.surface,
    padding: spacing.xl,
    gap: spacing.md,
  },
  closeButton: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceElevated,
    zIndex: 1,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: colors.accentPrimary,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  statList: {
    marginTop: spacing.sm,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  statValue: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.accentRenown,
  },
  footer: {
    marginTop: spacing.sm,
    fontSize: 12,
    fontWeight: "500",
    color: colors.textTertiary,
    textAlign: "center",
  },
});
