# Shop Catalogue Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Roughly double every shop catalogue (Equipment, Upgrades, Managers, Zones, Staff), extending the level curve to ~20, with the 2 new zones as plain floor-space tiers (no theming, no exclusive equipment).

**Architecture:** Almost entirely catalog-data additions — every shop tab already renders via a generic `.map()` over its catalog array (confirmed in `app/tycoon.tsx`), so most of this plan is adding new entries to existing arrays. Three places need real code, not just data: `getPlayAreaBounds` (two more conditional bounds-widening branches), `UserContext.tsx`'s two aggregate income calculations (new additive staff bonuses), and `GymEquipmentModels.tsx` (six new hand-built 3D models — the one substantial task here).

**Tech Stack:** React Native + Expo Router, `@react-three/fiber`, TypeScript. No test framework exists in this repo (confirmed absent throughout this project's history) — verification is `npx tsc --noEmit` plus, where noted, a throwaway scratch script for pure-logic checks (deleted after use, never committed).

## Global Constraints

- Run `npx tsc --noEmit` after every task and confirm zero output before committing that task.
- No new equipment ties into the Iron Vault Trainer's existing 2x bonus (`TRAINER_IRON_VAULT_MULTIPLIER`) — all 6 new equipment entries use `zoneId: "main_floor"`.
- The 2 new zones (`facility_expansion_3`, `facility_expansion_4`) get no entry in `ZONE_LANDMARKS` — they're pure floor space with nothing at their center worth an NPC wandering to, unlike Cardio Deck/Iron Vault.
- New general-purpose staff bonuses (Equipment Technician, Marketing Specialist, Head Trainer) stack **additively** with each other and with existing additive bonuses (upgrades' `cashBonus` sum) — they do not use the multiplicative pattern the existing Iron Vault Trainer bonus uses, and that existing bonus is not touched.
- No rebalancing of any existing catalogue entry — only new entries are added.

---

### Task 1: Zones — 2 new floor-space tiers + `getPlayAreaBounds` extension

**Files:**
- Modify: `constants/zones.ts`

**Interfaces:**
- Produces: `ZONE_CATALOG` gains 2 entries (`facility_expansion_3`, `facility_expansion_4`). `getPlayAreaBounds(unlockedZones: string[])` return values change when either new id is present in `unlockedZones`.

- [ ] **Step 1: Add the 2 new zone catalog entries**

Find:

```ts
export const ZONE_CATALOG: Zone[] = [
  {
    id: "cardio_deck",
    name: "Cardio Deck",
    cost: 50000,
    requiredLevel: 2,
  },
  {
    id: "iron_vault",
    name: "Iron Vault",
    cost: 150000,
    requiredLevel: 4,
  },
];
```

Replace with:

```ts
export const ZONE_CATALOG: Zone[] = [
  {
    id: "cardio_deck",
    name: "Cardio Deck",
    cost: 50000,
    requiredLevel: 2,
  },
  {
    id: "iron_vault",
    name: "Iron Vault",
    cost: 150000,
    requiredLevel: 4,
  },
  {
    id: "facility_expansion_3",
    name: "Facility Expansion III",
    cost: 400000,
    requiredLevel: 6,
  },
  {
    id: "facility_expansion_4",
    name: "Facility Expansion IV",
    cost: 1000000,
    requiredLevel: 8,
  },
];
```

- [ ] **Step 2: Extend `getPlayAreaBounds` to grow further for the 2 new zones**

Find:

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

  return { minX, maxX, minZ, maxZ };
}
```

Replace with:

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
  // Both new tiers extend the same 3 directions the floor already grows in
  // (cardio_deck -> maxX, iron_vault -> minX/minZ) further, rather than
  // opening a 4th — maxZ is permanently fixed at MAIN_FLOOR_HALF_SIZE since
  // that's where the entrance door sits (see the entrance-door spec).
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

- [ ] **Step 3: Write a throwaway scratch script verifying the bounds math**

Create `/tmp/claude-scratch-zones-check.js` (outside the repo, not committed):

```js
const MAIN_FLOOR_HALF_SIZE = 10;

function getPlayAreaBounds(unlockedZones) {
  let minX = -MAIN_FLOOR_HALF_SIZE;
  let maxX = MAIN_FLOOR_HALF_SIZE;
  let minZ = -MAIN_FLOOR_HALF_SIZE;
  let maxZ = MAIN_FLOOR_HALF_SIZE;

  if (unlockedZones.includes("cardio_deck")) maxX = 20;
  if (unlockedZones.includes("iron_vault")) {
    minX = Math.min(minX, -20);
    minZ = Math.min(minZ, -15);
  }
  if (unlockedZones.includes("facility_expansion_3")) maxX = Math.max(maxX, 32);
  if (unlockedZones.includes("facility_expansion_4")) {
    minX = Math.min(minX, -32);
    minZ = Math.min(minZ, -25);
  }

  return { minX, maxX, minZ, maxZ };
}

// Base case unchanged.
const base = getPlayAreaBounds([]);
if (base.minX !== -10 || base.maxX !== 10 || base.minZ !== -10 || base.maxZ !== 10) {
  throw new Error(`base case changed: ${JSON.stringify(base)}`);
}

// All 4 zones unlocked -> widest possible bounds.
const all = getPlayAreaBounds(["cardio_deck", "iron_vault", "facility_expansion_3", "facility_expansion_4"]);
if (all.minX !== -32 || all.maxX !== 32 || all.minZ !== -25 || all.maxZ !== 10) {
  throw new Error(`full-unlock case wrong: ${JSON.stringify(all)}`);
}

// facility_expansion_3 alone (without cardio_deck) still widens maxX to 32.
const exp3Only = getPlayAreaBounds(["facility_expansion_3"]);
if (exp3Only.maxX !== 32) {
  throw new Error(`facility_expansion_3 alone should widen maxX to 32: ${JSON.stringify(exp3Only)}`);
}

console.log("All zone-bounds checks passed.");
```

- [ ] **Step 4: Run it and confirm expected output**

Run: `node /tmp/claude-scratch-zones-check.js`
Expected: `All zone-bounds checks passed.` with no thrown error. Delete afterward: `rm /tmp/claude-scratch-zones-check.js`.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add constants/zones.ts
git commit -m "$(cat <<'EOF'
Add 2 plain floor-space expansion tiers to the zone catalogue

Facility Expansion III/IV extend the same 3 directions
getPlayAreaBounds already grows in (cardio_deck's maxX, iron_vault's
minX/minZ) further, rather than opening a new direction - maxZ stays
fixed since that's where the entrance door sits. No theming, no
exclusive equipment, no ZONE_LANDMARKS entry - pure floor space,
consistent with "one gym, not separate rooms."

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Upgrades + Managers — 2 new entries each

**Files:**
- Modify: `constants/upgrades.ts`
- Modify: `constants/managers.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `UPGRADE_CATALOG`/`MANAGER_CATALOG` each gain 2 entries. No code elsewhere needs to change — `contexts/UserContext.tsx`'s `cashRewardMultiplier` already sums every purchased upgrade's `cashBonus`, and `rawCashPerSecond`'s `managerIncome` already sums every hired manager's `cashPerSecond` (both confirmed by reading the current aggregate `useMemo` bodies — they iterate the full catalog array, not a fixed list of ids).

- [ ] **Step 1: Add the 2 new upgrades**

Find:

```ts
export const UPGRADE_CATALOG: Upgrade[] = [
  {
    id: "neon-lighting-accent",
    name: "Neon Lighting Accent",
    cost: 300,
    cashBonus: 0.2,
  },
  {
    id: "premium-sound-system",
    name: "Premium Sound System",
    cost: 800,
    cashBonus: 0.5,
  },
];
```

Replace with:

```ts
export const UPGRADE_CATALOG: Upgrade[] = [
  {
    id: "neon-lighting-accent",
    name: "Neon Lighting Accent",
    cost: 300,
    cashBonus: 0.2,
  },
  {
    id: "premium-sound-system",
    name: "Premium Sound System",
    cost: 800,
    cashBonus: 0.5,
  },
  {
    id: "advanced-ventilation-system",
    name: "Advanced Ventilation System",
    cost: 2500,
    cashBonus: 0.8,
  },
  {
    id: "smart-gym-app-integration",
    name: "Smart Gym App Integration",
    cost: 8000,
    cashBonus: 1.5,
  },
];
```

- [ ] **Step 2: Add the 2 new managers**

Find:

```ts
export const MANAGER_CATALOG: Manager[] = [
  {
    id: "front-desk-attendant",
    name: "Front Desk Attendant",
    cost: 400,
    cashPerSecond: 2,
  },
  {
    id: "certified-personal-trainer",
    name: "Certified Personal Trainer",
    cost: 1200,
    cashPerSecond: 8,
  },
];
```

Replace with:

```ts
export const MANAGER_CATALOG: Manager[] = [
  {
    id: "front-desk-attendant",
    name: "Front Desk Attendant",
    cost: 400,
    cashPerSecond: 2,
  },
  {
    id: "certified-personal-trainer",
    name: "Certified Personal Trainer",
    cost: 1200,
    cashPerSecond: 8,
  },
  {
    id: "assistant-manager",
    name: "Assistant Manager",
    cost: 5000,
    cashPerSecond: 25,
  },
  {
    id: "regional-operations-director",
    name: "Regional Operations Director",
    cost: 20000,
    cashPerSecond: 90,
  },
];
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 4: Manual verification**

Run the app (`npx expo start --web` or via the existing tunnel), open the Shop's Facility Upgrades and Staff Managers tabs, confirm all 4 new entries render with correct cost/bonus text and are purchasable once cash allows.

- [ ] **Step 5: Commit**

```bash
git add constants/upgrades.ts constants/managers.ts
git commit -m "$(cat <<'EOF'
Add 2 new upgrades and 2 new managers to the shop catalogue

Pure data additions - both catalogues' consuming code in
UserContext.tsx already iterates the full array rather than a fixed
id list, so no logic changes are needed.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Staff — 3 new hires + additive bonus wiring in `UserContext`

**Files:**
- Modify: `constants/staff.ts`
- Modify: `contexts/UserContext.tsx`

**Interfaces:**
- Produces: `STAFF_CATALOG` gains 3 entries (`tech_alex`, `marketer_jess`, `trainer_mike`). New exported constants `EQUIPMENT_TECHNICIAN_BONUS = 0.1`, `MARKETING_SPECIALIST_BONUS = 0.2`, `HEAD_TRAINER_EQUIPMENT_BONUS = 0.15`, `HEAD_TRAINER_WORKOUT_BONUS = 0.15`.
- Consumes (in `UserContext.tsx`): the 4 new constants above, imported from `@/constants/staff` alongside the existing `TRAINER_IRON_VAULT_MULTIPLIER`.

- [ ] **Step 1: Add the 3 new staff catalog entries and their bonus constants**

Find:

```ts
export const STAFF_CATALOG: StaffMember[] = [
  {
    id: "clerk_dan",
    name: "Dan",
    role: "Front Desk Clerk",
    cost: 25000,
    description: "+50% cash from Smoothie Bar recharges",
    operationalZone: "Smoothie Bar",
  },
  {
    id: "coach_sarah",
    name: "Sarah",
    role: "Personal Trainer",
    cost: 75000,
    description: "2x earnings from all active Iron Vault equipment",
    operationalZone: "Iron Vault",
  },
  {
    id: "cleaner_bob",
    name: "Bob",
    role: "Facility Janitor",
    cost: 10000,
    description: "+5% member movement speed across all zones",
    operationalZone: "All Zones",
  },
];

export const SMOOTHIE_BAR_RECHARGE_CASH = 5;
export const CLERK_RECHARGE_MULTIPLIER = 1.5;
export const TRAINER_IRON_VAULT_MULTIPLIER = 2;
export const JANITOR_SPEED_MULTIPLIER = 1.05;
```

Replace with:

```ts
export const STAFF_CATALOG: StaffMember[] = [
  {
    id: "clerk_dan",
    name: "Dan",
    role: "Front Desk Clerk",
    cost: 25000,
    description: "+50% cash from Smoothie Bar recharges",
    operationalZone: "Smoothie Bar",
  },
  {
    id: "coach_sarah",
    name: "Sarah",
    role: "Personal Trainer",
    cost: 75000,
    description: "2x earnings from all active Iron Vault equipment",
    operationalZone: "Iron Vault",
  },
  {
    id: "cleaner_bob",
    name: "Bob",
    role: "Facility Janitor",
    cost: 10000,
    description: "+5% member movement speed across all zones",
    operationalZone: "All Zones",
  },
  {
    id: "tech_alex",
    name: "Alex",
    role: "Equipment Technician",
    cost: 30000,
    description: "+10% cash/sec from all equipment",
    operationalZone: "All Zones",
  },
  {
    id: "marketer_jess",
    name: "Jess",
    role: "Marketing Specialist",
    cost: 60000,
    description: "+20% cash from workout taps",
    operationalZone: "All Zones",
  },
  {
    id: "trainer_mike",
    name: "Mike",
    role: "Head Trainer",
    cost: 100000,
    description: "+15% cash from equipment and workout taps",
    operationalZone: "All Zones",
  },
];

export const SMOOTHIE_BAR_RECHARGE_CASH = 5;
export const CLERK_RECHARGE_MULTIPLIER = 1.5;
export const TRAINER_IRON_VAULT_MULTIPLIER = 2;
export const JANITOR_SPEED_MULTIPLIER = 1.05;
/** The 3 new general-purpose staff bonuses below are additive with each
 * other (and with UPGRADE_CATALOG's cashBonus sum) - e.g. hiring both
 * tech_alex and trainer_mike gives +25% equipment income, not a
 * multiplied stack. This deliberately differs from TRAINER_IRON_VAULT_
 * MULTIPLIER above, which is a multiplicative, zone-locked bonus scoped
 * to exactly 2 catalog items - these three are broad percentage bonuses
 * across the whole facility instead, so they follow the additive
 * pattern UPGRADE_CATALOG's cashBonus already established. */
export const EQUIPMENT_TECHNICIAN_BONUS = 0.1;
export const MARKETING_SPECIALIST_BONUS = 0.2;
export const HEAD_TRAINER_EQUIPMENT_BONUS = 0.15;
export const HEAD_TRAINER_WORKOUT_BONUS = 0.15;
```

- [ ] **Step 2: Import the 4 new constants in `UserContext.tsx`**

Find:

```ts
import { STAFF_CATALOG, TRAINER_IRON_VAULT_MULTIPLIER } from "@/constants/staff";
```

Replace with:

```ts
import {
  STAFF_CATALOG,
  TRAINER_IRON_VAULT_MULTIPLIER,
  EQUIPMENT_TECHNICIAN_BONUS,
  MARKETING_SPECIALIST_BONUS,
  HEAD_TRAINER_EQUIPMENT_BONUS,
  HEAD_TRAINER_WORKOUT_BONUS,
} from "@/constants/staff";
```

- [ ] **Step 3: Add the additive equipment bonus to `rawCashPerSecond`**

Find:

```ts
  const rawCashPerSecond = useMemo(() => {
    const hasIronVaultTrainer = hiredStaffIds.includes("coach_sarah");

    const equipmentIncome = EQUIPMENT_CATALOG.filter((item) =>
      purchasedEquipmentIds.includes(item.id)
    ).reduce((total, item) => {
      const base = item.cashPerSecond * (equipmentLevels[item.id] ?? 1);
      const ironVaultBonus = item.zoneId === "iron_vault" && hasIronVaultTrainer
        ? TRAINER_IRON_VAULT_MULTIPLIER
        : 1;
      return total + base * ironVaultBonus;
    }, 0);

    const managerIncome = MANAGER_CATALOG.filter((manager) =>
      hiredManagerIds.includes(manager.id)
    ).reduce((total, manager) => total + manager.cashPerSecond, 0);

    return equipmentIncome + managerIncome;
  }, [purchasedEquipmentIds, hiredManagerIds, equipmentLevels, hiredStaffIds]);
```

Replace with:

```ts
  const rawCashPerSecond = useMemo(() => {
    const hasIronVaultTrainer = hiredStaffIds.includes("coach_sarah");
    const staffEquipmentBonusMultiplier =
      1 +
      (hiredStaffIds.includes("tech_alex") ? EQUIPMENT_TECHNICIAN_BONUS : 0) +
      (hiredStaffIds.includes("trainer_mike") ? HEAD_TRAINER_EQUIPMENT_BONUS : 0);

    const equipmentIncome = EQUIPMENT_CATALOG.filter((item) =>
      purchasedEquipmentIds.includes(item.id)
    ).reduce((total, item) => {
      const base = item.cashPerSecond * (equipmentLevels[item.id] ?? 1);
      const ironVaultBonus = item.zoneId === "iron_vault" && hasIronVaultTrainer
        ? TRAINER_IRON_VAULT_MULTIPLIER
        : 1;
      return total + base * ironVaultBonus * staffEquipmentBonusMultiplier;
    }, 0);

    const managerIncome = MANAGER_CATALOG.filter((manager) =>
      hiredManagerIds.includes(manager.id)
    ).reduce((total, manager) => total + manager.cashPerSecond, 0);

    return equipmentIncome + managerIncome;
  }, [purchasedEquipmentIds, hiredManagerIds, equipmentLevels, hiredStaffIds]);
```

- [ ] **Step 4: Add the additive workout bonus to `cashRewardMultiplier`**

Find:

```ts
  const cashRewardMultiplier = useMemo(() => {
    const bonus = UPGRADE_CATALOG.filter((upgrade) =>
      purchasedUpgradeIds.includes(upgrade.id)
    ).reduce((total, upgrade) => total + upgrade.cashBonus, 0);

    return 1 + bonus;
  }, [purchasedUpgradeIds]);
```

Replace with:

```ts
  const cashRewardMultiplier = useMemo(() => {
    const upgradeBonus = UPGRADE_CATALOG.filter((upgrade) =>
      purchasedUpgradeIds.includes(upgrade.id)
    ).reduce((total, upgrade) => total + upgrade.cashBonus, 0);

    const staffWorkoutBonus =
      (hiredStaffIds.includes("marketer_jess") ? MARKETING_SPECIALIST_BONUS : 0) +
      (hiredStaffIds.includes("trainer_mike") ? HEAD_TRAINER_WORKOUT_BONUS : 0);

    return 1 + upgradeBonus + staffWorkoutBonus;
  }, [purchasedUpgradeIds, hiredStaffIds]);
```

- [ ] **Step 5: Write a throwaway scratch script verifying the additive-stacking math**

Create `/tmp/claude-scratch-staff-bonus-check.js`:

```js
const EQUIPMENT_TECHNICIAN_BONUS = 0.1;
const MARKETING_SPECIALIST_BONUS = 0.2;
const HEAD_TRAINER_EQUIPMENT_BONUS = 0.15;
const HEAD_TRAINER_WORKOUT_BONUS = 0.15;
const TRAINER_IRON_VAULT_MULTIPLIER = 2;

function computeEquipmentBonusMultiplier(hiredStaffIds) {
  return (
    1 +
    (hiredStaffIds.includes("tech_alex") ? EQUIPMENT_TECHNICIAN_BONUS : 0) +
    (hiredStaffIds.includes("trainer_mike") ? HEAD_TRAINER_EQUIPMENT_BONUS : 0)
  );
}

function computeCashRewardMultiplier(hiredStaffIds, upgradeBonus) {
  const staffWorkoutBonus =
    (hiredStaffIds.includes("marketer_jess") ? MARKETING_SPECIALIST_BONUS : 0) +
    (hiredStaffIds.includes("trainer_mike") ? HEAD_TRAINER_WORKOUT_BONUS : 0);
  return 1 + upgradeBonus + staffWorkoutBonus;
}

// Neither hired -> no change.
if (computeEquipmentBonusMultiplier([]) !== 1) throw new Error("expected 1x with no staff");

// Both tech_alex and trainer_mike -> additive +25%, not multiplied (which would be 1.1*1.15=1.265).
const both = computeEquipmentBonusMultiplier(["tech_alex", "trainer_mike"]);
if (Math.abs(both - 1.25) > 1e-9) throw new Error(`expected 1.25, got ${both}`);

// Workout bonus stacks additively with an existing upgrade bonus too.
const workout = computeCashRewardMultiplier(["marketer_jess", "trainer_mike"], 0.2);
if (Math.abs(workout - 1.55) > 1e-9) throw new Error(`expected 1.55, got ${workout}`);

// Iron Vault's existing multiplier is untouched by any of this - still a
// flat 2x, not affected by the new additive constants.
if (TRAINER_IRON_VAULT_MULTIPLIER !== 2) throw new Error("existing constant must not change");

console.log("All staff-bonus stacking checks passed.");
```

- [ ] **Step 6: Run it and confirm expected output**

Run: `node /tmp/claude-scratch-staff-bonus-check.js`
Expected: `All staff-bonus stacking checks passed.` with no thrown error. Delete afterward: `rm /tmp/claude-scratch-staff-bonus-check.js`.

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 8: Manual verification**

Run the app, hire Alex (Equipment Technician) and confirm the displayed `cashPerSecond` increases by ~10% of current equipment income; hire Jess (Marketing Specialist) and confirm a workout's cash-tap reward increases by ~20%.

- [ ] **Step 9: Commit**

```bash
git add constants/staff.ts contexts/UserContext.tsx
git commit -m "$(cat <<'EOF'
Add 3 new staff hires with additive general-purpose bonuses

Equipment Technician (+10% equipment cash/sec), Marketing Specialist
(+20% workout-tap cash), Head Trainer (+15% both) - all stack
additively with each other and with existing upgrade bonuses, unlike
the existing Iron Vault Trainer's multiplicative, zone-locked 2x
bonus, which is untouched. None of the three are zone-specific,
consistent with "one gym, not separate rooms."

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Equipment — 6 new catalog entries

**Files:**
- Modify: `constants/equipment.ts`

**Interfaces:**
- Produces: `EQUIPMENT_CATALOG` gains 6 entries: `smith-machine`, `leg-press-machine`, `rowing-machine`, `assault-bike`, `functional-trainer-rig`, `olympic-platform-rack`. Task 5 (new 3D models) depends on these exact ids matching `MODELS_BY_EQUIPMENT_ID`'s new keys.

- [ ] **Step 1: Add the 6 new equipment entries**

Find:

```ts
  {
    id: "lat-pulldown-machine",
    name: "Lat Pulldown Machine",
    cost: 90000,
    cashPerSecond: 1000,
    requiredLevel: 10,
    color: "#A3E635",
    gridPosition: { row: -5, col: -7 },
    zoneId: "iron_vault",
  },
];
```

Replace with:

```ts
  {
    id: "lat-pulldown-machine",
    name: "Lat Pulldown Machine",
    cost: 90000,
    cashPerSecond: 1000,
    requiredLevel: 10,
    color: "#A3E635",
    gridPosition: { row: -5, col: -7 },
    zoneId: "iron_vault",
  },
  {
    id: "smith-machine",
    name: "Smith Machine",
    cost: 180000,
    cashPerSecond: 1800,
    requiredLevel: 12,
    color: "#FDE047",
    gridPosition: { row: -2, col: 4 },
    zoneId: "main_floor",
  },
  {
    id: "leg-press-machine",
    name: "Leg Press Machine",
    cost: 350000,
    cashPerSecond: 3200,
    requiredLevel: 14,
    color: "#FB923C",
    gridPosition: { row: 0, col: 4 },
    zoneId: "main_floor",
  },
  {
    id: "rowing-machine",
    name: "Rowing Machine",
    cost: 650000,
    cashPerSecond: 5500,
    requiredLevel: 15,
    color: "#4ADE80",
    gridPosition: { row: -2, col: 6 },
    zoneId: "main_floor",
  },
  {
    id: "assault-bike",
    name: "Assault Bike",
    cost: 1200000,
    cashPerSecond: 9500,
    requiredLevel: 16,
    color: "#F87171",
    gridPosition: { row: 0, col: 6 },
    zoneId: "main_floor",
  },
  {
    id: "functional-trainer-rig",
    name: "Functional Trainer Rig",
    cost: 2200000,
    cashPerSecond: 16000,
    requiredLevel: 18,
    color: "#818CF8",
    gridPosition: { row: -2, col: 8 },
    zoneId: "main_floor",
  },
  {
    id: "olympic-platform-rack",
    name: "Olympic Platform Rack",
    cost: 4000000,
    cashPerSecond: 28000,
    requiredLevel: 20,
    color: "#2DD4BF",
    gridPosition: { row: 0, col: 8 },
    zoneId: "main_floor",
  },
];
```

- [ ] **Step 2: Write a throwaway scratch script verifying no position collisions**

Create `/tmp/claude-scratch-equipment-positions-check.js`:

```js
const TILE_SIZE = 2.5;
function gridToWorld(row, col) {
  return [col * TILE_SIZE + TILE_SIZE / 2, row * TILE_SIZE + TILE_SIZE / 2];
}

