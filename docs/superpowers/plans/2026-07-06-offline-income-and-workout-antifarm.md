# Offline Income + Workout Anti-Farm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add capped offline/idle income with a welcome-back summary, and close the zero-effort workout-reward farming loop with a one-reward-per-day cap.

**Architecture:** A single `AppState` listener in `UserContext` flushes the debounced save and stamps a timestamp whenever the app backgrounds; on the next hydration that timestamp is diffed against `Date.now()`, clamped to 8 hours, and converted to cash at the just-restored `cashPerSecond` rate. A parallel `lastWorkoutRewardDate` field gates the workout screen's flat per-workout reward to once per local calendar day.

**Tech Stack:** React Native 0.86 / Expo SDK 57, Expo Router, TypeScript 6, `@react-native-async-storage/async-storage`. No test runner in this repo — verification is `npx tsc --noEmit` per task plus a final manual pass.

## Global Constraints

- Offline earnings cap: **8 hours** (28,800,000 ms) of elapsed time, whichever is less.
- Welcome-back earnings surface as an `Alert` on the tycoon screen (`Alert.alert` native / `window.alert` web), matching the existing `handleDevRiches` pattern in `app/tycoon.tsx`.
- Workout daily cap: **one rewarded workout per local calendar date** (`YYYY-MM-DD` from local `Date` accessors, not `toISOString()`/UTC). Repeat same-day finishes still complete the session normally but award **0 XP / $0**.
- No automated tests — this repo has zero test infrastructure (no Jest, no `*.test.ts` anywhere). Each task instead verifies with `npx tsc --noEmit` (must exit 0, no new errors); the final task runs the spec's manual scenarios.
- Every new field added to `PersistedUserStats` must also be added to `isValidPersistedStats` — an incomplete/invalid persisted blob must be rejected wholesale (existing pattern), not partially accepted.

---

### Task 1: `flush()` on the debounced saver

**Files:**
- Modify: `lib/storage.ts:28-38` (`createDebouncedSaver`)
- Modify: `contexts/RoutineContext.tsx:54` (call-site rename)
- Modify: `contexts/UserContext.tsx:160` (call-site rename; body call at line 213 updated in Task 3, left as-is here)

**Interfaces:**
- Produces: `createDebouncedSaver(key: string, delayMs: number): { debouncedSave: (value: unknown) => void; flush: () => void }` — was previously `(value: unknown) => void` directly. `flush()` is a no-op if no save is currently pending.

- [ ] **Step 1: Rewrite `createDebouncedSaver` in `lib/storage.ts`**

Replace the existing function (lines 25-38) with:

```ts
/** Builds a debounced saver for `key`: rapid calls (e.g. a burst of idle-cash
 * ticks or quick purchases) coalesce into a single write `delayMs` after the
 * last call, instead of hitting disk on every state change. `flush()` writes
 * immediately if a save is pending (e.g. on app backgrounding) — a no-op
 * otherwise. */
export function createDebouncedSaver(key: string, delayMs: number) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let pendingValue: unknown;

  function debouncedSave(value: unknown) {
    pendingValue = value;
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timeoutId = null;
      saveJSON(key, pendingValue);
    }, delayMs);
  }

  function flush() {
    if (timeoutId === null) return;
    clearTimeout(timeoutId);
    timeoutId = null;
    saveJSON(key, pendingValue);
  }

  return { debouncedSave, flush };
}
```

- [ ] **Step 2: Update the call site in `contexts/RoutineContext.tsx`**

Change line 54 from:

```ts
  const debouncedSave = useRef(createDebouncedSaver(STORAGE_KEY, SAVE_DEBOUNCE_MS)).current;
```

to:

```ts
  const saver = useRef(createDebouncedSaver(STORAGE_KEY, SAVE_DEBOUNCE_MS)).current;
```

Then update the effect at lines 72-75 from:

