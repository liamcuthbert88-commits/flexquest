import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "@/constants/theme";

export type GymPageKey = "gymFloor" | "shop" | "leaderboard" | "challenges";

const PAGES: {
  key: GymPageKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: "gymFloor", label: "Gym Floor", icon: "cube-outline", iconActive: "cube" },
  { key: "shop", label: "Shop", icon: "cart-outline", iconActive: "cart" },
  { key: "leaderboard", label: "Leaderboard", icon: "trophy-outline", iconActive: "trophy" },
  { key: "challenges", label: "Challenges", icon: "flag-outline", iconActive: "flag" },
];

type GymBottomNavProps = {
  activePage: GymPageKey;
  onSelectPage: (page: GymPageKey) => void;
};

/** Low-profile 4-tab bottom navigation. Filled icon variant on the active
 * tab, outline on the rest — no extra icon asset/library needed since
 * Ionicons already ships matching outline/filled pairs for all four. */
export function GymBottomNav({ activePage, onSelectPage }: GymBottomNavProps) {
  return (
    <View style={styles.nav}>
      {PAGES.map((page) => {
        const isActive = page.key === activePage;
        return (
          <Pressable
            key={page.key}
            onPress={() => onSelectPage(page.key)}
            style={({ pressed }) => [styles.navItem, pressed && styles.navItemPressed]}
            hitSlop={8}
          >
            <Ionicons
              name={isActive ? page.iconActive : page.icon}
              size={24}
              color={isActive ? colors.accentPrimary : colors.textTertiary}
            />
            <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>{page.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
    paddingTop: spacing.xs,
  },
  navItem: {
    flex: 1,
    // Explicit minimum, not just "however much the icon+label+padding add
    // up to" — 48 comfortably clears both iOS's 44pt and Android's 48dp
    // minimum recommended touch target, so each tab stays reliably tappable
    // regardless of font-scaling or future label/icon size tweaks.
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingVertical: spacing.sm,
  },
  navItemPressed: {
    opacity: 0.6,
  },
  navLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textTertiary,
  },
  navLabelActive: {
    color: colors.accentPrimary,
    fontWeight: "700",
  },
});
