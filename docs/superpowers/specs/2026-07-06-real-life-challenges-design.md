# Real-Life Challenges — Design Spec

## Goal

Replace the existing game-progress quest system (auto-detected, one-time,
e.g. "own 2 pieces of equipment") with real-life fitness challenges that the
player self-reports by ticking a checkbox. Challenges are daily-repeatable,
grouped into Easy/Medium/Hard/Elite tiers, and become the new (and only)
source of Renown/Gym Level progression.

## Why replace rather than add alongside

Renown (which drives `gymLevel` and therefore zone/equipment unlock gates)
is currently granted *only* by `evaluateQuests` inside `contexts/UserContext.tsx`,
triggered off game-state (equipment owned, cashPerSecond, workout exercise
names). Real-life challenges take over this role entirely: ticking a
challenge grants cash + Renown, same as quests did, but the trigger is now
an honest self-report of physical activity instead of automatic game-state
detection.

## Data Model

### `constants/challenges.ts` (new, replaces `constants/quests.ts`)

```ts
export type ChallengeTier = "easy" | "medium" | "hard" | "elite";

export type Challenge = {
  id: string;
  tier: ChallengeTier;
  title: string;
  description: string;
  rewardCash: number;
  rewardRenown: number;
};

export const CHALLENGE_CATALOG: Challenge[] = [
  // Easy
  { id: "pushup-starter", tier: "easy", title: "Push-Up Starter", description: "Do 10 push-ups", rewardCash: 50, rewardRenown: 5 },
  { id: "morning-mile", tier: "easy", title: "Morning Mile", description: "Take a 10-minute walk", rewardCash: 50, rewardRenown: 5 },
  { id: "hydration-check", tier: "easy", title: "Hydration Check", description: "Drink 2 liters of water today", rewardCash: 50, rewardRenown: 5 },
  // Medium
  { id: "step-it-up", tier: "medium", title: "Step It Up", description: "Walk 5,000 steps", rewardCash: 150, rewardRenown: 15 },
  { id: "core-crusher", tier: "medium", title: "Core Crusher", description: "Do 30 sit-ups", rewardCash: 150, rewardRenown: 15 },
  { id: "half-hour-hustle", tier: "medium", title: "Half-Hour Hustle", description: "Complete a 20-minute workout session", rewardCash: 150, rewardRenown: 15 },
  // Hard
  { id: "10k-strider", tier: "hard", title: "10K Strider", description: "Walk 10,000 steps", rewardCash: 400, rewardRenown: 40 },
  { id: "pushup-half-century", tier: "hard", title: "Push-Up Half-Century", description: "Do 50 push-ups", rewardCash: 400, rewardRenown: 40 },
  { id: "sweat-session", tier: "hard", title: "Sweat Session", description: "Complete a 45-minute workout", rewardCash: 400, rewardRenown: 40 },
  // Elite
  { id: "step-master", tier: "elite", title: "Step Master", description: "Walk 15,000 steps", rewardCash: 1000, rewardRenown: 100 },
  { id: "century-club", tier: "elite", title: "Century Club", description: "Do 100 push-ups", rewardCash: 1000, rewardRenown: 100 },
  { id: "iron-hour", tier: "elite", title: "Iron Hour", description: "Complete a 60-minute workout or run 5K", rewardCash: 1000, rewardRenown: 100 },
];

export const CHALLENGE_TIERS: ChallengeTier[] = ["easy", "medium", "hard", "elite"];
```

### `contexts/UserContext.tsx` changes

**Remove:**
- `import { QUEST_CATALOG, type Quest, type QuestContext } from "@/constants/quests"`
- `completedQuestIds` state, its persistence field, its `isValidPersistedStats` check
- `QuestCheckResult` type, `evaluateQuests` function, `checkQuests` function
- All 6 `evaluateQuests(...)` call sites inside `buyEquipment`, `upgradeEquipment`,
  `buyUpgrade`, `hireManager`, `hireStaff`, `buyZone` (each currently spreads
  `questResult` into its return value)
- `PurchaseResult` narrows from `QuestCheckResult & { success }` to just `{ success: boolean }`

**Add:**
- `completedChallenges: Record<string, string>` — maps `challengeId` to the
  local date string (`YYYY-MM-DD`) it was last claimed on, computed with a
  small helper (`getLocalDateString()`, built from `getFullYear()`/`getMonth()`/
  `getDate()` — not `toLocaleDateString`, whose locale-dependent output isn't
  guaranteed stable across Hermes/JSC). Persisted alongside other stats,
  defaults to `{}` for saves that predate this feature.
- `isChallengeCompletedToday(challengeId: string): boolean` — compares
  `completedChallenges[challengeId]` against today's date string.
- `claimChallenge(challengeId: string): { success: boolean; gymLevelUp?: { newGymLevel: number } }`
  — looks up the challenge in `CHALLENGE_CATALOG`; if not found or already
  completed today, returns `{ success: false }`; otherwise credits
  `rewardCash` via `creditCash`, calls `addRenown(rewardRenown)`, records
  today's date in `completedChallenges`, and returns success plus
  `gymLevelUp` if the renown addition crossed a gym-level threshold.

Keep `addRenown`, `gymLevel`, `renownPoints`, `renownToNextGymLevel` as-is —
only the trigger for gaining renown changes, not the leveling math itself.

## UI — `app/tycoon.tsx` Challenges page

Replace the "ACTIVE CHALLENGES 🎯" quest-list section with a
"REAL-LIFE CHALLENGES 💪" section:

- A 4-way tier tab switcher (Easy/Medium/Hard/Elite) using the same visual
  pattern as the existing Shop tab switcher already in this file.
- Each tab shows its 3 challenges as cards: title, description, reward line
  (`+$X · +Y Renown`), and a tick/checkbox control.
- Tapping the tick calls `claimChallenge(id)`. On success, show a reward
  alert (reuse the existing `Alert.alert` pattern), and the card flips to a
  checked/greyed "Done today — resets at midnight" state (derived from
  `isChallengeCompletedToday`, so it un-checks itself automatically the next
  time the player opens the app on a new day — no timers needed).
- On failure (already claimed today), the tick control is simply
  disabled/checked — no separate error path needed since the UI never lets
  you tap an already-completed card.

`handlePurchaseResult` simplifies to just early-returning on `!result.success`
— there is no longer anything to report for a plain purchase (no quest
completions or gym-level-ups can result from buying gear).

## Cleanup — `app/workout.tsx`

Remove the `checkQuests(exerciseNames)` call and the `newlyCompleted`/
`gymLevelUp` toast lines from the post-workout summary. Workouts keep their
XP/cash/level-up messaging; they no longer touch quests or Renown directly
(Renown now comes exclusively from the Challenges page).

## Migration / existing saves

- `completedQuestIds` field is simply dropped from the persisted shape;
  existing saves' Renown/`gymLevel` values are untouched (Renown is a
  cumulative number, not recomputed from quest state).
- `completedChallenges` defaults to `{}` for any save that doesn't have it,
  so existing players start with a full slate of un-ticked challenges.

## Out of scope

- No step-counter/pedometer integration — all challenges are honor-system,
  self-ticked.
- No combo/streak bonuses for clearing an entire tier in one day.
- No per-challenge cooldown other than the shared local-midnight reset.