```ts
  useEffect(() => {
    if (!isHydrated) return;
    debouncedSave(routine);
  }, [routine, isHydrated, debouncedSave]);
```

to:

```ts
  useEffect(() => {
    if (!isHydrated) return;
    saver.debouncedSave(routine);
  }, [routine, isHydrated, saver]);
```

- [ ] **Step 3: Update the call-site declaration in `contexts/UserContext.tsx`**

Change line 160 from:

```ts
  const debouncedSave = useRef(createDebouncedSaver(STORAGE_KEY, SAVE_DEBOUNCE_MS)).current;
```

to:

```ts
  const saver = useRef(createDebouncedSaver(STORAGE_KEY, SAVE_DEBOUNCE_MS)).current;
```

Leave the persist effect (lines 193-233, which calls `debouncedSave(stats)` and lists `debouncedSave` as a dependency) referencing the old name for now — Task 3 rewrites that effect's body and dependency array together with the new `AppState` listener, to keep this task's diff focused on the storage-layer change alone.

Since `saver` isn't yet used anywhere in `UserContext.tsx` after this rename (the old effect still says `debouncedSave`), this task will **not** typecheck cleanly on its own — that's expected and fixed in Task 3. Skip the typecheck-must-pass gate for this task; instead just confirm the diff is exactly the rename shown above (no other changes).

- [ ] **Step 4: Commit**

```bash
cd ~/FlexQuest && git add lib/storage.ts contexts/RoutineContext.tsx contexts/UserContext.tsx
git commit -m "$(cat <<'EOF'
refactor: add flush() to debounced saver

Lets a caller force an immediate write when a save is pending, instead of
waiting out the debounce delay — needed for flushing state right before the
app backgrounds.
EOF
)"
```

---

### Task 2: Persist `lastActiveTimestamp` and `lastWorkoutRewardDate`

**Files:**
- Modify: `contexts/UserContext.tsx` (`PersistedUserStats` type, `isValidPersistedStats`, `useState` declarations, hydration block, persist effect, context value/type, new `recordWorkoutReward` action)

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces: `useUser()` gains `lastWorkoutRewardDate: string` and `recordWorkoutReward(date: string): void` on the returned context value (both used by Task 7). `lastActiveTimestamp` is tracked internally only in this task — Task 3 reads/writes it via `AppState`, so no context-value export.

- [ ] **Step 1: Extend `PersistedUserStats` (after line 63, `equipmentCustomizations`)**

In the type at lines 47-64, add two fields at the end:

```ts
  equipmentCustomizations: Record<string, EquipmentCustomization>;
  lastActiveTimestamp: number;
  lastWorkoutRewardDate: string;
};
```

- [ ] **Step 2: Extend `isValidPersistedStats` (lines 66-89)**

Add two checks before the closing `);`:

```ts
    stats.equipmentCustomizations !== null &&
    typeof stats.lastActiveTimestamp === "number" &&
    typeof stats.lastWorkoutRewardDate === "string"
  );
}
```

- [ ] **Step 3: Add `useState` declarations (after line 158, `equipmentCustomizations` state)**

```ts
  const [equipmentCustomizations, setEquipmentCustomizations] = useState<
    Record<string, EquipmentCustomization>
  >({});
  const [lastActiveTimestamp, setLastActiveTimestamp] = useState(0);
  const [lastWorkoutRewardDate, setLastWorkoutRewardDate] = useState("");
```

- [ ] **Step 4: Restore both fields on hydration (inside the `loadJSON(...).then(...)` block, lines 165-186)**

Add after `setEquipmentCustomizations(stored.equipmentCustomizations);` (line 183), still inside the `if (stored && isValidPersistedStats(stored))` block:

```ts
        setEquipmentCustomizations(stored.equipmentCustomizations);
        setLastActiveTimestamp(stored.lastActiveTimestamp);
        setLastWorkoutRewardDate(stored.lastWorkoutRewardDate);
```

- [ ] **Step 5: Include both fields in the persisted stats object (lines 195-212)**