const allPositions = [
  ["rusty-dumbbell-rack", -1, -1],
  ["commercial-bench-press", -1, 0],
  ["squat-rack", -1, 1],
  ["cardio-treadmill", 0, -1],
  ["cable-crossover-tower", -4, -6],
  ["lat-pulldown-machine", -5, -7],
  ["smith-machine", -2, 4],
  ["leg-press-machine", 0, 4],
  ["rowing-machine", -2, 6],
  ["assault-bike", 0, 6],
  ["functional-trainer-rig", -2, 8],
  ["olympic-platform-rack", 0, 8],
];

const seen = new Map();
for (const [id, row, col] of allPositions) {
  const key = `${row},${col}`;
  if (seen.has(key)) {
    throw new Error(`${id} collides with ${seen.get(key)} at cell ${key}`);
  }
  seen.set(key, id);
}

// Landmarks (Smoothie Bar, Locker Room) sit near world (-6,-6) and (6,-6) -
// confirm no new item's world position is suspiciously close (within 1 tile).
const landmarks = [[-6, -6], [6, -6]];
for (const [id, row, col] of allPositions.slice(6)) {
  const [x, z] = gridToWorld(row, col);
  for (const [lx, lz] of landmarks) {
    const dist = Math.hypot(x - lx, z - lz);
    if (dist < 2.0) throw new Error(`${id} at (${x},${z}) too close to landmark (${lx},${lz})`);
  }
}

