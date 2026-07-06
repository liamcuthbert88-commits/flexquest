# Entrance Door, Reception Layout, and NPC Lifecycle — Design

## Goal

Add a visible main door at the gym's existing entrance gap, move the Reception Desk to flank it like a real reception area instead of blocking the walkway, and give the NPC roster a real lifecycle: new members walk in through the door as the gym levels up, and members walk out through it when a Prestige Reset shrinks capacity.

## Current state

- The front wall (`components/GymFloor3D.tsx`'s `GymWalls`) already has a 4-unit-wide entrance gap (`ENTRANCE_GAP_WIDTH = 4`, fixed at world x ∈ [-2, 2], always at `bounds.maxZ` regardless of which zones are unlocked) — but nothing is rendered in the gap itself. It's just an opening between a solid wall segment (left) and a windowed wall segment (right).
- `components/GymDecor.tsx`'s `ReceptionDesk` sits at `[0, 0, maxZ - 2]` — dead center of that gap, directly in the walk-through path, with `CheckInTerminal` just behind it.
- `components/GymNpcs.tsx` has a **fixed** array of exactly 3 NPCs (`NPC_NAMES`/`NPC_COLORS`, both length 3), created once via `createInitialNpcs()` and never grown or shrunk. Their state machine (`NpcState`) cycles forever between `idle` / `walkingToEquipment` / `workingOut` / `walkingToZone` / `atZone` / `walkingToBar` / `recharging` — there's no concept of arriving or leaving.
- `app/tycoon.tsx` passes `memberCount={NPC_NAMES.length}` (a static 3) to `GymTopBar`, right next to `gymLevel`.
- `contexts/UserContext.tsx` already has `gymLevel` (starts at 1, increases with progression) and `prestigeReset(targetLocationId)` (resets `gymLevel` back down along with other per-player state).

## 1. Door + reception layout

A static glass double-door fills the existing entrance gap, reusing the same glass/frame material already established for the windowed wall segment (`WINDOW_GLASS_COLOR = "#9fd8ff"`, `WINDOW_FRAME_COLOR = "#1c1e24"`) so it reads as part of the same building rather than a new material language. Two glass panels (~1.8 wide each) with a slim center frame mullion, sized to the entrance's fixed height, sitting exactly in the `entranceLeftX`(-2)..`entranceRightX`(2) gap at `z = bounds.maxZ`. **No open/close animation** — NPCs simply path straight through it; only the door becoming a visible object is new.

`ReceptionDesk` moves from `[0, 0, maxZ - 2]` (blocking the doorway) to `[-3.2, 0, maxZ - 2]` — just inside and to the left of the door, up against the solid wall segment, out of the walk-through path. `CheckInTerminal` moves alongside it (`[-1.7, 0, maxZ - 2.3]`). The two `PottedPlant`s already flank the doorway itself (`x = ±1.9`) and don't block anything — left as-is.

## 2. Capacity formula + roster data

```ts
function getMemberCapacity(gymLevel: number): number {
  return Math.min(12, 3 + Math.floor(gymLevel / 2));
}
```

At `gymLevel = 1` (the starting value) this returns 3 — matching today's fixed roster exactly, so there's no discontinuity for an existing save. Capacity grows by 1 every 2 levels, capped at 12 (bounds the simulation/render cost of an ever-growing NPC count).

`NPC_NAMES` and `NPC_COLORS` (both currently length 3) expand to 12 curated entries each — no `Math.random()`, consistent with this file's existing rule against randomness in anything that needs to stay stable (the same reason NPC identity is index-based, not randomly generated, today):

```ts
export const NPC_NAMES = [
  "Gains Goblin", "Rep Reaper", "Cardio Crusher", "Iron Vixen",
  "Protein Pixie", "Squat Sensei", "Deadlift Duchess", "Burpee Baron",
  "Kettlebell Krusher", "Treadmill Titan", "Plank Phantom", "Lunge Legend",
];
export const NPC_COLORS = [
  "#F97316", "#22D3EE", "#E879F9", "#A3E635",
  "#FBBF24", "#38BDF8", "#F472B6", "#8B5CF6",
  "#34D399", "#FB7185", "#60A5FA", "#FCD34D",
];
```

Both lists are now exactly the capped capacity (12), so index-based lookup never needs modulo/overflow handling — a member's index into the roster is always a valid index into both arrays.

## 3. Arrive/depart mechanics

A new `DOOR_POSITION` landmark in `constants/zones.ts`: a fixed literal `[0, 0, 10]`, exactly the same pattern as the existing `SMOOTHIE_BAR_POSITION`/`LOCKER_POSITION` constants (not computed from `bounds` — confirmed in `getPlayAreaBounds` that `maxZ` is never reassigned by either zone's unlock, always staying at `MAIN_FLOOR_HALF_SIZE` (10); only `minX`/`minZ` grow as Iron Vault unlocks and `maxX` as Cardio Deck unlocks). The front wall — and therefore the door — never moves.

`NpcState` gains two new values: `"arriving"` and `"departing"`.

- **Capacity increases** (leveled up): once per frame, at the top of `GymNpcs`'s existing outer `useFrame` callback (the one that currently loops over the roster calling `updateNpc` per NPC) — not inside `updateNpc` itself, since this is a roster-level concern, not a per-NPC one — the live roster's length is compared against `getMemberCapacity(gymLevel)`. If the roster is short, one new `NpcRuntime` is pushed, spawned at `DOOR_POSITION` in `"arriving"` state, with a normal idle target inside the gym — reads as a new member walking in. Only one push per frame-check (not all missing slots at once) — if capacity jumps by more than 1 in a single tick (shouldn't normally happen since level-ups are usually one at a time, but defensively), the rest queue in on subsequent frames rather than all spawning stacked on each other at the door simultaneously.
- **Capacity decreases** (Prestige Reset only — nothing else reduces `gymLevel`): NPCs at roster indices ≥ the new (lower) capacity are switched to `"departing"` state, target set to `DOOR_POSITION`. Once a departing NPC's position reaches `DOOR_POSITION` (existing `ARRIVAL_THRESHOLD` logic), it's spliced out of the roster array entirely. Multiple simultaneous departures are staggered ~1.5s apart (each subsequent one's transition into `"departing"` delayed) so they don't all clip through the same doorway at once.
- The roster array (`npcRuntimesRef.current`, owned by `GymFloor3D`, passed into `GymNpcs`) changes from a fixed-size array to one that can grow/shrink via push/splice, driven by the capacity comparison above.
- `gymLevel` isn't currently pulled into `GymFloor3D`'s `useUser()` destructure (confirmed — only `prestigeCount` is) and `GymNpcsProps` has no `gymLevel` field. Both need adding; `GymFloor3D` passes it straight through as a new prop. No separate hook into `prestigeReset` itself is needed — the shrink logic is purely reactive to `gymLevel` dropping, which happens automatically once the prop updates after a reset.
- `GymTopBar`'s member count switches from the static `NPC_NAMES.length` to the actual current roster array length, so it reflects who's really present at that instant (dips briefly while someone's mid-departure) — a natural consequence of the roster becoming dynamic, not a separately-requested feature.

## Out of scope

- Any door open/close animation.
- Random member churn/attrition outside of Prestige Reset.
- Player control over which specific member arrives/departs (always by roster index/order).
- Any change to gameplay economics (member count is cosmetic/atmospheric — it does not affect `cashPerSecond` or any other stat).
