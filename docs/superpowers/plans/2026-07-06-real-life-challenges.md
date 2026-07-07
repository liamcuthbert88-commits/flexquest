# Real-Life Challenges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the auto-detected, one-time game-progress quest system with self-ticked, daily-repeatable real-life fitness challenges across four difficulty tiers (Easy/Medium/Hard/Elite), which become the new source of Renown/Gym Level progression.

**Architecture:** A flat challenge catalog (`constants/challenges.ts`) replaces the quest catalog. `UserContext` drops the quest-evaluation machinery (`evaluateQuests`/`checkQuests`/`completedQuestIds`) and adds `completedChallenges` (a challengeId → last-claimed-date map) plus a `claimChallenge(id)` action that credits cash + Renown once per local day. The Challenges page in `app/tycoon.tsx` gets a 4-tab tier switcher and a new `ChallengeCard` component; `app/workout.tsx` drops its now-removed quest hook.

**Tech Stack:** React Native + Expo Router, React Context (`contexts/UserContext.tsx`), AsyncStorage via `lib/storage.ts`. No test framework in this repo — verification uses throwaway Node scripts (deleted after confirming output) and a Playwright headless smoke test against the web dev server, matching the pattern used by prior plans in this repo (e.g. `docs/superpowers/plans/2026-07-06-play-area-resize.md`).

## Global Constraints

- Date keys use `YYYY-MM-DD` computed from `getFullYear()`/`getMonth()`/`getDate()` — never `toLocaleDateString`, which is not guaranteed stable across Hermes/JSC.
- Challenge catalog: exactly 12 entries, 3 per tier (`easy`, `medium`, `hard`, `elite`), in this exact order and with these exact values:

  | id | tier | title | description | rewardCash | rewardRenown |
  |---|---|---|---|---|---|
  | `pushup-starter` | easy | Push-Up Starter | Do 10 push-ups | 50 | 5 |
  | `morning-mile` | easy | Morning Mile | Take a 10-minute walk | 50 | 5 |
  | `hydration-check` | easy | Hydration Check | Drink 2 liters of water today | 50 | 5 |
  | `step-it-up` | medium | Step It Up | Walk 5,000 steps | 150 | 15 |
  | `core-crusher` | medium | Core Crusher | Do 30 sit-ups | 150 | 15 |
  | `half-hour-hustle` | medium | Half-Hour Hustle | Complete a 20-minute workout session | 150 | 15 |
  | `10k-strider` | hard | 10K Strider | Walk 10,000 steps | 400 | 40 |
  | `pushup-half-century` | hard | Push-Up Half-Century | Do 50 push-ups | 400 | 40 |
  | `sweat-session` | hard | Sweat Session | Complete a 45-minute workout | 400 | 40 |
  | `step-master` | elite | Step Master | Walk 15,000 steps | 1000 | 100 |
  | `century-club` | elite | Century Club | Do 100 push-ups | 1000 | 100 |
  | `iron-hour` | elite | Iron Hour | Complete a 60-minute workout or run 5K | 1000 | 100 |

- `PurchaseResult` narrows to `{ success: boolean }` — no task may re-add quest fields to it.
- `addRenown`/`gymLevel`/`renownPoints`/`renownToNextGymLevel` are unchanged — only the trigger for gaining Renown changes.
- Task 3 (the `UserContext.tsx` refactor) intentionally leaves `app/tycoon.tsx` and `app/workout.tsx` referencing now-removed exports (`QUEST_CATALOG`, `checkQuests`, `completedQuestIds`, quest-shaped `PurchaseResult`) — this is fixed in Task 4. Do not treat this as a defect in Task 3's review; the whole-repo `tsc --noEmit` is only required to be clean after Task 4.

---

### Task 1: Local date-key helper

**Files:**
- Create: `lib/date.ts`

**Interfaces:**
- Produces: `getLocalDateString(date?: Date): string` — returns `YYYY-MM-DD` for the given date (default `new Date()`) in the device's local timezone, zero-padded.

- [ ] **Step 1: Write the helper**

```ts
// lib/date.ts

/** Local-calendar-day key, e.g. "2026-07-06". Deliberately built from
 * getFullYear()/getMonth()/getDate() rather than toLocaleDateString(),
 * whose locale-dependent format isn't guaranteed stable across Hermes/JSC. */
export function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
```

- [ ] **Step 2: Verify with a throwaway script**

Create `/tmp/claude-scratch-date.js`:

