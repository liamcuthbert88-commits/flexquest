import { useRef } from "react";
import { Animated, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "@/constants/theme";
import { LOCATION_CATALOG } from "@/constants/locations";
import { useUser } from "@/contexts/UserContext";

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function PrestigeModal({ visible, onClose }: Props) {
  const { gymLevel, prestigeCount, currentLocation, currentLocationId, globalMultiplier, prestigeReset } =
    useUser();
  const flashOpacity = useRef(new Animated.Value(0)).current;

  const currentIndex = LOCATION_CATALOG.findIndex((loc) => loc.id === currentLocationId);
  const nextLocation = LOCATION_CATALOG[currentIndex + 1];

  if (!nextLocation) return null;

  const isEligible =
    gymLevel >= nextLocation.requiredLevel && prestigeCount + 1 >= nextLocation.requiredPrestige;
  const newGlobalMultiplier = (1 + (prestigeCount + 1) * 0.5) * nextLocation.multiplier;

  function handleConfirm() {
    const success = prestigeReset(nextLocation.id);
    if (!success) return;

    flashOpacity.setValue(1);
    Animated.timing(flashOpacity, {
      toValue: 0,
      duration: 700,
      useNativeDriver: true,
    }).start(() => onClose());
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>PRESTIGE</Text>
          <Text style={styles.title}>
            Sell your {currentLocation.name} to unlock{"\n"}
            {nextLocation.name}!
          </Text>
          <Text style={styles.subtitle}>
            Every prestige permanently adds +50% to your earnings multiplier, on top of{" "}
            {nextLocation.name}&apos;s own {nextLocation.multiplier}x boost.
          </Text>

          <View style={styles.multiplierRow}>
            <View style={styles.multiplierBox}>
              <Text style={styles.multiplierLabel}>CURRENT</Text>
              <Text style={styles.multiplierValue}>{globalMultiplier.toFixed(2)}x</Text>
            </View>
            <Text style={styles.multiplierArrow}>→</Text>
            <View style={[styles.multiplierBox, styles.multiplierBoxHighlight]}>
              <Text style={styles.multiplierLabel}>NEW</Text>
              <Text style={styles.multiplierValue}>{newGlobalMultiplier.toFixed(2)}x</Text>
            </View>
          </View>

          <Text style={styles.warning}>
            Your cash, equipment, and staff will reset. Renown, Gym Level, and Facility Upgrades
            carry over.
          </Text>

          {!isEligible && (
            <Text style={styles.ineligible}>
              Requires Gym Level {nextLocation.requiredLevel}
            </Text>
          )}

          <View style={styles.buttonRow}>
            <Pressable style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Not Yet</Text>
            </Pressable>
            <Pressable
              style={[styles.confirmButton, !isEligible && styles.confirmButtonDisabled]}
              disabled={!isEligible}
              onPress={handleConfirm}
            >
              <Text style={styles.confirmButtonText}>Prestige Now</Text>
            </Pressable>
          </View>
        </View>

        <Animated.View
          pointerEvents="none"
          style={[styles.flashOverlay, { opacity: flashOpacity }]}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    padding: spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accentRenown,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    color: colors.accentRenown,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.textSecondary,
    lineHeight: 18,
  },
  multiplierRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    marginVertical: spacing.sm,
  },
  multiplierBox: {
    flex: 1,
    alignItems: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    paddingVertical: spacing.sm,
  },
  multiplierBoxHighlight: {
    borderColor: colors.accentRenown,
    backgroundColor: colors.accentRenownMuted,
  },
  multiplierLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    color: colors.textTertiary,
  },
  multiplierValue: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
    marginTop: 2,
  },
  multiplierArrow: {
    fontSize: 16,
    color: colors.textTertiary,
  },
  warning: {
    fontSize: 11,
    fontWeight: "500",
    color: colors.textTertiary,
  },
  ineligible: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.accentAction,
    textAlign: "center",
  },
  buttonRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  cancelButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textSecondary,
  },
  confirmButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: colors.accentRenown,
  },
  confirmButtonDisabled: {
    backgroundColor: colors.surfaceElevated,
  },
  confirmButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.background,
  },
  flashOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.accentRenown,
  },
});