Add after `equipmentCustomizations,` (line 211):

```ts
      equipmentCustomizations,
      lastActiveTimestamp,
      lastWorkoutRewardDate,
    };
```

Also add `lastActiveTimestamp` and `lastWorkoutRewardDate` to that effect's dependency array (lines 214-233), immediately before `isHydrated`:

```ts
    equipmentCustomizations,
    lastActiveTimestamp,
    lastWorkoutRewardDate,
    isHydrated,
    debouncedSave,
  ]);
```

(The `debouncedSave` entry here still refers to the old name — Task 3 replaces it with `saver`/`saver.debouncedSave` when it rewrites this effect. Leave it as-is in this task.)

- [ ] **Step 6: Add the `recordWorkoutReward` action (after `hireStaff`, before `prestigeReset`, i.e. after line 561)**

```ts
  function recordWorkoutReward(date: string): void {
    setLastWorkoutRewardDate(date);
  }
```

- [ ] **Step 7: Expose `lastWorkoutRewardDate` and `recordWorkoutReward` on the context**

In `UserContextValue` (after `moveEquipment` at line 135):

```ts
  moveEquipment: (equipmentId: string, row: number, col: number) => boolean;
  lastWorkoutRewardDate: string;
  recordWorkoutReward: (date: string) => void;
};
```

In the `value` object's `useMemo` (after `moveEquipment,` around line 638):

```ts
      moveEquipment,
      lastWorkoutRewardDate,
      recordWorkoutReward,
    }),
```

Add `lastWorkoutRewardDate` to that `useMemo`'s dependency array (around line 660, after `equipmentCustomizations,`):

```ts
      equipmentCustomizations,
      lastWorkoutRewardDate,
    ]
  );
```

(`recordWorkoutReward` itself isn't added to the dependency array — it's a stable function reference each render just like `addXp`/`addCash`/etc., none of which are listed either, matching existing convention in this file.)

- [ ] **Step 8: Typecheck**