```js
const { execSync } = require("child_process");
// Compile the single file with the TypeScript compiler already in node_modules,
// then require the emitted JS to exercise the real implementation.
execSync(
  "npx tsc lib/date.ts --outDir /tmp/claude-scratch-date-out --module commonjs --target es2019",
  { cwd: "/home/liamcuthbert88/FlexQuest", stdio: "inherit" }
);
const { getLocalDateString } = require("/tmp/claude-scratch-date-out/date.js");

const jan5 = new Date(2026, 0, 5, 23, 59); // Jan 5, single-digit month/day
console.assert(getLocalDateString(jan5) === "2026-01-05", "zero-padding failed: " + getLocalDateString(jan5));

const dec31 = new Date(2026, 11, 31, 0, 1);
console.assert(getLocalDateString(dec31) === "2026-12-31", "double-digit failed: " + getLocalDateString(dec31));

const sameDayMorning = new Date(2026, 6, 6, 6, 0);
const sameDayNight = new Date(2026, 6, 6, 23, 0);
console.assert(
  getLocalDateString(sameDayMorning) === getLocalDateString(sameDayNight),
  "same-day mismatch"
);

console.log("All date helper assertions passed.");
```

Run: `node /tmp/claude-scratch-date.js`
Expected output: `All date helper assertions passed.` with no assertion errors printed above it.

Delete the scratch script and `/tmp/claude-scratch-date-out` afterward.

- [ ] **Step 3: Commit**

```bash
git add lib/date.ts
git commit -m "Add getLocalDateString helper for daily challenge resets"
```

---

### Task 2: Challenge catalog

**Files:**
- Create: `constants/challenges.ts`
- Delete: `constants/quests.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `ChallengeTier` (`"easy" | "medium" | "hard" | "elite"`), `Challenge` type (`{ id: string; tier: ChallengeTier; title: string; description: string; rewardCash: number; rewardRenown: number }`), `CHALLENGE_CATALOG: Challenge[]` (12 entries per the Global Constraints table), `CHALLENGE_TIERS: ChallengeTier[]` (`["easy", "medium", "hard", "elite"]`) — Task 3 imports all four.

- [ ] **Step 1: Create the catalog**

```ts
// constants/challenges.ts

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

- [ ] **Step 2: Delete the old quest catalog**

```bash
rm constants/quests.ts
```

Expected: `git status` shows `constants/quests.ts` as deleted and `constants/challenges.ts` as untracked/new. Note that `contexts/UserContext.tsx`, `app/tycoon.tsx` still import from `@/constants/quests` at this point — this will not resolve until Task 3/4 land. That's expected (see Global Constraints); do not attempt to fix those files in this task.

- [ ] **Step 3: Verify catalog shape with a throwaway script**

Create `/tmp/claude-scratch-challenges.js`:

```js
const { execSync } = require("child_process");
execSync(
  "npx tsc constants/challenges.ts --outDir /tmp/claude-scratch-challenges-out --module commonjs --target es2019",
  { cwd: "/home/liamcuthbert88/FlexQuest", stdio: "inherit" }
);
const { CHALLENGE_CATALOG, CHALLENGE_TIERS } = require("/tmp/claude-scratch-challenges-out/challenges.js");

console.assert(CHALLENGE_CATALOG.length === 12, "expected 12 entries, got " + CHALLENGE_CATALOG.length);
console.assert(CHALLENGE_TIERS.length === 4, "expected 4 tiers");

const ids = CHALLENGE_CATALOG.map((c) => c.id);
console.assert(new Set(ids).size === 12, "duplicate ids found");

for (const tier of CHALLENGE_TIERS) {
  const count = CHALLENGE_CATALOG.filter((c) => c.tier === tier).length;
  console.assert(count === 3, `expected 3 entries for tier ${tier}, got ${count}`);
}

const rewardsByTier = { easy: 50, medium: 150, hard: 400, elite: 1000 };
for (const challenge of CHALLENGE_CATALOG) {
  console.assert(
    challenge.rewardCash === rewardsByTier[challenge.tier],
    `${challenge.id} has wrong rewardCash ${challenge.rewardCash}`
  );
}

console.log("All challenge catalog assertions passed.");
```

Run: `node /tmp/claude-scratch-challenges.js`
Expected output: `All challenge catalog assertions passed.` with no assertion failures above it.

Delete the scratch script and `/tmp/claude-scratch-challenges-out` afterward.

- [ ] **Step 4: Commit**

