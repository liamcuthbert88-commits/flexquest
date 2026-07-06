# Shop Catalogue Expansion — Design

## Goal

Roughly double every shop catalogue (Equipment, Upgrades, Managers, Zones, Staff), extending the level curve from ~10 to ~20, without introducing any new themed/distinct "room" identity — consistent with this project's established "it's all one gym" philosophy (already applied this session to the floor, ceiling lighting, and Iron Vault's now-removed fence).

## Current state

- `constants/equipment.ts`: 6 items, cost $50–$90,000, level gates 1–10, all positioned via the absolute world-lattice grid (`gridPosition: {row, col}`) established for the equipment-customization feature — a catalog `gridPosition` is only a *default starting spot*; players can drag any owned item anywhere on the unified floor regardless of this value or its `zoneId`.
- `constants/upgrades.ts`: 2 items (flat `cashBonus` added into `cashRewardMultiplier`).
- `constants/managers.ts`: 2 items (flat `cashPerSecond` added into `rawCashPerSecond`).
- `constants/zones.ts`: 2 purchasable zones (`cardio_deck`, `iron_vault`), each conditionally widening `getPlayAreaBounds`'s returned box.
- `constants/staff.ts`: 3 hires, each with a bespoke, hardcoded effect (not a generic dispatcher — the file's own comment says so: "Effects are hardcoded against these specific ids in UserContext/GymNpcs... since there are exactly three fixed, qualitatively different effects").
- Cardio Deck is purchasable but currently has zero equipment placed in it — an existing gap this expansion partly fills.

## 1. Zones — pure floor-space tiers, no theming

`getPlayAreaBounds` (`constants/zones.ts`) currently has exactly 3 directions it can grow in — `cardio_deck` widens `maxX` to 20, `iron_vault` widens `minX` to -20 and `minZ` to -15. The 4th direction, `maxZ`, is permanently fixed at 10 (that's where the entrance door sits — see the entrance-door spec). Two new zones extend those same 3 directions further, rather than opening a new one:

```ts
export const ZONE_CATALOG: Zone[] = [
  { id: "cardio_deck", name: "Cardio Deck", cost: 50000, requiredLevel: 2 },
  { id: "iron_vault", name: "Iron Vault", cost: 150000, requiredLevel: 4 },
  { id: "facility_expansion_3", name: "Facility Expansion III", cost: 400000, requiredLevel: 6 },
  { id: "facility_expansion_4", name: "Facility Expansion IV", cost: 1000000, requiredLevel: 8 },
];
```

```ts
export function getPlayAreaBounds(unlockedZones: string[]): PlayAreaBounds {
  let minX = -MAIN_FLOOR_HALF_SIZE;
  let maxX = MAIN_FLOOR_HALF_SIZE;
  let minZ = -MAIN_FLOOR_HALF_SIZE;
  let maxZ = MAIN_FLOOR_HALF_SIZE;

  if (unlockedZones.includes("cardio_deck")) {
    maxX = 20;
  }
  if (unlockedZones.includes("iron_vault")) {
    minX = Math.min(minX, -20);
    minZ = Math.min(minZ, -15);
  }
  if (unlockedZones.includes("facility_expansion_3")) {
    maxX = Math.max(maxX, 32);
  }
  if (unlockedZones.includes("facility_expansion_4")) {
    minX = Math.min(minX, -32);
    minZ = Math.min(minZ, -25);
  }

  return { minX, maxX, minZ, maxZ };
}
```

No equipment is exclusive to either new tier, no new decor/landmark motif, no fence or accent marker — the floor/wall/ceiling-LED unification already built this session means "unlock a bigger box" is already the entire visual effect, automatically. `ZONE_LANDMARKS` (the NPC ambient-wander target map) does **not** get new entries for these two — they're pure floor space with nothing at their center worth wandering to, unlike Cardio Deck/Iron Vault which have actual equipment clusters.

## 2. Equipment — 6 new items, same growth curve continued to level 20

All six get `zoneId: "main_floor"` — no new equipment ties into the Iron Vault Trainer's 2x bonus (that stays scoped to exactly the 2 existing Iron Vault items, unchanged). Default grid positions land in Cardio Deck's currently-empty floor space and just past its edge into Facility Expansion III's space (confirmed clear of every existing item's position and of `SMOOTHIE_BAR_POSITION`/`LOCKER_POSITION`):

```ts
{
  id: "smith-machine", name: "Smith Machine", cost: 180000, cashPerSecond: 1800,
  requiredLevel: 12, color: "#FDE047", gridPosition: { row: -2, col: 4 }, zoneId: "main_floor",
},
{
  id: "leg-press-machine", name: "Leg Press Machine", cost: 350000, cashPerSecond: 3200,
  requiredLevel: 14, color: "#FB923C", gridPosition: { row: 0, col: 4 }, zoneId: "main_floor",
},
{
  id: "rowing-machine", name: "Rowing Machine", cost: 650000, cashPerSecond: 5500,
  requiredLevel: 15, color: "#4ADE80", gridPosition: { row: -2, col: 6 }, zoneId: "main_floor",
},
{
  id: "assault-bike", name: "Assault Bike", cost: 1200000, cashPerSecond: 9500,
  requiredLevel: 16, color: "#F87171", gridPosition: { row: 0, col: 6 }, zoneId: "main_floor",
},
{
  id: "functional-trainer-rig", name: "Functional Trainer Rig", cost: 2200000, cashPerSecond: 16000,
  requiredLevel: 18, color: "#818CF8", gridPosition: { row: -2, col: 8 }, zoneId: "main_floor",
},
{
  id: "olympic-platform-rack", name: "Olympic Platform Rack", cost: 4000000, cashPerSecond: 28000,
  requiredLevel: 20, color: "#2DD4BF", gridPosition: { row: 0, col: 8 }, zoneId: "main_floor",
},
```

(`col: 8` → world x = 21.25, just inside Facility Expansion III's space once unlocked at level 6 — well before the level-18/20 gate on the two items placed there, so the space is guaranteed already available.)

Each new item needs its own 3D model function in `components/GymEquipmentModels.tsx`, following the existing pattern (one bespoke low-poly model per equipment id, registered in that file's model lookup) — out of this design's detailed scope (visual modeling, not data/economy design), but called out explicitly so the implementation plan accounts for it as real, non-trivial work per item, not just a catalog-data change.

## 3. Upgrades and Managers — same shapes, 2 more entries each

```ts
// constants/upgrades.ts
{ id: "advanced-ventilation-system", name: "Advanced Ventilation System", cost: 2500, cashBonus: 0.8 },
{ id: "smart-gym-app-integration", name: "Smart Gym App Integration", cost: 8000, cashBonus: 1.5 },
```

```ts
// constants/managers.ts
{ id: "assistant-manager", name: "Assistant Manager", cost: 5000, cashPerSecond: 25 },
{ id: "regional-operations-director", name: "Regional Operations Director", cost: 20000, cashPerSecond: 90 },
```

Both slot straight into their catalog's existing aggregate calculation in `contexts/UserContext.tsx` with zero code changes beyond the new catalog rows — `cashRewardMultiplier` already sums every purchased upgrade's `cashBonus`, and `rawCashPerSecond`'s `managerIncome` already sums every hired manager's `cashPerSecond`.

## 4. Staff — 3 new hires, each wired individually (matching this file's existing "no generic dispatcher" pattern)

```ts
// constants/staff.ts
{
  id: "tech_alex", name: "Alex", role: "Equipment Technician", cost: 30000,
  description: "+10% cash/sec from all equipment", operationalZone: "All Zones",
},
{
  id: "marketer_jess", name: "Jess", role: "Marketing Specialist", cost: 60000,
  description: "+20% cash from workout taps", operationalZone: "All Zones",
},
{
  id: "trainer_mike", name: "Mike", role: "Head Trainer", cost: 100000,
  description: "+15% cash from equipment and workout taps", operationalZone: "All Zones",
},

export const EQUIPMENT_TECHNICIAN_BONUS = 0.1;
export const MARKETING_SPECIALIST_BONUS = 0.2;
export const HEAD_TRAINER_EQUIPMENT_BONUS = 0.15;
export const HEAD_TRAINER_WORKOUT_BONUS = 0.15;
```

Wiring in `contexts/UserContext.tsx` (both existing computed values, extended — not a new mechanism):

- `rawCashPerSecond`'s `equipmentIncome` reduce currently applies `ironVaultBonus` (a `TRAINER_IRON_VAULT_MULTIPLIER`-based *multiplicative* 2x, zone-gated) per item. It gains a second, *additive* factor — `1 + (tech_alex ? EQUIPMENT_TECHNICIAN_BONUS : 0) + (trainer_mike ? HEAD_TRAINER_EQUIPMENT_BONUS : 0)` — applied to every item regardless of `zoneId` (unlike the existing Iron-Vault-only multiplier), stacking additively with itself (both hired = +25%) the same way upgrades' `cashBonus` values already stack with each other, not multiplicatively the way the existing Iron Vault bonus does. Two different existing precedents in this same file — additive (`cashRewardMultiplier`'s upgrade sum) and multiplicative (Iron Vault) — the new general-purpose bonuses follow the additive one since they're broad percentage bonuses, not the narrow zone-locked multiplier.
- `cashRewardMultiplier`'s bonus sum currently totals every purchased upgrade's `cashBonus`. It gains `(marketer_jess ? MARKETING_SPECIALIST_BONUS : 0) + (trainer_mike ? HEAD_TRAINER_WORKOUT_BONUS : 0)` added into that same sum before the final `1 + bonus`.

No change to `GymNpcs.tsx`/`GymStaff.tsx` visuals/patrol behavior is required for these three — unlike the existing three hires, none of the three new ones have a spatial/visual component (no new patrol route, no new landmark), only an economy number. (Whether they get their own visible character model in the scene at all, matching Dan/Sarah/Bob, is a follow-up visual-design question, not an economy one — flagged as out of scope below rather than guessed at.)

## Out of scope

- New 3D character models for the 3 new staff hires (visual design question, separate from this economy-catalogue expansion).
- Any change to the 3 existing staff members' effects.
- Any change to the equipment-customization drag/edit system, or the entrance-door/NPC-lifecycle spec (separate, already-written spec awaiting its own plan).
- Rebalancing any existing catalogue entry's cost/output — only new entries are added.
- **Known pre-existing edge case, not introduced by this design:** `buyEquipment` (`contexts/UserContext.tsx`) never checks zone ownership — only player level and cash. A player could already buy `cable-crossover-tower`/`lat-pulldown-machine` (Iron Vault's default-position items) without ever purchasing Iron Vault, leaving them rendered outside the currently-unlocked floor bounds. The two new items positioned past Cardio Deck's edge (`functional-trainer-rig`, `olympic-platform-rack`) carry the identical latent gap, not a new one. Worth a defensive follow-up (e.g. gating equipment purchase behind its zone, or clamping a default position at render time) but out of scope here since it isn't specific to this catalogue expansion.