Run: `cd ~/FlexQuest && npx tsc --noEmit`
Expected: exits 0, no errors. (This task's changes are self-contained — unlike Task 1, this one should typecheck cleanly on its own.)

- [ ] **Step 9: Commit**

```bash
cd ~/FlexQuest && git add contexts/UserContext.tsx
git commit -m "$(cat <<'EOF'
feat: persist lastActiveTimestamp and lastWorkoutRewardDate

Plumbing only — no behavior change yet. Lays the storage groundwork for
offline-income calc and the workout daily-reward cap.
EOF
)"
```

---

### Task 3: `AppState`-triggered flush and timestamp stamp

**Files:**
- Modify: `contexts/UserContext.tsx` (imports, the persist effect from Task 2, new `AppState` effect)

**Interfaces:**
- Consumes: `saver` (from Task 1), `setLastActiveTimestamp` (from Task 2).
- Produces: nothing new exported — internal wiring only.

- [ ] **Step 1: Import `AppState`**

Change the top of `contexts/UserContext.tsx` — there's no existing `react-native` import in this file, so add one. After the last `import` line (line 25, `import { createDebouncedSaver, loadJSON } from "@/lib/storage";`):

```ts
import { createDebouncedSaver, loadJSON } from "@/lib/storage";
import { AppState } from "react-native";
```

- [ ] **Step 2: Finish the `saver` rename left pending from Task 1**

In the persist effect (originally lines 193-233, now shifted slightly by Task 2's additions — locate by the `if (!isHydrated) return;` line inside the effect that builds `stats`), change:

```ts
    debouncedSave(stats);
  }, [
    level,
    xp,
    cash,
    purchasedEquipmentIds,
    purchasedUpgradeIds,
    hiredManagerIds,
    renownPoints,
    gymLevel,
    completedQuestIds,
    prestigeCount,
    currentLocationId,
    lifetimeCashEarned,
    unlockedZones,
    equipmentLevels,
    hiredStaffIds,
    equipmentCustomizations,
    lastActiveTimestamp,
    lastWorkoutRewardDate,
    isHydrated,
    debouncedSave,
  ]);
```

to:

```ts
    saver.debouncedSave(stats);
  }, [
    level,
    xp,
    cash,
    purchasedEquipmentIds,
    purchasedUpgradeIds,
    hiredManagerIds,
    renownPoints,
    gymLevel,
    completedQuestIds,
    prestigeCount,
    currentLocationId,
    lifetimeCashEarned,
    unlockedZones,
    equipmentLevels,
    hiredStaffIds,
    equipmentCustomizations,
    lastActiveTimestamp,
    lastWorkoutRewardDate,
    isHydrated,
    saver,
  ]);
```

Only the call itself (`debouncedSave(stats)` → `saver.debouncedSave(stats)`) and the final dependency entry (`debouncedSave` → `saver`) change — every other line in both the `stats` object above it and this dependency array is unchanged from what Task 2 left in place.

- [ ] **Step 3: Add the `AppState` effect**

Add immediately after that persist effect:

```ts
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "background" || nextState === "inactive") {
        saver.flush();
        setLastActiveTimestamp(Date.now());
      }
    });
    return () => subscription.remove();
  }, [saver]);
```

- [ ] **Step 4: Typecheck**

Run: `cd ~/FlexQuest && npx tsc --noEmit`
Expected: exits 0, no errors.

- [ ] **Step 5: Manual smoke check**

Run: `cd ~/FlexQuest && npx expo start` (LAN or tunnel, whichever is reachable — not required to be tunnel mode for this check), open on a device/simulator, background the app (home button), then check the AsyncStorage write happened immediately rather than up to 1.5s later. Simplest verification: make a purchase, immediately background the app within 200ms, reopen — the purchase should have persisted (it would already pass without this change most of the time given the short debounce, so this is a light sanity check, not a rigorous test of the fix — Task 8's manual pass covers the behavior more directly via the offline-earnings scenario, which depends on this flush firing reliably).

- [ ] **Step 6: Commit**

```bash
cd ~/FlexQuest && git add contexts/UserContext.tsx
git commit -m "$(cat <<'EOF'
feat: flush pending save and stamp lastActiveTimestamp on backgrounding

One AppState listener serves both offline-income timing and save-loss
prevention: flushing immediately (instead of waiting out the 1.5s debounce)
means an OS-kill right after backgrounding no longer loses the last change.
EOF
)"
```

---

### Task 4: Offline-earnings calculation on hydration

**Files:**
- Modify: `contexts/UserContext.tsx` (hydration block, new state, new context value)

**Interfaces:**
- Consumes: `stored.lastActiveTimestamp` (Task 2), `creditCash` (existing internal helper), the `rawCashPerSecond`/`globalMultiplier` computation (existing memos, defined *after* the hydration effect in the file — see Step 2 note on ordering).
- Produces: `useUser()` gains `pendingOfflineEarnings: number | null` and `clearPendingOfflineEarnings(): void` (consumed by Task 6 in `app/tycoon.tsx`).

- [ ] **Step 1: Add `pendingOfflineEarnings` state**

After the `lastWorkoutRewardDate` state added in Task 2:

```ts
  const [lastWorkoutRewardDate, setLastWorkoutRewardDate] = useState("");
  const [pendingOfflineEarnings, setPendingOfflineEarnings] = useState<number | null>(null);
```

- [ ] **Step 2: Compute offline earnings at the end of the hydration callback**

This is the trickiest wiring point in the plan: `rawCashPerSecond` and `globalMultiplier` are `useMemo`s defined later in the component (after the hydration `useEffect`), so they aren't in scope inside the hydration callback. Rather than duplicating the equipment/staff income formula, compute the rate **inline from the just-restored `stored` values directly** — the hydration callback already has every field `rawCashPerSecond` would need, right there in `stored`.

Add this block at the end of the `if (stored && isValidPersistedStats(stored))` branch, after `setLastWorkoutRewardDate(stored.lastWorkoutRewardDate);` (from Task 2 Step 4) and before the branch closes:

```ts
        setLastActiveTimestamp(stored.lastActiveTimestamp);
        setLastWorkoutRewardDate(stored.lastWorkoutRewardDate);

        if (stored.lastActiveTimestamp > 0) {
          const restoredLocation = getLocation(stored.currentLocationId);
          const restoredGlobalMultiplier =
            (1 + stored.prestigeCount * 0.5) * restoredLocation.multiplier;

          const hasIronVaultTrainer = stored.hiredStaffIds.includes("coach_sarah");
          const staffEquipmentBonusMultiplier =
            1 +
            (stored.hiredStaffIds.includes("tech_alex") ? EQUIPMENT_TECHNICIAN_BONUS : 0) +
            (stored.hiredStaffIds.includes("trainer_mike") ? HEAD_TRAINER_EQUIPMENT_BONUS : 0);

          const restoredEquipmentIncome = EQUIPMENT_CATALOG.filter((item) =>
            stored.purchasedEquipmentIds.includes(item.id)
          ).reduce((total, item) => {
            const base = item.cashPerSecond * (stored.equipmentLevels[item.id] ?? 1);
            const ironVaultBonus =
              item.zoneId === "iron_vault" && hasIronVaultTrainer ? TRAINER_IRON_VAULT_MULTIPLIER : 1;
            return total + base * ironVaultBonus * staffEquipmentBonusMultiplier;
          }, 0);

          const restoredManagerIncome = MANAGER_CATALOG.filter((manager) =>
            stored.hiredManagerIds.includes(manager.id)
          ).reduce((total, manager) => total + manager.cashPerSecond, 0);

          const restoredCashPerSecond =
            (restoredEquipmentIncome + restoredManagerIncome) * restoredGlobalMultiplier;

          const elapsedMs = Math.min(
            Math.max(Date.now() - stored.lastActiveTimestamp, 0),
            8 * 60 * 60 * 1000
          );
          const offlineEarnings = Math.round((elapsedMs / 1000) * restoredCashPerSecond);

          if (offlineEarnings > 0) {
            setCash((prev) => prev + offlineEarnings);
            setLifetimeCashEarned((prev) => prev + offlineEarnings);
            setPendingOfflineEarnings(offlineEarnings);
          }
        }
```

Use `setCash`/`setLifetimeCashEarned` directly here (not the `creditCash` helper) — `creditCash` is defined later in the component body and, more importantly, closes over the `cash`/`lifetimeCashEarned` values from the render that defined it, not the ones this hydration callback should be crediting against; the direct functional-updater form (`prev => prev + x`) sidesteps that entirely and matches how `creditCash` itself is implemented.

Note this duplicates the income formula from the `rawCashPerSecond` memo (lines ~342-364) by design — the alternative (restructuring the component so the memo runs before hydration) would entangle unrelated state ordering just to avoid ~15 lines of duplication. If `rawCashPerSecond`'s formula changes in the future, this block needs the same update; there's no way around that duplication without a larger refactor that's out of scope here.

- [ ] **Step 3: Add `clearPendingOfflineEarnings` action**

Alongside `recordWorkoutReward` (added in Task 2 Step 6):

```ts
  function recordWorkoutReward(date: string): void {
    setLastWorkoutRewardDate(date);
  }

  function clearPendingOfflineEarnings(): void {
    setPendingOfflineEarnings(null);
  }
```

- [ ] **Step 4: Expose both on the context**

In `UserContextValue`, alongside the `lastWorkoutRewardDate`/`recordWorkoutReward` entries added in Task 2 Step 7:

```ts
  lastWorkoutRewardDate: string;
  recordWorkoutReward: (date: string) => void;
  pendingOfflineEarnings: number | null;
  clearPendingOfflineEarnings: () => void;
};
```

In the `value` `useMemo` object, alongside `lastWorkoutRewardDate, recordWorkoutReward,`:

```ts
      lastWorkoutRewardDate,
      recordWorkoutReward,
      pendingOfflineEarnings,
      clearPendingOfflineEarnings,
    }),
```

Add `pendingOfflineEarnings` to that `useMemo`'s dependency array (next to `lastWorkoutRewardDate,`):

```ts
      lastWorkoutRewardDate,
      pendingOfflineEarnings,
    ]
  );
```

- [ ] **Step 5: Typecheck**

Run: `cd ~/FlexQuest && npx tsc --noEmit`
Expected: exits 0, no errors.

- [ ] **Step 6: Commit**

```bash
cd ~/FlexQuest && git add contexts/UserContext.tsx
git commit -m "$(cat <<'EOF'
feat: calculate capped offline earnings on hydration

Elapsed time since the app last backgrounded (capped at 8 hours) is
converted to cash at the restored gym's rate and staged as
pendingOfflineEarnings for the tycoon screen to announce.
EOF
)"
```

---

### Task 5: `getTodayDateString()` helper

**Files:**
- Modify: `constants/week.ts`
- Test: none (pure function, manually spot-checked — repo has no test runner)

**Interfaces:**
- Produces: `getTodayDateString(): string` — local calendar date as `"YYYY-MM-DD"`, using local `Date` accessors (not UTC), for use by Task 7's daily-reward-cap check.

- [ ] **Step 1: Add the function to `constants/week.ts`**

Append after `getTodayKey` (end of file, after line 44):

```ts
export function getTodayKey(): DayKey {
  return getDayKeyForDate(new Date());
}

/** Local calendar date as "YYYY-MM-DD" — deliberately not `toISOString()`
 * (which is UTC), so the day boundary matches the player's actual midnight
 * rather than GMT's. Used to gate the once-per-day workout reward. */
export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd ~/FlexQuest && npx tsc --noEmit`
Expected: exits 0, no errors.

- [ ] **Step 3: Manual spot-check**

Run: `cd ~/FlexQuest && node -e "const d = new Date(); console.log(d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'))"`
Expected: prints today's local date in `YYYY-MM-DD` form — confirms the format matches what the function will produce (this is the same expression, run standalone since the function itself isn't importable outside the RN/Metro module graph via plain `node`).

- [ ] **Step 4: Commit**

```bash
cd ~/FlexQuest && git add constants/week.ts
git commit -m "feat: add getTodayDateString for local-calendar-day comparisons"
```

---

### Task 6: Welcome-back modal in `app/tycoon.tsx`

**Files:**
- Modify: `app/tycoon.tsx` (imports, destructured context values, new effect)

**Interfaces:**
- Consumes: `pendingOfflineEarnings: number | null`, `clearPendingOfflineEarnings(): void` (both from Task 4).

- [ ] **Step 1: Import `useEffect`**

Change line 1 from:

```ts
import { useState } from "react";
```

to:

```ts
import { useEffect, useState } from "react";
```

- [ ] **Step 2: Destructure the new context values**

In the `useUser()` destructure (lines 52-78), add after `rotateEquipment,`:

```ts
    setEquipmentColor,
    rotateEquipment,
    pendingOfflineEarnings,
    clearPendingOfflineEarnings,
  } = useUser();
```

- [ ] **Step 3: Add the welcome-back effect**

Add immediately after the `handleDevRiches` function (after line 141, matching its existing `Platform.OS === "web"` branching style):

```ts
  useEffect(() => {
    if (pendingOfflineEarnings == null) return;
    const message = `+$${pendingOfflineEarnings} earned while you were away.`;
    if (Platform.OS === "web") {
      if (typeof window !== "undefined") window.alert(message);
    } else {
      Alert.alert("Welcome Back!", message);
    }
    clearPendingOfflineEarnings();
  }, [pendingOfflineEarnings, clearPendingOfflineEarnings]);
```

- [ ] **Step 4: Typecheck**

Run: `cd ~/FlexQuest && npx tsc --noEmit`
Expected: exits 0, no errors.

- [ ] **Step 5: Commit**

```bash
cd ~/FlexQuest && git add app/tycoon.tsx
git commit -m "feat: show welcome-back alert for pending offline earnings"
```

---

### Task 7: Daily reward cap in `app/workout.tsx`

**Files:**
- Modify: `app/workout.tsx` (`useUser()` destructure, `handleFinishWorkout`)

**Interfaces:**
- Consumes: `lastWorkoutRewardDate: string`, `recordWorkoutReward(date: string): void` (both from Task 2), `getTodayDateString()` (Task 5).

- [ ] **Step 1: Import `getTodayDateString`**

Change line 17 from:

```ts
import { getTodayKey } from "@/constants/week";
```

to:

```ts
import { getTodayDateString, getTodayKey } from "@/constants/week";
```

- [ ] **Step 2: Destructure the new context values**

Change line 71 from:

```ts
  const { addXp, addCash, cashRewardMultiplier, globalMultiplier, checkQuests } = useUser();
```

to:

```ts
  const {
    addXp,
    addCash,
    cashRewardMultiplier,
    globalMultiplier,
    checkQuests,
    lastWorkoutRewardDate,
    recordWorkoutReward,
  } = useUser();
```

- [ ] **Step 3: Gate the reward in `handleFinishWorkout` (lines 118-169)**

Replace the whole function body with:

```ts
  function handleFinishWorkout() {
    const today = getTodayDateString();
    const alreadyRewarded = lastWorkoutRewardDate === today;

    const totalTargetSets = todayRoutine.exercises.reduce(
      (total, exercise) => total + exercise.targetSets,
      0
    );
    const totalCompletedSets = exercises.reduce(
      (total, exercise) => total + exercise.sets.filter((set) => set.reps.trim().length > 0).length,
      0
    );
    const bonusEarned = totalTargetSets > 0 && totalCompletedSets >= totalTargetSets;

    const xpAward = WORKOUT_XP_REWARD + (bonusEarned ? TARGET_BONUS_XP : 0);
    const cashAwardBeforeMultiplier = WORKOUT_CASH_REWARD + (bonusEarned ? TARGET_BONUS_CASH : 0);
    const finalCashAward = Math.round(
      cashAwardBeforeMultiplier * cashRewardMultiplier * globalMultiplier
    );

    const xpToAward = alreadyRewarded ? 0 : xpAward;
    const cashToAward = alreadyRewarded ? 0 : finalCashAward;

    const { leveledUp, newLevel } = addXp(xpToAward);
    addCash(cashToAward);
    if (!alreadyRewarded) recordWorkoutReward(today);

    const exerciseNames = exercises.map((exercise) => exercise.name);
    const { newlyCompleted, gymLevelUp } = checkQuests(exerciseNames);

    const title = leveledUp ? "Level Up! 🎉" : "Workout Complete! 💪";
    const lines = alreadyRewarded
      ? ["Already logged today — no reward."]
      : [
          leveledUp ? `You reached Level ${newLevel}!` : `+${WORKOUT_XP_REWARD} XP`,
          `+$${finalCashAward} Cash`,
        ];
    if (!alreadyRewarded && bonusEarned) {
      lines.push(`🎯 Plan Completed! +${TARGET_BONUS_XP} XP bonus`);
    }
    if (!alreadyRewarded && cashRewardMultiplier > 1) {
      lines.push("⚡ Facility bonus applied");
    }
    if (!alreadyRewarded && globalMultiplier > 1) {
      lines.push("🏙️ Prestige/location bonus applied");
    }
    for (const quest of newlyCompleted) {
      lines.push(`🏆 Quest Complete: ${quest.title}! +$${quest.rewardCash} · +${quest.rewardRenown} Renown`);
    }
    if (gymLevelUp) {
      lines.push(`🌟 Gym Level Up! Now Level ${gymLevelUp.newGymLevel}`);
    }

    if (Platform.OS === "web") {
      // react-native-web's Alert.alert is a no-op, so the OK button's
      // onPress (where navigation lives) would never fire on web.
      router.back();
    } else {
      Alert.alert(title, lines.join("\n"), [{ text: "OK", onPress: () => router.back() }]);
    }
  }
```

Notes on the diff from the original:
- `bonusEarned`, quest completion (`checkQuests`), and gym-level-up all still evaluate normally even when `alreadyRewarded` — quests are separately guarded by `completedQuestIds` (one-time each, unaffected by this cap) and it'd be confusing for a quest to silently fail to complete just because the flat workout reward was already claimed today.
- `title` still says "Workout Complete! 💪" (or "Level Up!" — impossible when `alreadyRewarded`, since `addXp(0)` never levels up) even on a zero-reward repeat — the session still "completed" per the confirmed UX call, just without payout.

- [ ] **Step 4: Typecheck**

Run: `cd ~/FlexQuest && npx tsc --noEmit`
Expected: exits 0, no errors.

- [ ] **Step 5: Commit**

```bash
cd ~/FlexQuest && git add app/workout.tsx
git commit -m "$(cat <<'EOF'
fix: cap workout rewards to once per calendar day

Closes the zero-effort farm loop where repeatedly entering/finishing the
workout screen granted unlimited free XP/cash regardless of input.
EOF
)"
```

---

### Task 8: Manual verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full-project typecheck**

Run: `cd ~/FlexQuest && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 2: Start the app**

Run: `cd ~/FlexQuest && npx expo start` (LAN mode is fine — tunnel mode isn't required for local device testing on the same network)
Expected: Metro starts, QR/URL shown, app loads on device/simulator without crashing.

- [ ] **Step 3: Verify offline income (short interval)**

Force-quit the app, wait ~30 seconds, relaunch.
Expected: a "Welcome Back!" alert shows roughly `30 * cashPerSecond` (check the tycoon screen's displayed cash-per-second rate beforehand to compute the expected range), and the displayed cash balance reflects the credit.

- [ ] **Step 4: Verify the 8-hour cap**

With the app closed, find the AsyncStorage debug value (e.g. via a temporary `console.log(await AsyncStorage.getItem("@flexquest/user"))` dropped into `app/_layout.tsx` momentarily, or React Native DevTools' AsyncStorage inspector if available) and manually edit `lastActiveTimestamp` to `Date.now() - 10 * 60 * 60 * 1000` (10 hours ago). Relaunch.
Expected: credited amount matches 8 hours of income, not 10 — i.e. `Math.round(8 * 60 * 60 * cashPerSecond)`, not the 10-hour figure. Remove any temporary debug `console.log` afterward.

- [ ] **Step 5: Verify the workout daily cap**

Start a workout, tap Finish Workout. Immediately start another workout (same day) and tap Finish Workout again.
Expected: first finish shows normal XP/cash reward; second finish shows "Already logged today — no reward." and the cash/XP displayed on the tycoon screen doesn't increase from that second finish.

- [ ] **Step 6: Verify the daily cap resets the next day**

With a `lastWorkoutRewardDate` already set to today (from Step 5), change the device/simulator's system date forward by one day, then finish a workout.
Expected: full reward granted normally (not "Already logged today").

- [ ] **Step 7: Verify fresh-install has no false welcome-back**

Clear the app's storage (uninstall/reinstall, or clear AsyncStorage via dev menu) and launch fresh.
Expected: no "Welcome Back!" alert appears (since `lastActiveTimestamp` starts at `0`).

- [ ] **Step 8: Report results**

No commit for this task — it's verification only. If any expected behavior doesn't match, note which step failed and return to the relevant task above to fix before considering the plan complete.
