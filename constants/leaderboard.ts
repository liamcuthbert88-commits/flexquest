export type LeaderboardEntry = {
  name: string;
  renownPoints: number;
  prestigeCount: number;
};

/** Simulated rivals — there's no backend, so this is a fixed local mock. */
export const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  { name: "IronReign_Marcus", renownPoints: 4820, prestigeCount: 6 },
  { name: "GymTycoonKelsey", renownPoints: 3110, prestigeCount: 4 },
  { name: "SwoleEmpireDT", renownPoints: 2275, prestigeCount: 3 },
  { name: "BarbellBaronessX", renownPoints: 1490, prestigeCount: 2 },
  { name: "PlateStackPhil", renownPoints: 860, prestigeCount: 1 },
  { name: "RepCountRiley", renownPoints: 410, prestigeCount: 1 },
  { name: "NewbieGains99", renownPoints: 95, prestigeCount: 0 },
  { name: "FirstDayFrank", renownPoints: 20, prestigeCount: 0 },
];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Defensively normalizes a leaderboard entry — guards against a missing
 * name or non-finite stat that would otherwise break sorting or rendering. */
export function sanitizeLeaderboardEntry(
  entry: Partial<LeaderboardEntry> | null | undefined
): LeaderboardEntry {
  const name = typeof entry?.name === "string" && entry.name.trim().length > 0
    ? entry.name.trim()
    : "Unknown Tycoon";

  return {
    name,
    renownPoints: isFiniteNumber(entry?.renownPoints) ? entry.renownPoints : 0,
    prestigeCount: isFiniteNumber(entry?.prestigeCount) ? entry.prestigeCount : 0,
  };
}