```bash
git add constants/challenges.ts constants/quests.ts
git commit -m "Replace quest catalog with real-life challenge catalog"
```

---

### Task 3: Replace quest system in UserContext with challenge claiming

**Files:**
- Modify: `contexts/UserContext.tsx`

**Interfaces:**
- Consumes: `getLocalDateString` from `@/lib/date` (Task 1), `CHALLENGE_CATALOG` from `@/constants/challenges` (Task 2)
- Produces: `completedChallenges: Record<string, string>`, `isChallengeCompletedToday: (challengeId: string) => boolean`, `claimChallenge: (challengeId: string) => { success: boolean; gymLevelUp?: { newGymLevel: number } }` on `UserContextValue` — Task 4 consumes all three. `PurchaseResult` becomes `{ success: boolean }`.

- [ ] **Step 1: Update imports**

In `contexts/UserContext.tsx`, replace line 14:

```ts
import { QUEST_CATALOG, type Quest, type QuestContext } from "@/constants/quests";
```

with:

```ts
import { CHALLENGE_CATALOG } from "@/constants/challenges";
import { getLocalDateString } from "@/lib/date";
```

- [ ] **Step 2: Replace the quest/purchase-result types**

Replace lines 38-45:

```ts
type QuestCheckResult = {
  newlyCompleted: Quest[];
  gymLevelUp?: { newGymLevel: number };
};

export type PurchaseResult = QuestCheckResult & {
  success: boolean;
};
```

with:

```ts
export type PurchaseResult = {
  success: boolean;
};

export type ChallengeClaimResult = {
  success: boolean;
  gymLevelUp?: { newGymLevel: number };
};
```

- [ ] **Step 3: Update `PersistedUserStats` and its validator**

In the `PersistedUserStats` type (lines 47-64), replace:

```ts
  completedQuestIds: string[];
```

with:

```ts
  completedChallenges: Record<string, string>;
```

In `isValidPersistedStats` (lines 66-89), replace:

```ts
    Array.isArray(stats.completedQuestIds) &&
```

with:

```ts
    typeof stats.completedChallenges === "object" &&
    stats.completedChallenges !== null &&
```

- [ ] **Step 4: Update `UserContextValue`**

Replace lines 120-121:

```ts
  completedQuestIds: string[];
  checkQuests: (finishedWorkoutExerciseNames?: string[]) => QuestCheckResult;
```

with:

```ts
  completedChallenges: Record<string, string>;
  isChallengeCompletedToday: (challengeId: string) => boolean;
  claimChallenge: (challengeId: string) => ChallengeClaimResult;
```

- [ ] **Step 5: Update state, hydration, and persistence wiring**

Replace line 149:

```ts
  const [completedQuestIds, setCompletedQuestIds] = useState<string[]>([]);
```

with:

```ts
  const [completedChallenges, setCompletedChallenges] = useState<Record<string, string>>({});
```

In the hydration `useEffect` (around line 176), replace:

```ts
        setCompletedQuestIds(stored.completedQuestIds);
```

with:

```ts
        setCompletedChallenges(stored.completedChallenges);
```

In the persistence `useEffect`'s `stats` object (around line 204), replace:

```ts
      completedQuestIds,
```

with:

```ts
      completedChallenges,
```

...and in that same `useEffect`'s dependency array (around line 223), replace:

```ts
    completedQuestIds,
```

with:

```ts
    completedChallenges,
```

- [ ] **Step 6: Replace `evaluateQuests`/`checkQuests` with `claimChallenge`**

Replace the entire block from the `evaluateQuests` doc comment through the end of `checkQuests` (lines 300-333):

```ts
  /** Evaluates quests against an explicit context (rather than reading state
   * directly) so callers that just changed state this tick — e.g. a purchase
   * that hasn't re-rendered yet — can pass the *post-change* values instead
   * of a stale snapshot. */
  function evaluateQuests(ctx: QuestContext): QuestCheckResult {
    const newlyCompleted = QUEST_CATALOG.filter(
      (quest) => !completedQuestIds.includes(quest.id) && quest.isComplete(ctx)
    );

    if (newlyCompleted.length === 0) {
      return { newlyCompleted: [] };
    }

    const totalCash = newlyCompleted.reduce((sum, quest) => sum + quest.rewardCash, 0);
    const totalRenown = newlyCompleted.reduce((sum, quest) => sum + quest.rewardRenown, 0);

    creditCash(totalCash);
    setCompletedQuestIds((prev) => [...prev, ...newlyCompleted.map((quest) => quest.id)]);
    const renownResult = addRenown(totalRenown);

    return {
      newlyCompleted,
      gymLevelUp: renownResult.leveledUp ? { newGymLevel: renownResult.newGymLevel } : undefined,
    };
  }

  function checkQuests(finishedWorkoutExerciseNames: string[] = []): QuestCheckResult {
    return evaluateQuests({
      purchasedEquipmentIds,
      hiredManagerIds,
      cashPerSecond,
      finishedWorkoutExerciseNames,
    });
  }
```