console.log("All 12 equipment positions are distinct and clear of landmarks.");
```

- [ ] **Step 3: Run it and confirm expected output**

Run: `node /tmp/claude-scratch-equipment-positions-check.js`
Expected: `All 12 equipment positions are distinct and clear of landmarks.` with no thrown error. Delete afterward: `rm /tmp/claude-scratch-equipment-positions-check.js`.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no output. Note: this will NOT catch a missing 3D model for the new ids — `GymEquipment` (in `components/GymEquipmentModels.tsx`) looks up `MODELS_BY_EQUIPMENT_ID[equipmentId]` at runtime and silently renders nothing (`if (!Model) return null;`) if the id isn't registered there yet. That's expected at this point in the plan — Task 5 adds the registrations. Don't be alarmed if a manual check right now shows the new items purchasable but invisible in the 3D scene.

- [ ] **Step 5: Commit**

```bash
git add constants/equipment.ts
git commit -m "$(cat <<'EOF'
Add 6 new equipment catalogue entries (levels 12-20)

Smith Machine, Leg Press Machine, Rowing Machine, Assault Bike,
Functional Trainer Rig, Olympic Platform Rack - continuing the
existing cost/output curve. All tagged zoneId: "main_floor" (none tie
into the Iron Vault Trainer's bonus). Default positions land in Cardio
Deck's currently-empty floor space and just past its edge into
Facility Expansion III's space - confirmed clear of every existing
item and landmark position.

3D models for these 6 ids don't exist yet (next commit) - they'll be
purchasable but invisible in the scene until then, which is expected.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: New 3D equipment models

**Files:**
- Modify: `components/GymEquipmentModels.tsx`

**Interfaces:**
- Consumes: `EquipmentModelProps` (`{ equipmentId, color, isTopEarner, level, occupancyRef }`), `useSignatureMaterial(color, isTopEarner)`, `getSpeedMultiplier(level)`, `getEffectiveRepCycle(level)`, `MachineActivityFX` (props: `equipmentId, occupancyRef, color, originY, repCycleSeconds`), `METAL_PROPS`, `BAR_METAL_PROPS` — all already defined earlier in this same file, unchanged.
- Produces: 6 new model components (`SmithMachineModel`, `LegPressMachineModel`, `RowingMachineModel`, `AssaultBikeModel`, `FunctionalTrainerRigModel`, `OlympicPlatformRackModel`), each registered in `MODELS_BY_EQUIPMENT_ID` under the matching id from Task 4.

- [ ] **Step 1: Add the 6 new model components**

Find:

```ts
// Keyed by the ids in constants/equipment.ts — each model is hand-built for
// one specific catalog entry, not a generic renderer.
const MODELS_BY_EQUIPMENT_ID: Record<string, ComponentType<EquipmentModelProps>> = {
  "rusty-dumbbell-rack": DumbbellRackModel,
  "commercial-bench-press": BenchPressModel,
  "squat-rack": SquatRackModel,
  "cardio-treadmill": TreadmillModel,
  "cable-crossover-tower": CableCrossoverTowerModel,
  "lat-pulldown-machine": LatPulldownMachineModel,
};
```

Replace with:

```ts
/** Two vertical guide rails with a bar that slides within them (unlike
 * SquatRackModel's free barbell) — the rails themselves are the visual
 * distinction from the squat rack. */
function SmithMachineModel({ equipmentId, color, isTopEarner, level, occupancyRef }: EquipmentModelProps) {
  const barMaterial = useSignatureMaterial(color, isTopEarner);
  const barRef = useRef<Group>(null);
  const repCycleSeconds = getEffectiveRepCycle(level);

  useFrame(({ clock }) => {
    if (!barRef.current) return;
    const isOccupied = occupancyRef.current[equipmentId] ?? false;
    const lift = isOccupied
      ? Math.sin((clock.elapsedTime * (Math.PI * 2)) / repCycleSeconds) * 0.12
      : 0;
    barRef.current.position.y = 1.0 + lift;
  });

  const railPositions: [number, number][] = [
    [-0.4, -0.05],
    [0.4, -0.05],
  ];

  return (
    <group>
      {railPositions.map(([x, z]) => (
        <mesh key={x} position={[x, 0.9, z]} castShadow>
          <boxGeometry args={[0.08, 1.9, 0.08]} />
          <meshStandardMaterial {...METAL_PROPS} />
        </mesh>
      ))}
      <mesh position={[0, 1.85, -0.05]} castShadow>
        <boxGeometry args={[0.9, 0.08, 0.08]} />
        <meshStandardMaterial {...METAL_PROPS} />
      </mesh>

      <group ref={barRef} position={[0, 1.0, -0.05]}>
        <mesh rotation={[0, 0, Math.PI / 2]} material={barMaterial} castShadow>
          <cylinderGeometry args={[0.03, 0.03, 0.85, 12]} />
        </mesh>
      </group>

      <MachineActivityFX
        equipmentId={equipmentId}
        occupancyRef={occupancyRef}
        color={color}
        originY={1.0}
        repCycleSeconds={repCycleSeconds}
      />
    </group>
  );
}

/** Angled sled that slides along its own incline when occupied — the
 * incline angle (0.5 rad) is baked into both the sled's rotation and the
 * axis its position animates along, so it visually slides "into" the
 * frame rather than just up/down. */
function LegPressMachineModel({ equipmentId, color, isTopEarner, level, occupancyRef }: EquipmentModelProps) {
  const padMaterial = useSignatureMaterial(color, isTopEarner);
  const sledRef = useRef<Group>(null);
  const repCycleSeconds = getEffectiveRepCycle(level);
  const inclineAngle = 0.5;

  useFrame(({ clock }) => {
    if (!sledRef.current) return;
    const isOccupied = occupancyRef.current[equipmentId] ?? false;
    const slide = isOccupied
      ? (Math.sin((clock.elapsedTime * (Math.PI * 2)) / repCycleSeconds) + 1) * 0.15
      : 0;
    sledRef.current.position.y = 0.5 + slide * Math.sin(inclineAngle);
    sledRef.current.position.z = 0.3 - slide * Math.cos(inclineAngle);
  });

  return (
    <group>
      <mesh position={[0, 0.25, -0.3]} rotation={[inclineAngle, 0, 0]} castShadow>
        <boxGeometry args={[0.7, 0.08, 1.1]} />
        <meshStandardMaterial color="#2a2c33" roughness={0.6} metalness={0.15} />
      </mesh>
      <mesh position={[-0.35, 0.5, -0.75]} rotation={[inclineAngle, 0, 0]} castShadow>
        <boxGeometry args={[0.06, 0.9, 0.06]} />
        <meshStandardMaterial {...METAL_PROPS} />
      </mesh>
      <mesh position={[0.35, 0.5, -0.75]} rotation={[inclineAngle, 0, 0]} castShadow>
        <boxGeometry args={[0.06, 0.9, 0.06]} />
        <meshStandardMaterial {...METAL_PROPS} />
      </mesh>

      <group ref={sledRef} position={[0, 0.5, 0.3]} rotation={[inclineAngle, 0, 0]}>
        <mesh material={padMaterial} castShadow>
          <boxGeometry args={[0.6, 0.5, 0.08]} />
        </mesh>
      </group>

      <MachineActivityFX
        equipmentId={equipmentId}
        occupancyRef={occupancyRef}
        color={color}
        originY={0.5}
        repCycleSeconds={repCycleSeconds}
      />
    </group>
  );
}

/** A seat that slides back/forth on a low rail while a handle (attached via
 * a thin chain-like cylinder) extends away from the flywheel housing in
 * the opposite phase — the two move oppositely, same rep cycle. */
function RowingMachineModel({ equipmentId, color, isTopEarner, level, occupancyRef }: EquipmentModelProps) {
  const handleMaterial = useSignatureMaterial(color, isTopEarner);
  const seatRef = useRef<Mesh>(null);
  const handleRef = useRef<Group>(null);
  const repCycleSeconds = getEffectiveRepCycle(level);

  useFrame(({ clock }) => {
    const isOccupied = occupancyRef.current[equipmentId] ?? false;
    const phase = isOccupied
      ? Math.sin((clock.elapsedTime * (Math.PI * 2)) / repCycleSeconds)
      : 0;
    if (seatRef.current) seatRef.current.position.z = 0.2 + phase * 0.25;
    if (handleRef.current) handleRef.current.position.z = -0.9 - phase * 0.35;
  });

  return (
    <group>
      <mesh position={[0, 0.1, -0.3]} castShadow>
        <boxGeometry args={[0.25, 0.06, 1.8]} />
        <meshStandardMaterial {...METAL_PROPS} />
      </mesh>

      <mesh position={[0, 0.25, -1.05]} castShadow>
        <cylinderGeometry args={[0.22, 0.22, 0.12, 16]} />
        <meshStandardMaterial color="#1c1e24" roughness={0.6} metalness={0.15} />
      </mesh>

      <mesh ref={seatRef} position={[0, 0.18, 0.2]} castShadow>
        <boxGeometry args={[0.35, 0.06, 0.3]} />
        <meshStandardMaterial color="#2a2c33" roughness={0.5} metalness={0.1} />
      </mesh>

      <group ref={handleRef} position={[0, 0.3, -0.9]}>
        <mesh position={[0, 0, 0.4]} castShadow>
          <cylinderGeometry args={[0.012, 0.012, 0.8, 6]} />
          <meshStandardMaterial color="#111318" metalness={0.3} roughness={0.5} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]} material={handleMaterial} castShadow>
          <cylinderGeometry args={[0.025, 0.025, 0.4, 12]} />
        </mesh>
      </group>

      <MachineActivityFX
        equipmentId={equipmentId}
        occupancyRef={occupancyRef}
        color={color}
        originY={0.3}
        repCycleSeconds={repCycleSeconds}
      />
    </group>
  );
}

/** Continuous spinning fan wheel + pedals (unlike the other cyclic models,
 * this one always spins while occupied at a constant rate rather than
 * oscillating a rep — speed still scales with getSpeedMultiplier(level),
 * matching TreadmillModel's continuous-motion pattern more than
 * SquatRackModel's discrete-rep one). */
function AssaultBikeModel({ equipmentId, color, isTopEarner, level, occupancyRef }: EquipmentModelProps) {
  const frameMaterial = useSignatureMaterial(color, isTopEarner);
  const fanRef = useRef<Group>(null);
  const pedalsRef = useRef<Group>(null);
  const speedMultiplier = getSpeedMultiplier(level);

  useFrame((_, delta) => {
    const isOccupied = occupancyRef.current[equipmentId] ?? false;
    if (!isOccupied) return;
    const spin = delta * 6 * speedMultiplier;
    if (fanRef.current) fanRef.current.rotation.z += spin;
    if (pedalsRef.current) pedalsRef.current.rotation.x += spin;
  });

  return (
    <group>
      <mesh position={[0, 0.9, 0]} material={frameMaterial} castShadow>
        <boxGeometry args={[0.1, 0.5, 0.1]} />
      </mesh>
      <mesh position={[0, 0.35, 0.3]} castShadow>
        <boxGeometry args={[0.12, 0.7, 0.12]} />
        <meshStandardMaterial {...METAL_PROPS} />
      </mesh>

      <group ref={fanRef} position={[0, 1.15, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.35, 0.35, 0.04, 20]} />
          <meshStandardMaterial color="#2a2c33" roughness={0.5} metalness={0.3} />
        </mesh>
      </group>

      <group ref={pedalsRef} position={[0, 0.25, 0.3]}>
        {[0, Math.PI].map((angle) => (
          <mesh key={angle} position={[0, Math.sin(angle) * 0.15, Math.cos(angle) * 0.15]} castShadow>
            <boxGeometry args={[0.14, 0.04, 0.08]} />
            <meshStandardMaterial color="#111318" metalness={0.4} roughness={0.4} />
          </mesh>
        ))}
      </group>

      <MachineActivityFX
        equipmentId={equipmentId}
        occupancyRef={occupancyRef}
        color={color}
        originY={0.9}
        repCycleSeconds={getEffectiveRepCycle(level)}
      />
    </group>
  );
}

/** Twin vertical towers (wider stance than CableCrossoverTowerModel) with a
 * swinging crossbar/handle assembly — the handle swings side to side rather
 * than sliding on a column, the visual distinction from the cable tower. */
function FunctionalTrainerRigModel({ equipmentId, color, isTopEarner, level, occupancyRef }: EquipmentModelProps) {
  const handleMaterial = useSignatureMaterial(color, isTopEarner);
  const handleRef = useRef<Group>(null);
  const repCycleSeconds = getEffectiveRepCycle(level);

  useFrame(({ clock }) => {
    if (!handleRef.current) return;
    const isOccupied = occupancyRef.current[equipmentId] ?? false;
    const swing = isOccupied
      ? Math.sin((clock.elapsedTime * (Math.PI * 2)) / repCycleSeconds) * 0.3
      : 0;
    handleRef.current.rotation.z = swing;
  });

  const towerXs = [-0.65, 0.65];

  return (
    <group>
      {towerXs.map((x) => (
        <mesh key={x} position={[x, 1.1, 0]} castShadow>
          <boxGeometry args={[0.12, 2.2, 0.12]} />
          <meshStandardMaterial {...METAL_PROPS} />
        </mesh>
      ))}
      <mesh position={[0, 2.15, 0]} castShadow>
        <boxGeometry args={[1.4, 0.1, 0.1]} />
        <meshStandardMaterial {...METAL_PROPS} />
      </mesh>

      {towerXs.map((x) => (
        <mesh key={`pulley-${x}`} position={[x, 1.6, 0.08]} castShadow>
          <cylinderGeometry args={[0.08, 0.08, 0.08, 12]} />
          <meshStandardMaterial color="#1c1e24" roughness={0.6} metalness={0.2} />
        </mesh>
      ))}

      <group ref={handleRef} position={[0, 1.6, 0.15]}>
        <mesh rotation={[0, 0, Math.PI / 2]} material={handleMaterial} castShadow>
          <cylinderGeometry args={[0.025, 0.025, 0.5, 12]} />
        </mesh>
      </group>

      <MachineActivityFX
        equipmentId={equipmentId}
        occupancyRef={occupancyRef}
        color={color}
        originY={1.6}
        repCycleSeconds={repCycleSeconds}
      />
    </group>
  );
}

/** A low platform with rack posts and a barbell that lifts off it — visually
 * closest to SquatRackModel, distinguished by the flat lifting platform its
 * posts sit on (a real Olympic platform is a physical, distinct piece of
 * equipment from a squat rack). */
function OlympicPlatformRackModel({ equipmentId, color, isTopEarner, level, occupancyRef }: EquipmentModelProps) {
  const barMaterial = useSignatureMaterial(color, isTopEarner);
  const barbellRef = useRef<Group>(null);
  const repCycleSeconds = getEffectiveRepCycle(level);

  useFrame(({ clock }) => {
    if (!barbellRef.current) return;
    const isOccupied = occupancyRef.current[equipmentId] ?? false;
    const lift = isOccupied
      ? Math.sin((clock.elapsedTime * (Math.PI * 2)) / repCycleSeconds) * 0.1
      : 0;
    barbellRef.current.position.y = 1.05 + lift;
  });

  const postPositions: [number, number][] = [
    [-0.4, -0.4],
    [0.4, -0.4],
  ];

  return (
    <group>
      <mesh position={[0, 0.03, 0]} receiveShadow>
        <boxGeometry args={[1.6, 0.06, 1.6]} />
        <meshStandardMaterial color="#3d2b1f" roughness={0.7} metalness={0.05} />
      </mesh>

      {postPositions.map(([x, z]) => (
        <mesh key={`${x}-${z}`} position={[x, 0.85, z]} castShadow>
          <cylinderGeometry args={[0.045, 0.045, 1.7, 12]} />
          <meshStandardMaterial {...METAL_PROPS} />
        </mesh>
      ))}
      {[0.25, 1.6].map((y) => (
        <mesh key={y} position={[0, y, -0.4]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.035, 0.035, 0.8, 12]} />
          <meshStandardMaterial {...METAL_PROPS} />
        </mesh>
      ))}

      <group ref={barbellRef} position={[0, 1.05, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]} material={barMaterial} castShadow>
          <cylinderGeometry args={[0.03, 0.03, 0.8, 12]} />
        </mesh>
      </group>

      <MachineActivityFX
        equipmentId={equipmentId}
        occupancyRef={occupancyRef}
        color={color}
        originY={1.05}
        repCycleSeconds={repCycleSeconds}
      />
    </group>
  );
}

// Keyed by the ids in constants/equipment.ts — each model is hand-built for
// one specific catalog entry, not a generic renderer.
const MODELS_BY_EQUIPMENT_ID: Record<string, ComponentType<EquipmentModelProps>> = {
  "rusty-dumbbell-rack": DumbbellRackModel,
  "commercial-bench-press": BenchPressModel,
  "squat-rack": SquatRackModel,
  "cardio-treadmill": TreadmillModel,
  "cable-crossover-tower": CableCrossoverTowerModel,
  "lat-pulldown-machine": LatPulldownMachineModel,
  "smith-machine": SmithMachineModel,
  "leg-press-machine": LegPressMachineModel,
  "rowing-machine": RowingMachineModel,
  "assault-bike": AssaultBikeModel,
  "functional-trainer-rig": FunctionalTrainerRigModel,
  "olympic-platform-rack": OlympicPlatformRackModel,
};
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 3: Manual verification**

Run the app, use the dev-riches sandbox cheat (`handleDevRiches`, the DEV button in the top bar, `__DEV__` only) to get enough cash and level to buy all 6 new items, confirm each renders distinctly in the 3D scene at its catalog default position, and that each animates (bar/sled/wheel motion) when an NPC occupies it.

- [ ] **Step 4: Commit**

```bash
git add components/GymEquipmentModels.tsx
git commit -m "$(cat <<'EOF'
Add 3D models for the 6 new equipment catalogue entries

Each follows the existing per-item hand-built model pattern (boxes/
cylinders only, one signature-colored moving part animated via
occupancy + level-scaled rep cycle, shared MachineActivityFX particle/
ring effects) - registered in MODELS_BY_EQUIPMENT_ID under the ids
added to the catalogue in the previous commit.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Final integration pass

**Files:** none (verification only)

- [ ] **Step 1: Full type-check**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 2: Run the app and exercise the full expanded shop end-to-end**

Run: `npx expo start --web` (or via the existing tunnel setup for a physical device). Walk through:
1. Facility Expansion Center shows all 4 zones (Cardio Deck, Iron Vault, Facility Expansion III, Facility Expansion IV) with correct cost/level-gate text; buying III/IV visibly grows the floor/walls/ceiling further with no distinct theming (matches the existing Cardio Deck/Iron Vault unlock behavior already verified this session).
2. Equipment tab shows all 12 items; the 6 new ones are locked until the required level, purchasable once cash/level allow, and each renders its distinct 3D model at its default position once bought.
3. Facility Upgrades and Staff Managers tabs each show 4 entries; purchasing/hiring the new ones visibly changes `cashPerSecond`/cash-tap reward by the expected amount.
4. Staff Roster tab shows all 6 hires; hiring Alex/Jess/Mike changes the displayed income/reward numbers by the expected additive amount, and hiring both Alex and Mike together confirms additive (not multiplicative) stacking.
5. Confirm no regression in the existing Cardio Deck/Iron Vault equipment or the 3 existing staff members' effects.

- [ ] **Step 3: Confirm no orphaned scratch files**

Run: `ls /tmp/claude-scratch-*.js 2>/dev/null || echo "none left"` — confirm every throwaway verification script from Tasks 1/3/4 was deleted as its step instructed.
