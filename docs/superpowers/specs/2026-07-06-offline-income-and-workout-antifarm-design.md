# Offline Income + Workout Anti-Farm Design

## Context

Audit of FlexQuest surfaced two gameplay-integrity gaps:

1. **No offline/idle income.** `cashPerSecond` only accrues via a foreground `setInterval` in `contexts/UserContext.tsx`. Closing the app stops all income — there's no elapsed-time calc or "welcome back" credit on relaunch, which is a standard expectation for the tycoon genre this game is part of.
2. **Workout reward farming.** `handleFinishWorkout` (`app/workout.tsx`) grants full XP/cash unconditionally — no daily cap, no minimum input required. A player can repeatedly enter/exit the workout screen and tap Finish for unlimited free currency with zero real exercise logged, undermining the app's core premise (real exercise → in-game progress).

Game is fully local/offline (AsyncStorage only, no backend, no accounts) and not close to a store launch — still building the core loop. Both fixes are scoped to stay local-only; no backend/sync work included.

## Decisions (confirmed via user Q&A)

- Offline earnings **cap at 8 hours** of elapsed time.
- Welcome-back earnings surface via a **modal on the tycoon screen**, consistent with the existing `Alert`-based pattern already used for purchases/quests.
- Workout anti-farm uses a **daily cap: one rewarded workout per calendar day**. No minimum-effort/sets-filled gate — daily cap alone is sufficient per product call.
- Repeat Finish-Workout taps same day: **session still completes normally, reward is $0/+0 XP**, alert copy says "Already logged today — no reward." Button stays enabled/unchanged; no new disabled UI state.
- **No automated tests added** — repo has zero test infrastructure today (no Jest, no `*.test.ts` files anywhere); staying manual-only is consistent with existing convention. Revisit if the project adds a test runner later.

## Architecture

### Persisted state additions (`contexts/UserContext.tsx` → `PersistedUserStats`)

```ts
lastActiveTimestamp: number;   // epoch ms; stamped whenever the app backgrounds. 0 = never (fresh install)
lastWorkoutRewardDate: string; // "YYYY-MM-DD" local date of last rewarded workout; "" = never
```

Both fall back through the existing `useState` default-initializer pattern already used for every other persisted field — no special-case handling needed for corrupt/missing saves (`isValidPersistedStats` gains two checks; a stats blob missing either field is treated as invalid, same as today).

### `lib/storage.ts` — `flush()` on the debounced saver

`createDebouncedSaver(key, delayMs)` currently returns a single `debouncedSave` function. It gains a sibling `flush()`:

```ts
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
    if (timeoutId === null) return; // nothing pending — no-op
    clearTimeout(timeoutId);
    timeoutId = null;
    saveJSON(key, pendingValue);
  }

  return { debouncedSave, flush };
}
```

Callers (`UserContext.tsx`, `RoutineContext.tsx`) destructure `{ debouncedSave, flush }` instead of using the returned function directly. `RoutineContext.tsx` doesn't need `flush` today but gets it "for free" — not wired up there, since only `UserContext` has the background-flush requirement in scope.

### `contexts/UserContext.tsx` — `AppState` listener

**Correction (post-implementation, from final whole-branch review):** the ordering below was wrong in the original design — `flush()` persists whatever the saver's `pendingValue` already is, so calling it *before* the timestamp state update propagates just re-saves the *old* timestamp; the fresh one would only reach disk if the debounce timer happened to fire during the OS's post-background window, which is exactly what `flush()` was meant to make unnecessary. The shipped fix instead builds the fresh stats object (with the new timestamp already baked in) and hands it to `debouncedSave` immediately before calling `flush()`, so the synchronous write actually contains the fresh value:

```ts
const latestStatsRef = useRef<PersistedUserStats>(buildPersistedStats());
latestStatsRef.current = buildPersistedStats(); // refreshed every render

useEffect(() => {
  const sub = AppState.addEventListener("change", (nextState) => {
    if (nextState === "background" || nextState === "inactive") {
      const now = Date.now();
      saver.debouncedSave({ ...latestStatsRef.current, lastActiveTimestamp: now });
      saver.flush();
      setLastActiveTimestamp(now);
    }
  });
  return () => sub.remove();
}, [saver]);
```

`buildPersistedStats()` is a small helper (shared with the persist effect) that returns the current `PersistedUserStats` shape from render state — see `contexts/UserContext.tsx` for the exact field list. Using a ref instead of listing every piece of state in the effect's dependency array avoids re-subscribing the listener on every ~1s cash tick.

On hydration (inside the existing `loadJSON(...).then(...)` block, after all fields are set from `stored`):