with:

```ts
  function isChallengeCompletedToday(challengeId: string): boolean {
    return completedChallenges[challengeId] === getLocalDateString();
  }

  /** Self-ticked reward for a real-life fitness challenge. No-ops (returns
   * failure) if the challenge id is unknown or already claimed today — the
   * Challenges page UI never lets the player tap an already-completed card,
   * so the failure path only guards against stale/duplicate taps. */
  function claimChallenge(challengeId: string): ChallengeClaimResult {
    const challenge = CHALLENGE_CATALOG.find((entry) => entry.id === challengeId);
    if (!challenge) return { success: false };
    if (isChallengeCompletedToday(challengeId)) return { success: false };

    creditCash(challenge.rewardCash);
    setCompletedChallenges((prev) => ({ ...prev, [challengeId]: getLocalDateString() }));
    const renownResult = addRenown(challenge.rewardRenown);

    return {
      success: true,
      gymLevelUp: renownResult.leveledUp ? { newGymLevel: renownResult.newGymLevel } : undefined,
    };
  }
```

- [ ] **Step 7: Simplify the six purchase functions' return values**

In `buyEquipment` (around line 388), replace:

```ts
    if (!item) return { success: false, newlyCompleted: [] };
    if (purchasedEquipmentIds.includes(equipmentId)) return { success: false, newlyCompleted: [] };
    if (level < item.requiredLevel) return { success: false, newlyCompleted: [] };
    if (cash < item.cost) return { success: false, newlyCompleted: [] };

    setCash((prev) => prev - item.cost);
    const nextEquipmentIds = [...purchasedEquipmentIds, equipmentId];
    setPurchasedEquipmentIds(nextEquipmentIds);
    setEquipmentLevels((prev) => ({ ...prev, [equipmentId]: 1 }));

    const nextRawCashPerSecond = rawCashPerSecond + item.cashPerSecond;
    const questResult = evaluateQuests({
      purchasedEquipmentIds: nextEquipmentIds,
      hiredManagerIds,
      cashPerSecond: nextRawCashPerSecond * globalMultiplier,
      finishedWorkoutExerciseNames: [],
    });

    return { success: true, ...questResult };
```

with:

```ts
    if (!item) return { success: false };
    if (purchasedEquipmentIds.includes(equipmentId)) return { success: false };
    if (level < item.requiredLevel) return { success: false };
    if (cash < item.cost) return { success: false };

    setCash((prev) => prev - item.cost);
    setPurchasedEquipmentIds([...purchasedEquipmentIds, equipmentId]);
    setEquipmentLevels((prev) => ({ ...prev, [equipmentId]: 1 }));

    return { success: true };
```

In `upgradeEquipment` (around line 411), replace:

```ts
    if (!item) return { success: false, newlyCompleted: [] };
    if (!purchasedEquipmentIds.includes(equipmentId)) return { success: false, newlyCompleted: [] };

    const currentLevel = equipmentLevels[equipmentId] ?? 1;
    const cost = Math.round(item.cost * Math.pow(1.5, currentLevel));
    if (cash < cost) return { success: false, newlyCompleted: [] };

    setCash((prev) => prev - cost);
    setEquipmentLevels((prev) => ({ ...prev, [equipmentId]: currentLevel + 1 }));

    const nextRawCashPerSecond = rawCashPerSecond + item.cashPerSecond;
    const questResult = evaluateQuests({
      purchasedEquipmentIds,
      hiredManagerIds,
      cashPerSecond: nextRawCashPerSecond * globalMultiplier,
      finishedWorkoutExerciseNames: [],
    });

    return { success: true, ...questResult };
```

with:

