import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "@/constants/theme";

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  name: string;
  subtitle: string;
  cost: number;
  isOwned: boolean;
  /** When set and the item isn't owned, shows a locked badge instead of a buy button. */
  lockedReason?: string;
  canAfford: boolean;
  onBuy: () => void;
};

export function ShopItemCard({
  icon,
  name,
  subtitle,
  cost,
  isOwned,
  lockedReason,
  canAfford,
  onBuy,
}: Props) {
  const isLocked = !isOwned && !!lockedReason;
  const isDimmed = !isOwned && (isLocked || !canAfford);

  return (
    <View style={[styles.card, isDimmed && styles.cardDimmed]}>
      <View style={styles.iconBadge}>
        <Ionicons name={icon} size={22} color={colors.accentPrimary} />
      </View>

      <View style={styles.info}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>

      {isOwned ? (
        <View style={styles.ownedBadge}>
          <Ionicons name="checkmark" size={14} color={colors.success} />
          <Text style={styles.ownedBadgeText}>Owned</Text>
        </View>
      ) : isLocked ? (
        <View style={styles.lockedBadge}>
          <Text style={styles.lockedBadgeText}>{lockedReason}</Text>
        </View>
      ) : (
        <Pressable
          style={[styles.buyButton, !canAfford && styles.buyButtonDisabled]}
          disabled={!canAfford}
          onPress={onBuy}
        >
          <Text style={styles.buyButtonText}>${cost}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  cardDimmed: {
    opacity: 0.5,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentPrimaryMuted,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.textSecondary,
  },
  buyButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.accentPrimary,
  },
  buyButtonDisabled: {
    backgroundColor: colors.surfaceElevated,
  },
  buyButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  lockedBadge: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceElevated,
  },
  lockedBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textTertiary,
  },
  ownedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: "rgba(52, 211, 153, 0.16)",
  },
  ownedBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.success,
  },
});
