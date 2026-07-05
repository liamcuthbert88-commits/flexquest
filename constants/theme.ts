// Shared dark theme tokens for FlexQuest. Keep every screen pulling from
// here so visual language stays consistent as new screens are added.

export const colors = {
  background: "#0D0E12",
  surface: "#17181D",
  surfaceElevated: "#1E2027",
  border: "#272A32",

  textPrimary: "#F2F3F5",
  textSecondary: "#9096A3",
  textTertiary: "#5C6270",

  // Violet: progression / level / XP branding
  accentPrimary: "#8B5CF6",
  accentPrimaryMuted: "rgba(139, 92, 246, 0.16)",

  // Orange: the one high-energy "go do it" color, reserved for the
  // primary action so it stays the most eye-catching thing on screen.
  accentAction: "#FF7A45",
  accentActionMuted: "rgba(255, 122, 69, 0.16)",

  success: "#34D399",

  // Gold: Renown / Gym Level — the "prestige" currency, kept visually
  // distinct from the violet XP/level track.
  accentRenown: "#FBBF24",
  accentRenownMuted: "rgba(251, 191, 36, 0.16)",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 24,
  pill: 999,
} as const;

export const typography = {
  title: {
    fontSize: 28,
    fontWeight: "700" as const,
    color: colors.textPrimary,
  },
  heading: {
    fontSize: 20,
    fontWeight: "700" as const,
    color: colors.textPrimary,
  },
  body: {
    fontSize: 15,
    fontWeight: "500" as const,
    color: colors.textSecondary,
  },
  label: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: colors.textTertiary,
  },
};