```ts
    if (!item) return { success: false };
    if (!purchasedEquipmentIds.includes(equipmentId)) return { success: false };

    const currentLevel = equipmentLevels[equipmentId] ?? 1;
    const cost = Math.round(item.cost * Math.pow(1.5, currentLevel));
    if (cash < cost) return { success: false };

    setCash((prev) => prev - cost);
    setEquipmentLevels((prev) => ({ ...prev, [equipmentId]: currentLevel + 1 }));

    return { success: true };
```

In `buyUpgrade` (around line 504), replace:

```ts
    if (!upgrade) return { success: false, newlyCompleted: [] };
    if (purchasedUpgradeIds.includes(upgradeId)) return { success: false, newlyCompleted: [] };
    if (cash < upgrade.cost) return { success: false, newlyCompleted: [] };

    setCash((prev) => prev - upgrade.cost);
    setPurchasedUpgradeIds((prev) => [...prev, upgradeId]);

    const questResult = evaluateQuests({
      purchasedEquipmentIds,
      hiredManagerIds,
      cashPerSecond,
      finishedWorkoutExerciseNames: [],
    });

    return { success: true, ...questResult };
```

with:

```ts
    if (!upgrade) return { success: false };
    if (purchasedUpgradeIds.includes(upgradeId)) return { success: false };
    if (cash < upgrade.cost) return { success: false };

    setCash((prev) => prev - upgrade.cost);
    setPurchasedUpgradeIds((prev) => [...prev, upgradeId]);

    return { success: true };
```

In `hireManager` (around line 523), replace:

```ts
    if (!manager) return { success: false, newlyCompleted: [] };
    if (hiredManagerIds.includes(managerId)) return { success: false, newlyCompleted: [] };
    if (cash < manager.cost) return { success: false, newlyCompleted: [] };

    setCash((prev) => prev - manager.cost);
    const nextManagerIds = [...hiredManagerIds, managerId];
    setHiredManagerIds(nextManagerIds);

    const nextRawCashPerSecond = rawCashPerSecond + manager.cashPerSecond;
    const questResult = evaluateQuests({
      purchasedEquipmentIds,
      hiredManagerIds: nextManagerIds,
      cashPerSecond: nextRawCashPerSecond * globalMultiplier,
      finishedWorkoutExerciseNames: [],
    });

    return { success: true, ...questResult };
```

with:

```ts
    if (!manager) return { success: false };
    if (hiredManagerIds.includes(managerId)) return { success: false };
    if (cash < manager.cost) return { success: false };

    setCash((prev) => prev - manager.cost);
    setHiredManagerIds([...hiredManagerIds, managerId]);

    return { success: true };
```

In `hireStaff` (around line 544), replace:

```ts
    if (!staff) return { success: false, newlyCompleted: [] };
    if (hiredStaffIds.includes(staffId)) return { success: false, newlyCompleted: [] };
    if (cash < staff.cost) return { success: false, newlyCompleted: [] };

    setCash((prev) => prev - staff.cost);
    setHiredStaffIds((prev) => [...prev, staffId]);

    const questResult = evaluateQuests({
      purchasedEquipmentIds,
      hiredManagerIds,
      cashPerSecond,
      finishedWorkoutExerciseNames: [],
    });

    return { success: true, ...questResult };
```

with:

```ts
    if (!staff) return { success: false };
    if (hiredStaffIds.includes(staffId)) return { success: false };
    if (cash < staff.cost) return { success: false };

    setCash((prev) => prev - staff.cost);
    setHiredStaffIds((prev) => [...prev, staffId]);

    return { success: true };
```

In `buyZone` (around line 581), replace:

```ts
    if (!zone) return { success: false, newlyCompleted: [] };
    if (unlockedZones.includes(zoneId)) return { success: false, newlyCompleted: [] };
    if (gymLevel < zone.requiredLevel) return { success: false, newlyCompleted: [] };
    if (cash < zone.cost) return { success: false, newlyCompleted: [] };

    setCash((prev) => prev - zone.cost);
    setUnlockedZones((prev) => [...prev, zoneId]);

    const questResult = evaluateQuests({
      purchasedEquipmentIds,
      hiredManagerIds,
      cashPerSecond,
      finishedWorkoutExerciseNames: [],
    });

    return { success: true, ...questResult };
```

with:

```ts
    if (!zone) return { success: false };
    if (unlockedZones.includes(zoneId)) return { success: false };
    if (gymLevel < zone.requiredLevel) return { success: false };
    if (cash < zone.cost) return { success: false };

    setCash((prev) => prev - zone.cost);
    setUnlockedZones((prev) => [...prev, zoneId]);

    return { success: true };
```

