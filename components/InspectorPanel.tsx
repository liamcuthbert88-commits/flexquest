import { useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "@/constants/theme";
import { EQUIPMENT_CATALOG } from "@/constants/equipment";
import { useUser } from "@/contexts/UserContext";
import type { Selection, NpcSnapshot } from "@/components/GymFloor3D";

const PANEL_HIDDEN_OFFSET = 320;
const NPC_SNAPSHOT_POLL_MS = 500;

type Props = {
  selection: Selection | null;
  onClose: () => void;
  onUpgrade: (equipmentId: string) => void;
};

export function InspectorPanel({ selection, onClose, onUpgrade }: Props) {
  const { hiredManagerIds, globalMultiplier, equipmentLevels, cash } = useUser();
  const translateY = useRef(new Animated.Value(PANEL_HIDDEN_OFFSET)).current;
  const [npcSnapshot, setNpcSnapshot] = useState<NpcSnapshot | null>(null);

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: selection ? 0 : PANEL_HIDDEN_OFFSET,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [selection, translateY]);

  useEffect(() => {
    if (!selection || selection.type !== "npc") {
      setNpcSnapshot(null);
      return;
    }

    function refresh() {
      if (selection && selection.type === "npc") {
        setNpcSnapshot(selection.getSnapshot());
      }
    }

    refresh();
    const interval = setInterval(refresh, NPC_SNAPSHOT_POLL_MS);
    return () => clearInterval(interval);
  }, [selection]);

  const equipmentItem =
    selection?.type === "equipment"
      ? EQUIPMENT_CATALOG.find((item) => item.id === selection.id)
      : null;

  const equipmentLevel = equipmentItem ? equipmentLevels[equipmentItem.id] ?? 1 : 1;
  const nextUpgradeCost = equipmentItem
    ? Math.round(equipmentItem.cost * Math.pow(1.5, equipmentLevel))
    : 0;
  const canAffordUpgrade = cash >= nextUpgradeCost;

  return (
    <Animated.View style={[styles.panel, { transform: [{ translateY }] }]}>
      <Pressable style={styles.closeButton} onPress={onClose} hitSlop={12}>
        <Ionicons name="close" size={18} color={colors.textSecondary} />
      </Pressable>

      {selection?.type === "equipment" && equipmentItem && (
        <>
          <View style={styles.headerRow}>
            <View style={styles.titleGroup}>
              <View style={styles.iconBadge}>
                <Ionicons name="barbell-outline" size={20} color={colors.accentPrimary} />
              </View>
              <Text style={styles.title} numberOfLines={1}>
                {equipmentItem.name}
              </Text>
            </View>

            <Pressable
              style={[styles.actionButton, !canAffordUpgrade && styles.actionButtonDisabled]}
              disabled={!canAffordUpgrade}
              onPress={() => onUpgrade(equipmentItem.id)}
            >
              <Text style={styles.actionButtonText}>Upgrade ⚡</Text>
            </Pressable>
          </View>

          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Current Tier</Text>
            <Text style={styles.statValue}>Level {equipmentLevel}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Next Tier Cost</Text>
            <Text style={styles.statValue}>Level {equipmentLevel + 1} — ${nextUpgradeCost}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Requires</Text>
            <Text style={styles.statValue}>Level {equipmentItem.requiredLevel}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Staff Automation</Text>
            <Text style={styles.statValue}>
              {hiredManagerIds.length > 0
                ? `${hiredManagerIds.length} manager(s) active`
                : "None hired yet"}
            </Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Output</Text>
            <Text style={styles.statValue}>
              +${equipmentItem.cashPerSecond * equipmentLevel}/sec (
              {(equipmentItem.cashPerSecond * equipmentLevel * globalMultiplier).toFixed(1)}/sec
              effective)
            </Text>
          </View>
        </>
      )}

      {selection?.type === "npc" && npcSnapshot && (
        <>
          <View style={styles.headerRow}>
            <View style={styles.titleGroup}>
              <View style={styles.iconBadge}>
                <Ionicons name="person-outline" size={20} color={colors.accentPrimary} />
              </View>
              <Text style={styles.title} numberOfLines={1}>
                {npcSnapshot.name}
              </Text>
            </View>
          </View>

          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Status</Text>
            <Text style={styles.statValue}>{npcSnapshot.stateLabel}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Time in Activity</Text>
            <Text style={styles.statValue}>{npcSnapshot.stateTimerSeconds.toFixed(0)}s</Text>
          </View>
        </>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    marginHorizontal: 16,
    marginBottom: 24,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.accentPrimary,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.sm,
    // Lets the card read as floating above the interface, not flush with it.
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  closeButton: {
    position: "absolute",
    top: 12,
    right: 12,
    zIndex: 1,
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceElevated,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
    paddingRight: 32,
  },
  titleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
    minWidth: 0,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentPrimaryMuted,
  },
  title: {
    flexShrink: 1,
    fontSize: 17,
    fontWeight: "700",
    color: colors.textPrimary,
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
    fontSize: 13,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  actionButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentPrimary,
  },
  actionButtonDisabled: {
    backgroundColor: colors.surfaceElevated,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
  },
});