```ts
if (stored.lastActiveTimestamp > 0) {
  const elapsedMs = Math.min(
    Math.max(Date.now() - stored.lastActiveTimestamp, 0),
    8 * 60 * 60 * 1000
  );
  const offlineEarnings = Math.round((elapsedMs / 1000) * computedCashPerSecond);
  if (offlineEarnings > 0) {
    creditCash(offlineEarnings);
    setPendingOfflineEarnings(offlineEarnings);
  }
}
setLastActiveTimestamp(Date.now());
```

`computedCashPerSecond` here is derived the same way the existing `rawCashPerSecond`/`cashPerSecond` memos are — from the just-restored `purchasedEquipmentIds`/`hiredStaffIds`/`hiredManagerIds`/`equipmentLevels`/`globalMultiplier`. Since those values are set earlier in the same hydration callback (before this block runs), the calc reflects the player's current gym, not whatever it was when they closed the app. No separate snapshot of the rate at close-time is stored or needed.

New context value: `pendingOfflineEarnings: number | null` and `clearPendingOfflineEarnings(): void` (sets it back to `null`).

### `app/tycoon.tsx` — welcome-back modal

```ts
useEffect(() => {
  if (pendingOfflineEarnings == null) return;
  const message = `Welcome back! +$${pendingOfflineEarnings} earned while you were away.`;
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.alert(message);
  } else {
    Alert.alert("Welcome Back!", message);
  }
  clearPendingOfflineEarnings();
}, [pendingOfflineEarnings]);
```

Follows the existing `Platform.OS === "web"` branching already used elsewhere in this codebase (`app/workout.tsx`'s finish-workout alert, `handleDevRiches`).

### `constants/week.ts` — local calendar-date helper

```ts
export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
```

Deliberately uses local `Date` accessors, not `toISOString()` (which is UTC) — so the day boundary matches the player's actual midnight rather than GMT's, avoiding the reward re-arming or staying blocked several hours off from the player's real day.

### `app/workout.tsx` — daily reward cap

```ts
const { addXp, addCash, cashRewardMultiplier, globalMultiplier, checkQuests,
        lastWorkoutRewardDate, recordWorkoutReward } = useUser();

function handleFinishWorkout() {
  const today = getTodayDateString();
  const alreadyRewarded = lastWorkoutRewardDate === today;

  // ... existing bonusEarned / xpAward / cashAwardBeforeMultiplier calc ...

  const xpToAward = alreadyRewarded ? 0 : xpAward;
  const cashToAward = alreadyRewarded ? 0 : finalCashAward;

  const { leveledUp, newLevel } = addXp(xpToAward);
  addCash(cashToAward);
  if (!alreadyRewarded) recordWorkoutReward(today);

  // ... quest check unaffected — quests still evaluate off logged exercise names ...

  const lines = alreadyRewarded
    ? ["Already logged today — no reward."]
    : [/* existing leveledUp / cash / bonus lines, using xpToAward/cashToAward */];
  // ...
}
```

`checkQuests` still runs on every finish (quest completion isn't part of the farm exploit — quests are one-time-per-quest by `completedQuestIds`, already guarded). Only the flat per-workout XP/cash grant is gated.

`UserContext` exposes `recordWorkoutReward(date: string): void` (sets `lastWorkoutRewardDate`) — an action-style name matching the existing convention of exposing named actions (`addXp`, `addCash`, `buyEquipment`) rather than raw setters.

## Error Handling

- **Double `AppState` fire**: RN sometimes fires `background`→`inactive` in quick succession. `flush()` is a no-op if `timeoutId` is already `null` (nothing pending), so double-firing is harmless.
- **Fresh install**: `lastActiveTimestamp` starts at `0` via the existing `useState` default; hydration block's `stored.lastActiveTimestamp > 0` guard skips offline-calc entirely — no false "+$0 welcome back" on first launch.
- **Clock skew** (system time set backwards): `elapsedMs` clamped to `[0, cap]` — never goes negative, never grants negative cash.
- **Corrupt/partial save**: `isValidPersistedStats` extended to require both new fields; if either is absent/wrong-typed, the whole blob is rejected same as today (all fields fall back to `useState` defaults, including `lastActiveTimestamp: 0` and `lastWorkoutRewardDate: ""`).
- **UTC/local date mismatch**: addressed by `getTodayDateString()` using local accessors, not `toISOString()`.

## Testing

Manual verification only (no test runner in repo today):

1. Force-quit app, wait ~30s, relaunch → welcome-back modal shows roughly `30 * cashPerSecond` credited.
2. Manually edit `lastActiveTimestamp` in AsyncStorage to simulate 10 hours elapsed → confirm credited amount caps at the 8-hour value, not 10.
3. Finish a workout, then immediately finish again same day → second attempt shows "Already logged today — no reward," $0/+0 XP.
4. Finish a workout, advance device system date by one day, finish again → full reward granted normally.
5. Fresh install (clear app data) → no welcome-back modal on first launch.