- [ ] **Step 8: Update the `value` memo and its dependency array**

Replace lines 622-623:

```ts
      completedQuestIds,
      checkQuests,
```

with:

```ts
      completedChallenges,
      isChallengeCompletedToday,
      claimChallenge,
```

Replace line 652 (`completedQuestIds,` inside the dependency array) with:

```ts
      completedChallenges,
```

- [ ] **Step 9: Confirm the file's own logic is internally consistent**

Run: `grep -n "Quest\|quest" contexts/UserContext.tsx`
Expected: no output (every quest reference removed from this file).

Per Global Constraints, do NOT run a whole-repo `tsc --noEmit` as a pass/fail gate for this task — `app/tycoon.tsx` and `app/workout.tsx` still reference the old API and won't compile until Task 4. That's expected.

- [ ] **Step 10: Commit**

```bash
git add contexts/UserContext.tsx
git commit -m "Replace quest evaluation with daily challenge claiming in UserContext"
```

---

### Task 4: Wire Challenges UI and clean up consumers

**Files:**
- Create: `components/ChallengeCard.tsx`
- Modify: `app/tycoon.tsx`
- Modify: `app/workout.tsx`

**Interfaces:**
- Consumes: `completedChallenges`, `isChallengeCompletedToday`, `claimChallenge` from `useUser()` (Task 3); `CHALLENGE_CATALOG`, `CHALLENGE_TIERS`, `type ChallengeTier` from `@/constants/challenges` (Task 2)
- Produces: nothing consumed by later tasks (this is the last task)

- [ ] **Step 1: Create `ChallengeCard`**

```tsx
// components/ChallengeCard.tsx
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "@/constants/theme";

type Props = {
  title: string;
  description: string;
  rewardCash: number;
  rewardRenown: number;
  isCompletedToday: boolean;
  onClaim: () => void;
};

export function ChallengeCard({
  title,
  description,
  rewardCash,
  rewardRenown,
  isCompletedToday,
  onClaim,
}: Props) {
  return (
    <View style={[styles.card, isCompletedToday && styles.cardComplete]}>
      <View style={styles.info}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
        <Text style={styles.reward}>
          +${rewardCash} · +{rewardRenown} Renown
        </Text>
      </View>

      <Pressable
        style={[styles.tickButton, isCompletedToday && styles.tickButtonDone]}
        disabled={isCompletedToday}
        onPress={onClaim}
      >
        <Ionicons
          name={isCompletedToday ? "checkmark-circle" : "ellipse-outline"}
          size={18}
          color={isCompletedToday ? colors.success : colors.textSecondary}
        />
        <Text style={[styles.tickButtonText, isCompletedToday && styles.tickButtonTextDone]}>
          {isCompletedToday ? "Done today" : "Tick ✓"}
        </Text>
      </Pressable>
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
  cardComplete: {
    borderColor: colors.success,
    backgroundColor: "rgba(52, 211, 153, 0.08)",
  },
  info: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  description: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.textSecondary,
  },
  reward: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.accentRenown,
    marginTop: 2,
  },
  tickButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceElevated,
  },
  tickButtonDone: {
    backgroundColor: "rgba(52, 211, 153, 0.16)",
  },
  tickButtonText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textSecondary,
  },
  tickButtonTextDone: {
    color: colors.success,
  },
});
```

- [ ] **Step 2: Update `app/tycoon.tsx` imports**

Replace line 31:

```ts
import { QUEST_CATALOG } from "@/constants/quests";
```

with:

```ts
import { CHALLENGE_CATALOG, CHALLENGE_TIERS, type ChallengeTier } from "@/constants/challenges";
import { ChallengeCard } from "@/components/ChallengeCard";
```

- [ ] **Step 3: Add a tier-tab label lookup and local tab state**

After the existing `SHOP_TABS` constant (after line 46), add:

```ts
const CHALLENGE_TIER_LABELS: Record<ChallengeTier, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  elite: "Elite",
};
```

Inside `TycoonScreen`, after the existing `const [activeShopTab, setActiveShopTab] = useState<ShopTabKey>("equipment");` line (line 80), add:

```ts
  const [activeChallengeTier, setActiveChallengeTier] = useState<ChallengeTier>("easy");
```

- [ ] **Step 4: Destructure the new context values**

In the `useUser()` destructure (lines 51-78), replace:

```ts
    completedQuestIds,
```

with:

