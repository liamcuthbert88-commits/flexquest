# Phase 18: Staff Management, Special Trainers & Routine Tuning

## Goal

Add a third hiring layer — distinct from Phase 6's flat-rate "Staff Managers" —
where each of three specialized staff members applies a targeted, contextual
economic bonus (a zone multiplier, a recharge-event multiplier, or an ambient
NPC-speed bonus) rather than a flat `+$/sec`. Give each a visible 3D presence
with role-specific patrol AI.

## Naming note

The existing Phase 6 tab is "Staff Managers 👥" (`constants/managers.ts`,
`hiredManagerIds`). This phase's roster is a separate, additional system
(`constants/staff.ts`, `hiredStaffIds`) — kept parallel rather than merged,
since the two use fundamentally different reward shapes (flat additive vs.
contextual multiplier). The new tab keeps the requested panel title "Staff
Roster & Hiring Hub" but uses a distinct tab icon (🎖️) to avoid being
confused with the existing "Staff Managers 👥" tab.

## Data model

### `constants/staff.ts` (new)

```ts
export type StaffMember = {
  id: string;
  name: string;
  role: string;
  cost: number;
  description: string;
  operationalZone: string;
};

export const STAFF_CATALOG: StaffMember[] = [
  { id: "clerk_dan", name: "Dan", role: "Front Desk Clerk", cost: 25000,
    description: "+50% cash from Smoothie Bar recharges", operationalZone: "Smoothie Bar" },
  { id: "coach_sarah", name: "Sarah", role: "Personal Trainer", cost: 75000,
    description: "2x earnings from all active Iron Vault equipment", operationalZone: "Iron Vault" },
  { id: "cleaner_bob", name: "Bob", role: "Facility Janitor", cost: 10000,
    description: "+5% member movement speed across all zones", operationalZone: "All Zones" },
];

export const SMOOTHIE_BAR_RECHARGE_CASH = 5;
export const CLERK_RECHARGE_MULTIPLIER = 1.5;
export const TRAINER_IRON_VAULT_MULTIPLIER = 2;
export const JANITOR_SPEED_MULTIPLIER = 1.05;
```

Effect application is hardcoded against these three specific ids (in
`UserContext.tsx` and `GymNpcs.tsx`) rather than built as a generic
"effect system" — there are exactly three fixed, qualitatively different
effects, so a generic dispatcher would be overhead without reuse value.

### `constants/equipment.ts` (extended)

Add `zoneId: string` to `Equipment` (values: `"main_floor"` | `"iron_vault"`)
and an optional `zoneLocalPosition?: [number, number, number]` used instead of
`gridToWorldPosition` when `zoneId !== "main_floor"`. Only
`cable-crossover-tower` and `lat-pulldown-machine` get `zoneId: "iron_vault"`;
everything else (including Squat Rack) stays `"main_floor"`.

Add a shared `getEquipmentWorldPosition(item: Equipment)` helper (next to
`gridToWorldPosition`) that both `GymFloor3D.tsx` (rendering) and `GymNpcs.tsx`
(walk targets) call, so equipment position logic lives in exactly one place.

### `contexts/UserContext.tsx`

- New persisted state `hiredStaffIds: string[]`, new `hireStaff(staffId)`
  following the exact same validate/deduct/append/`evaluateQuests` shape as
  `hireManager`.
- `rawCashPerSecond`: for each owned equipment item, if
  `item.zoneId === "iron_vault"` and `hiredStaffIds.includes("coach_sarah")`,
  its contribution (`cashPerSecond * level`) is doubled before summing.
- No context-level change for the Clerk's bonus — `GymFloorScene` already
  calls `useUser()`, so it computes the recharge cash amount locally from
  `hiredStaffIds` and calls the existing `addCash` directly (see below).

## 3D layer

### `components/GymNpcs.tsx` (extended, not replaced)

- Export `moveToward` (currently private) so `GymStaff.tsx` can reuse the same
  movement math instead of duplicating it.
- `updateNpc`/the walk states take a `speedMultiplier` parameter
  (`hiredStaffIds.includes("cleaner_bob") ? 1.05 : 1`, computed once in
  `GymFloorScene` and passed down as a prop), applied to `WALK_SPEED` in every
  `moveToward` call — this is the Janitor's effect on *regular* members.
- New `onRecharged` callback prop, called once per NPC each time it transitions
  out of `"recharging"` state (a discrete, infrequent event — not per-frame).
- Equipment walk-targets switch from `gridToWorldPosition` to
  `getEquipmentWorldPosition`, so members correctly path to Iron Vault gear.

### `components/GymStaff.tsx` (new)

Only renders staff whose id is in `hiredStaffIds`. Each role has its own small,
independent runtime (no shared state machine with regular members — much
simpler than the member NPC cycle since staff never "work out"):

- **Clerk (Dan)** — bright red uniform. Paces a short fixed range behind the
  Smoothie Bar counter via a sine-wave offset; no `moveToward` needed.
- **Trainer (Sarah)** — bright green uniform + a small flat "clipboard" prop
  mesh with a gentle idle tilt. Each frame, finds Iron Vault equipment ids
  currently `true` in `occupancyRef`; walks between them via `moveToward`
  (cycling target every few seconds if multiple are occupied), or idles at a
  fixed vault-center point if none are occupied.
- **Janitor (Bob)** — bright yellow/high-vis uniform + a small angled "mop"
  prop. Continuously cycles through the landmarks of all *unlocked* zones
  (main floor center + any unlocked `ZONE_LANDMARKS`) via `moveToward`,
  advancing to the next landmark on arrival — a simple perpetual loop, no
  idle/rest state.

All three reuse the existing capsule+sphere-head rig for cheapness/consistency;
only the uniform color and one small prop mesh differ per role.

### `components/GymFloor3D.tsx`

- Computes `janitorSpeedMultiplier` and `smoothieBarRechargeCash` (base × 1.5
  if Clerk hired) from `useUser()`, passes the former into `GymNpcs` and the
  latter into an `onRecharged={() => addCash(smoothieBarRechargeCash)}`
  callback.
- Renders `<GymStaff hiredStaffIds unlockedZones occupancyRef />` alongside
  the existing `<GymNpcs>`.
- Iron Vault equipment (the 2 reassigned items) render via
  `getEquipmentWorldPosition` instead of `gridToWorldPosition`; unaffected by
  whether the Iron Vault zone's decor has been purchased yet.

## UI: `app/tycoon.tsx`

New 5th tab, `TabKey = "... | "staff"`, labeled `"Staff Roster 🎖️"`. Renders
the existing generic `ShopItemCard` per `STAFF_CATALOG` entry — no new card
component needed: `subtitle` shows the operational zone + effect description,
`onBuy` calls `handlePurchaseResult(hireStaff(id))`, reusing the same
quest/level-up alert path every other purchase tab already uses.

## Out of scope

- No new equipment-per-zone assignment beyond the two Iron Vault items —
  Cardio Deck stays decor-only, as it was after Phase 15.
- No cap or stacking rules for staff (each of the 3 is hire-once, like
  managers).
- No changes to the regular member NPC's own economy (rep particles, tiered
  animation speed from Phase 17) beyond the shared `speedMultiplier` threading.