```ts
    isChallengeCompletedToday,
    claimChallenge,
```

- [ ] **Step 5: Simplify `handlePurchaseResult` and add `handleClaimChallenge`**

Replace `handlePurchaseResult` (lines 101-114):

```ts
  function handlePurchaseResult(result: PurchaseResult) {
    if (!result.success) return;

    const lines: string[] = [];
    for (const quest of result.newlyCompleted) {
      lines.push(`🏆 ${quest.title} Complete! +$${quest.rewardCash} · +${quest.rewardRenown} Renown`);
    }
    if (result.gymLevelUp) {
      lines.push(`🌟 Gym Level Up! Now Level ${result.gymLevelUp.newGymLevel}`);
    }
    if (lines.length > 0) {
      Alert.alert("Nice!", lines.join("\n"));
    }
  }
```

with:

```ts
  function handlePurchaseResult(result: PurchaseResult) {
    // Nothing to report on a plain purchase now that quests are gone.
    void result;
  }

  function handleClaimChallenge(challengeId: string) {
    const result = claimChallenge(challengeId);
    if (!result.success) return;

    const lines = ["🎉 Challenge complete!"];
    if (result.gymLevelUp) {
      lines.push(`🌟 Gym Level Up! Now Level ${result.gymLevelUp.newGymLevel}`);
    }
    Alert.alert("Nice!", lines.join("\n"));
  }
```

- [ ] **Step 6: Replace the Challenges page section**

Replace the entire `{activePage === "challenges" && (...)}` block (lines 404-451):

```tsx
        {activePage === "challenges" && (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.section}>
              <Text style={typography.label}>REAL-LIFE CHALLENGES 💪</Text>

              <View style={styles.tabRow}>
                {CHALLENGE_TIERS.map((tier) => {
                  const isActive = tier === activeChallengeTier;
                  return (
                    <Pressable
                      key={tier}
                      onPress={() => setActiveChallengeTier(tier)}
                      style={[styles.tabPill, isActive && styles.tabPillActive]}
                    >
                      <Text style={[styles.tabPillText, isActive && styles.tabPillTextActive]}>
                        {CHALLENGE_TIER_LABELS[tier]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.itemList}>
                {CHALLENGE_CATALOG.filter((challenge) => challenge.tier === activeChallengeTier).map(
                  (challenge) => (
                    <ChallengeCard
                      key={challenge.id}
                      title={challenge.title}
                      description={challenge.description}
                      rewardCash={challenge.rewardCash}
                      rewardRenown={challenge.rewardRenown}
                      isCompletedToday={isChallengeCompletedToday(challenge.id)}
                      onClaim={() => handleClaimChallenge(challenge.id)}
                    />
                  )
                )}
              </View>
            </View>
          </ScrollView>
        )}
```

- [ ] **Step 7: Remove the now-unused quest styles**

In the `styles` `StyleSheet.create` block, delete the `questList`, `questCard`, `questCardComplete`, `questIconBadge`, `questInfo`, `questTitle`, `questDescription`, `questProgress`, `questReward`, `questRewardCash`, and `questRewardRenown` entries (the block currently running from `questList: { gap: spacing.sm },` through `questRewardRenown: { fontSize: 11, fontWeight: "600", color: colors.accentRenown },`, just before `cashCard: {`). Keep `tabRow`, `tabPill`, `tabPillActive`, `tabPillText`, `tabPillTextActive`, and `itemList` — they're reused by the new tier tabs and challenge list.

- [ ] **Step 8: Clean up `app/workout.tsx`**

Replace line 71:

```ts
  const { addXp, addCash, cashRewardMultiplier, globalMultiplier, checkQuests } = useUser();
```

with:

```ts
  const { addXp, addCash, cashRewardMultiplier, globalMultiplier } = useUser();
```

Replace lines 138-160:

```ts
    const exerciseNames = exercises.map((exercise) => exercise.name);
    const { newlyCompleted, gymLevelUp } = checkQuests(exerciseNames);

    const title = leveledUp ? "Level Up! 🎉" : "Workout Complete! 💪";
    const lines = [
      leveledUp ? `You reached Level ${newLevel}!` : `+${WORKOUT_XP_REWARD} XP`,
      `+$${finalCashAward} Cash`,
    ];
    if (bonusEarned) {
      lines.push(`🎯 Plan Completed! +${TARGET_BONUS_XP} XP bonus`);
    }
    if (cashRewardMultiplier > 1) {
      lines.push("⚡ Facility bonus applied");
    }
    if (globalMultiplier > 1) {
      lines.push("🏙️ Prestige/location bonus applied");
    }
    for (const quest of newlyCompleted) {
      lines.push(`🏆 Quest Complete: ${quest.title}! +$${quest.rewardCash} · +${quest.rewardRenown} Renown`);
    }
    if (gymLevelUp) {
      lines.push(`🌟 Gym Level Up! Now Level ${gymLevelUp.newGymLevel}`);
    }
```

with:

```ts
    const title = leveledUp ? "Level Up! 🎉" : "Workout Complete! 💪";
    const lines = [
      leveledUp ? `You reached Level ${newLevel}!` : `+${WORKOUT_XP_REWARD} XP`,
      `+$${finalCashAward} Cash`,
    ];
    if (bonusEarned) {
      lines.push(`🎯 Plan Completed! +${TARGET_BONUS_XP} XP bonus`);
    }
    if (cashRewardMultiplier > 1) {
      lines.push("⚡ Facility bonus applied");
    }
    if (globalMultiplier > 1) {
      lines.push("🏙️ Prestige/location bonus applied");
    }
```

- [ ] **Step 9: Full-repo typecheck**

Run: `npx tsc --noEmit` from `/home/liamcuthbert88/FlexQuest`
Expected: no output, exit code 0. If anything under `app/`, `components/`, or `contexts/` still references `quests`, `QUEST_CATALOG`, `checkQuests`, `completedQuestIds`, or `newlyCompleted`, fix it now — this is the task where the whole repo must compile clean again.

- [ ] **Step 10: Playwright smoke test**

Start the web dev server in the background if it isn't already running:

```bash
cd /home/liamcuthbert88/FlexQuest && npx expo start --web --port 8090 > /tmp/expo-web-challenges.log 2>&1 &
```

Wait for it to be ready (`curl -sf http://localhost:8090 > /dev/null`), then create `/tmp/claude-scratch-challenges-smoke.js`:

```js
const { chromium } = require('/home/liamcuthbert88/xeno-gains/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('dialog', async (dialog) => { await dialog.accept(); });

  await page.goto('http://localhost:8090', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(4000);
  await page.getByText('Go to My Gym').click();
  await page.waitForTimeout(2000);

  await page.getByText('Challenges', { exact: true }).click();
  await page.waitForTimeout(500);

  // Default tier is Easy — 3 cards should be visible.
  const easyCountBefore = await page.getByText('Push-Up Starter').count();
  console.assert(easyCountBefore === 1, 'expected Push-Up Starter card in Easy tab');

  // Tick the first challenge (button reads "Tick ✓" until claimed), confirm
  // the reward dialog fires and the button flips to "Done today".
  await page.getByText('Tick ✓', { exact: true }).first().click();
  await page.waitForTimeout(800);
  const doneCount = await page.getByText('Done today', { exact: true }).count();
  console.assert(doneCount === 1, 'expected exactly one card to flip to Done today after ticking');

  // Re-tapping the now-disabled button must not double-claim (no crash, no second dialog).
  await page.getByText('Done today', { exact: true }).first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(300);

  await page.getByText('Medium', { exact: true }).click();
  await page.waitForTimeout(300);
  const mediumCount = await page.getByText('Step It Up').count();
  console.assert(mediumCount === 1, 'expected Step It Up card in Medium tab');

  await page.getByText('Elite', { exact: true }).click();
  await page.waitForTimeout(300);
  const eliteCount = await page.getByText('Century Club').count();
  console.assert(eliteCount === 1, 'expected Century Club card in Elite tab');

  console.log('PAGE ERRORS:', JSON.stringify(errors));
  await page.screenshot({ path: '/tmp/challenges-page-smoke.png' });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
```

Run: `node /tmp/claude-scratch-challenges-smoke.js`
Expected: `PAGE ERRORS: []` and no `console.assert` failures printed above it. Read the resulting `/tmp/challenges-page-smoke.png` to visually confirm the tier tabs and challenge cards render as designed.

Delete the scratch script afterward. Stop the background `expo start --web` process (`kill` its PID — do not use `pkill -f` with a pattern that could match the invoking shell's own command line, per this repo's known gotcha).

- [ ] **Step 11: Commit**

```bash
git add components/ChallengeCard.tsx app/tycoon.tsx app/workout.tsx
git commit -m "Replace game-progress quests with real-life challenges UI"
```
