# Equipment Customization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the player reposition, recolor, and rotate each owned piece of Gym Floor equipment, persisted per-player, per `docs/superpowers/specs/2026-07-05-equipment-customization-design.md`.

**Architecture:** Collapse the three inconsistent per-zone position systems in `constants/equipment.ts` into one absolute world lattice matching the tile floor's own tile centers. Add a pure, dependency-free grid-validity module. Store per-item overrides in `UserContext` next to existing per-item state (`equipmentLevels`). Wire overrides into rendering/NPC-walk-targets, an edit UI in the existing `InspectorPanel`, and a drag-to-relocate gesture layered into `GymFloor3D`'s existing `PanResponder`.

**Tech Stack:** React Native + Expo Router, `@react-three/fiber`, TypeScript. No test runner exists in this project (no jest/vitest, confirmed via `package.json` and repo search) — see Global Constraints for how verification works here instead.

## Global Constraints

- No test framework exists in this repo. Do not add one — that's a separate, unrequested initiative. Pure-logic tasks (Task 1, Task 3) verify via a **throwaway scratch script** (plain Node, or `npx tsc --noEmit` for type-only checks) that is deleted immediately after confirming output — never committed. UI/gesture tasks (Task 6, Task 7) verify by running the app (`npx expo start --web` or on-device via the existing tunnel setup) and manually exercising the flow, per this project's established convention throughout its history.
- Run `npx tsc --noEmit` after every task and confirm zero output before committing that task.
- Every new hex color must come from the palette already listed in the spec (`#FBBF24`, `#C084FC`, `#2DD4BF`, `#38BDF8`, `#F472B6`, `#A3E635`, `#8B5CF6`, `#F8F9FA`) — no new colors invented.
- `TILE_SIZE` for equipment placement is `2.5` and must never drift from the floor's own tile size — Task 1 makes `constants/equipment.ts` the single exported source of this constant; `GymFloor3D.tsx` imports it rather than redefining it.
- Equipment world position formula (see spec, corrected after tracing the tile-center math): `worldX = col * TILE_SIZE + TILE_SIZE / 2`, `worldZ = row * TILE_SIZE + TILE_SIZE / 2`. `row`/`col` are signed integers (can be negative), not 0-based indices from any zone's corner.

---

### Task 1: Unify equipment position/color/rotation resolution

**Files:**
- Modify: `constants/equipment.ts` (full rewrite of the position system, ~lines 1-117)
- Modify: `components/GymFloor3D.tsx:148` (import `TILE_SIZE` instead of redefining it)

**Interfaces:**
- Produces: `EQUIPMENT_GRID_TILE_SIZE: number`, `type EquipmentCustomization = { row: number; col: number; color: string; rotationStep: 0 | 1 | 2 | 3 }`, `gridToWorldPosition(row: number, col: number): [number, number, number]`, `getEquipmentWorldPosition(item: Equipment, customizations?: Record<string, EquipmentCustomization>): [number, number, number]`, `getEquipmentColor(item: Equipment, customizations?: Record<string, EquipmentCustomization>): string`, `getEquipmentRotationStep(item: Equipment, customizations?: Record<string, EquipmentCustomization>): 0 | 1 | 2 | 3`. `Equipment.zoneId` is kept (still consumed by `contexts/UserContext.tsx:328` and `components/GymStaff.tsx:99` for the Iron Vault Trainer bonus — unrelated to placement, out of scope to touch). `Equipment.zoneLocalPosition` and the old `IRON_VAULT_WORLD_POSITION` constant are deleted — nothing else references them (confirmed via repo-wide grep).

- [ ] **Step 1: Write the migration arithmetic as a throwaway scratch script**

Create `/tmp/claude-scratch-lattice-check.js` (outside the repo, not committed):

```js
const TILE_SIZE = 2.5;
function gridToWorld(row, col) {
  return [col * TILE_SIZE + TILE_SIZE / 2, row * TILE_SIZE + TILE_SIZE / 2];
}

const cases = [
  { name: "rusty-dumbbell-rack", row: -1, col: -1, oldWorld: [-2, -2] },
  { name: "commercial-bench-press", row: -1, col: 0, oldWorld: [0, -2] },
  { name: "squat-rack", row: -1, col: 1, oldWorld: [2, -2] },
  { name: "cardio-treadmill", row: 0, col: -1, oldWorld: [-2, 0] },
  { name: "cable-crossover-tower", row: -4, col: -6, oldWorld: [-13, -8] },
  { name: "lat-pulldown-machine", row: -5, col: -7, oldWorld: [-17, -12] },
];

for (const c of cases) {
  const [x, z] = gridToWorld(c.row, c.col);
  const shift = Math.hypot(x - c.oldWorld[0], z - c.oldWorld[1]);
  console.log(c.name, "-> new world", [x, z], "shift", shift.toFixed(2));
  if (shift > 1.0) throw new Error(`${c.name} shifted more than one tile: ${shift}`);
}
console.log("All migrations within one tile of their original position.");
```

- [ ] **Step 2: Run it and confirm expected output**

Run: `node /tmp/claude-scratch-lattice-check.js`
Expected: prints 6 lines each with `shift` between `0.00` and `1.00`, then `All migrations within one tile of their original position.` with no thrown error. Delete the scratch file afterward: `rm /tmp/claude-scratch-lattice-check.js`.

- [ ] **Step 3: Rewrite `constants/equipment.ts`**

Replace the entire file with:

```ts
export type GridPosition = {
  row: number;
  col: number;
};

/** World units per grid cell — matches the floor's own tile size exactly
 * (GymFloor3D.tsx imports this rather than defining its own, so the two can
 * never drift apart). Equipment position is always `col * TILE_SIZE +
 * TILE_SIZE / 2` / `row * TILE_SIZE + TILE_SIZE / 2` — the `+ TILE_SIZE / 2`
 * is required, not cosmetic: TiledFloor centers its tiles at
 * `bounds.minX + TILE_SIZE/2 + n*TILE_SIZE`, and since every zone boundary
 * in getPlayAreaBounds is itself a multiple of TILE_SIZE, this formula lands
 * on the exact same absolute lattice of tile centers, for any row/col,
 * forever — without the offset, equipment would sit on tile seams instead. */
export const EQUIPMENT_GRID_TILE_SIZE = 2.5;

/** Converts an absolute, origin-centered grid cell into a world-space
 * [x, y, z] position. `row`/`col` are signed integers, NOT 0-based indices
 * from any particular zone's corner — a stored (row, col) must mean the
 * same physical location regardless of which zones are currently unlocked,
 * since getPlayAreaBounds' min corner shifts as zones unlock. Shared by
 * GymFloor3D (placing equipment) and GymNpcs/GymStaff (walking to it). */
export function gridToWorldPosition(row: number, col: number): [number, number, number] {
  const x = col * EQUIPMENT_GRID_TILE_SIZE + EQUIPMENT_GRID_TILE_SIZE / 2;
  const z = row * EQUIPMENT_GRID_TILE_SIZE + EQUIPMENT_GRID_TILE_SIZE / 2;
  return [x, 0, z];
}

export type Equipment = {
  id: string;
  name: string;
  cost: number;
  cashPerSecond: number;
  requiredLevel: number;
  /** Default hex color for this equipment's 3D block — overridden per-player
   * by EquipmentCustomization.color when present. */
  color: string;
  /** Default grid cell — overridden per-player by EquipmentCustomization
   * when present. Absolute lattice coordinates (see gridToWorldPosition). */
  gridPosition: GridPosition;
  /** Which zone this item counts as belonging to for gameplay bonuses (e.g.
   * the Iron Vault Trainer's cash multiplier) — NOT used for placement.
   * A player can move an item to any valid cell across the whole unlocked
   * floor; it keeps this tag regardless of where it physically sits. */
  zoneId: string;
};

/** Per-player override for one equipment item — absent entries fall back
 * to the item's catalog defaults. Persisted in UserContext. */
export type EquipmentCustomization = {
  row: number;
  col: number;
  color: string;
  rotationStep: 0 | 1 | 2 | 3;
};

export const EQUIPMENT_CATALOG: Equipment[] = [
  {
    id: "rusty-dumbbell-rack",
    name: "Rusty Dumbbell Rack",
    cost: 50,
    cashPerSecond: 1,
    requiredLevel: 1,
    color: "#FBBF24",
    gridPosition: { row: -1, col: -1 },
    zoneId: "main_floor",
  },
  {
    id: "commercial-bench-press",
    name: "Commercial Bench Press",
    cost: 200,
    cashPerSecond: 5,
    requiredLevel: 2,
    color: "#C084FC",
    gridPosition: { row: -1, col: 0 },
    zoneId: "main_floor",
  },
  {
    id: "squat-rack",
    name: "Squat Rack",
    cost: 500,
    cashPerSecond: 15,
    requiredLevel: 3,
    color: "#2DD4BF",
    gridPosition: { row: -1, col: 1 },
    zoneId: "main_floor",
  },
  {
    id: "cardio-treadmill",
    name: "Cardio Treadmill",
    cost: 15000,
    cashPerSecond: 120,
    requiredLevel: 6,
    color: "#38BDF8",
    gridPosition: { row: 0, col: -1 },
    zoneId: "main_floor",
  },
  {
    id: "cable-crossover-tower",
    name: "Cable Crossover Tower",
    cost: 45000,
    cashPerSecond: 450,
    requiredLevel: 8,
    color: "#F472B6",
    gridPosition: { row: -4, col: -6 },
    zoneId: "iron_vault",
  },
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

/** The single source of truth for where an equipment item actually renders
 * — catalog default, overridden per-player by `customizations[item.id]`
 * when present. Used by GymFloor3D (rendering) and GymNpcs/GymStaff (walk
 * targets) so all three never disagree about where a machine is. */
export function getEquipmentWorldPosition(
  item: Equipment,
  customizations?: Record<string, EquipmentCustomization>
): [number, number, number] {
  const override = customizations?.[item.id];
  const row = override?.row ?? item.gridPosition.row;
  const col = override?.col ?? item.gridPosition.col;
  return gridToWorldPosition(row, col);
}

/** Catalog default color, overridden per-player when present. */
export function getEquipmentColor(
  item: Equipment,
  customizations?: Record<string, EquipmentCustomization>
): string {
  return customizations?.[item.id]?.color ?? item.color;
}

/** 0 by default (facing its original orientation), overridden per-player
 * when present. Each step is 90° — applied as rotation.y on the equipment's
 * wrapping <group> in GymFloor3D.tsx. */
export function getEquipmentRotationStep(
  item: Equipment,
  customizations?: Record<string, EquipmentCustomization>
): 0 | 1 | 2 | 3 {
  return customizations?.[item.id]?.rotationStep ?? 0;
}
```

- [ ] **Step 4: Update `GymFloor3D.tsx` to import the shared tile size instead of redefining it**

In `components/GymFloor3D.tsx`, find:

```ts
const FLOOR_SIZE = 20;
const TILES_PER_SIDE = 8;
const TILE_SIZE = FLOOR_SIZE / TILES_PER_SIDE;
```

Replace with:

```ts
const FLOOR_SIZE = 20;
const TILES_PER_SIDE = 8;
```

Then find the import block near the top of the file:

```ts
import { EQUIPMENT_CATALOG, getEquipmentWorldPosition } from "@/constants/equipment";
```

Replace with:

```ts
import {
  EQUIPMENT_CATALOG,
  EQUIPMENT_GRID_TILE_SIZE as TILE_SIZE,
  getEquipmentWorldPosition,
} from "@/constants/equipment";
```

(`FLOOR_SIZE / TILES_PER_SIDE` was already `2.5`, identical to `EQUIPMENT_GRID_TILE_SIZE` — this is a pure dedupe, not a behavior change.)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no output (0 errors). If `GymFloor3D.tsx` or any other file errors on a removed export (`zoneLocalPosition`, old `gridToWorldPosition` signature assumptions), fix the reference — none are expected per the repo-wide grep already done, but confirm.

- [ ] **Step 6: Commit**

```bash
git add constants/equipment.ts components/GymFloor3D.tsx
git commit -m "$(cat <<'EOF'
Unify equipment placement into one absolute world-lattice grid

Replaces three inconsistent position systems (Main Floor's small grid,
Iron Vault's raw offsets, Cardio Deck's nonexistent one) with a single
signed-integer (row, col) lattice matching the tile floor's own tile
centers exactly, plus per-item color/rotation resolvers ready for
player customization.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Move play-area bounds and consolidate landmark position constants

**Files:**
- Modify: `constants/zones.ts` (add `PlayAreaBounds`, `getPlayAreaBounds`; **move** the already-existing `SMOOTHIE_BAR_POSITION` and `LOCKER_POSITION` here rather than duplicating them)
- Modify: `components/GymFloor3D.tsx` (remove the moved type/function; import `PlayAreaBounds`/`getPlayAreaBounds`/`SMOOTHIE_BAR_POSITION`/`LOCKER_POSITION`; use the constants in `SmoothieBar()`/`LockerRoomDoor()` instead of inline literals)
- Modify: `components/GymNpcs.tsx:22-23` (remove the two local definitions, import both from `constants/zones` instead)
- Modify: `components/GymStaff.tsx:6` (import `SMOOTHIE_BAR_POSITION` from `constants/zones` instead of re-exported from `components/GymNpcs`)
- Modify: `components/GymDecor.tsx:1` (import `PlayAreaBounds` from `constants/zones` instead of `components/GymFloor3D`)

**Important — two real duplicates were found while planning, not hypotheticals:** `components/GymNpcs.tsx:22-23` already defines both `LOCKER_POSITION: [number, number, number] = [6, 0, -6]` (used internally within that file, 4 places) and `SMOOTHIE_BAR_POSITION: [number, number, number] = [-6, 0, -6]` (re-exported and imported by `components/GymStaff.tsx:6`). Meanwhile `components/GymFloor3D.tsx`'s `SmoothieBar()`/`LockerRoomDoor()` hardcode the same two values inline, a third independent copy. Do not invent new differently-named constants in `constants/zones.ts` — that would leave three sources of truth for the same two landmarks that could silently drift apart. Consolidate the two existing ones (keeping their existing names) into `constants/zones.ts`, and repoint every current consumer at the new location.

**Interfaces:**
- Produces: `type PlayAreaBounds = { minX: number; maxX: number; minZ: number; maxZ: number }`, `getPlayAreaBounds(unlockedZones: string[]): PlayAreaBounds`, `SMOOTHIE_BAR_POSITION: [number, number, number]` (moved, same value, same name), `LOCKER_POSITION: [number, number, number]` (moved, same value, same name).
- Consumes: nothing new (pure refactor of existing logic).

- [ ] **Step 1: Add to `constants/zones.ts`**

Append to the end of the file:

```ts
export type PlayAreaBounds = { minX: number; maxX: number; minZ: number; maxZ: number };

/** Half the Main Floor's 20x20 footprint (see GymFloor3D.tsx's FLOOR_SIZE) —
 * kept as a literal here rather than importing FLOOR_SIZE, since that
 * constant is about floor-tiling specifics, a different concern from the
 * play area's overall bounds. */
const MAIN_FLOOR_HALF_SIZE = 10;

/** The enclosing shell has to grow with the facility instead of staying
 * fixed at the 20x20 main floor — Cardio Deck ([15,0,0], 10x20) and Iron
 * Vault ([-15,0,-10], 10x10) both extend well past that boundary once
 * unlocked, and a fixed-size box would either occlude them behind a wall or
 * need to ignore them. */
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

/** Fixed landmark world positions — kept here as named constants (not
 * inline literals scattered across GymFloor3D.tsx/GymNpcs.tsx) so the
 * equipment grid-validity checks in constants/equipmentGrid.ts can
 * reference the same values without importing either of those component
 * files. Both are moved from components/GymNpcs.tsx (where they previously
 * lived; SMOOTHIE_BAR_POSITION was also re-exported to
 * components/GymStaff.tsx) — same names, same values, single source of
 * truth now. */
export const SMOOTHIE_BAR_POSITION: [number, number, number] = [-6, 0, -6];
export const LOCKER_POSITION: [number, number, number] = [6, 0, -6];
```

- [ ] **Step 2: Remove the two duplicate constants from `components/GymNpcs.tsx`**

Find:

```ts
export const LOCKER_POSITION: [number, number, number] = [6, 0, -6];
export const SMOOTHIE_BAR_POSITION: [number, number, number] = [-6, 0, -6];
```

Delete these two lines entirely. Then find `GymNpcs.tsx`'s import from `@/constants/zones`:

```ts
import { ZONE_LANDMARKS, MAIN_FLOOR_ZONE_ID } from "@/constants/zones";
```

Replace with:

```ts
import { ZONE_LANDMARKS, MAIN_FLOOR_ZONE_ID, SMOOTHIE_BAR_POSITION, LOCKER_POSITION } from "@/constants/zones";
```

(Every existing usage of `LOCKER_POSITION`/`SMOOTHIE_BAR_POSITION` elsewhere in this file — e.g. `npc.target = SMOOTHIE_BAR_POSITION;`, the 4 `LOCKER_POSITION` usages building the Locker Room landmark's NPC data — needs no change; they now resolve to the imported constants instead of the local ones.)

- [ ] **Step 3: Repoint `components/GymStaff.tsx`'s import**

Find:

```ts
import { EQUIPMENT_CATALOG, getEquipmentWorldPosition } from "@/constants/equipment";
import { ZONE_LANDMARKS, MAIN_FLOOR_ZONE_ID } from "@/constants/zones";
import { lerpAngle, moveToward, SMOOTHIE_BAR_POSITION } from "@/components/GymNpcs";
```

Replace with:

```ts
import { EQUIPMENT_CATALOG, getEquipmentWorldPosition } from "@/constants/equipment";
import { ZONE_LANDMARKS, MAIN_FLOOR_ZONE_ID, SMOOTHIE_BAR_POSITION } from "@/constants/zones";
import { lerpAngle, moveToward } from "@/components/GymNpcs";
```

- [ ] **Step 4: Remove the moved type/function from `GymFloor3D.tsx`, use the imports instead**

Find and delete this line (only used by the function being removed next):

```ts
const MAIN_FLOOR_HALF_SIZE = FLOOR_SIZE / 2;
```

Find and delete this whole block:

```ts
export type PlayAreaBounds = { minX: number; maxX: number; minZ: number; maxZ: number };

/** The enclosing shell has to grow with the facility instead of staying
 * fixed at the 20x20 main floor — Cardio Deck ([15,0,0], 10x20) and Iron
 * Vault ([-15,0,-10], 10x10) both extend well past that boundary once
 * unlocked, and a fixed-size box would either occlude them behind a wall or
 * need to ignore them. This mirrors the same `unlockedZones`-driven growth
 * the camera's orbit radius already does. */
function getPlayAreaBounds(unlockedZones: string[]): PlayAreaBounds {
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

Then update the import near the top of `components/GymFloor3D.tsx`:

```ts
import { MAIN_FLOOR_ZONE_ID } from "@/constants/zones";
```

Replace with:

```ts
import {
  MAIN_FLOOR_ZONE_ID,
  getPlayAreaBounds,
  type PlayAreaBounds,
  SMOOTHIE_BAR_POSITION,
  LOCKER_POSITION,
} from "@/constants/zones";
```

- [ ] **Step 5: Use the imported constants in `SmoothieBar()`/`LockerRoomDoor()` instead of inline literals**

Find:

```ts
function SmoothieBar() {
  return (
    <group position={[-6, 0, -6]}>
```

Replace with:

```ts
function SmoothieBar() {
  return (
    <group position={SMOOTHIE_BAR_POSITION}>
```

Find:

```ts
function LockerRoomDoor() {
  return (
    <group position={[6, 0, -6]}>
```

Replace with:

```ts
function LockerRoomDoor() {
  return (
    <group position={LOCKER_POSITION}>
```

- [ ] **Step 6: Update `components/GymDecor.tsx`'s import**

Find:

```ts
import type { PlayAreaBounds } from "@/components/GymFloor3D";
```

Replace with:

```ts
import type { PlayAreaBounds } from "@/constants/zones";
```

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no output. This confirms every consumer of `PlayAreaBounds`/`getPlayAreaBounds`/`SMOOTHIE_BAR_POSITION` (within `GymFloor3D.tsx` itself — `TiledFloor`, `NeonPerimeter`, `GymWalls`, `CameraRigProps.boundsRef`, `SmoothieBar` — and in `GymDecor.tsx`, `GymNpcs.tsx`, `GymStaff.tsx`) still resolves correctly against the new imports.

- [ ] **Step 8: Manual verification**

Run the app, confirm the Smoothie Bar and Locker Room Door still render at their original positions (no visual change — this step only relocates where the constants are defined) and that an NPC still walks to and recharges at the Smoothie Bar as before.

- [ ] **Step 9: Commit**

```bash
git add constants/zones.ts components/GymFloor3D.tsx components/GymNpcs.tsx components/GymStaff.tsx components/GymDecor.tsx
git commit -m "$(cat <<'EOF'
Consolidate play-area bounds and landmark positions into constants/zones.ts

Pure refactor, no behavior change. Moves PlayAreaBounds/getPlayAreaBounds
out of GymFloor3D.tsx, and moves SMOOTHIE_BAR_POSITION/LOCKER_POSITION
out of GymNpcs.tsx (previously re-exported from there to GymStaff.tsx)
into this shared module, so the upcoming equipment grid-validity module
(constants/equipmentGrid.ts) can reference all of them without importing
either component file.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Equipment grid-validity module

**Files:**
- Create: `constants/equipmentGrid.ts`

**Interfaces:**
- Consumes: `EQUIPMENT_GRID_TILE_SIZE`, `gridToWorldPosition`, `type Equipment`, `type EquipmentCustomization` (from Task 1's `constants/equipment.ts`); `type PlayAreaBounds`, `SMOOTHIE_BAR_POSITION`, `LOCKER_POSITION` (from Task 2's `constants/zones.ts`).
- Produces: `type GridCell = { row: number; col: number }`, `getOccupiedCells(ownedEquipment: Equipment[], customizations: Record<string, EquipmentCustomization>, excludeEquipmentId?: string): Set<string>`, `isValidCell(cell: GridCell, bounds: PlayAreaBounds, occupiedCells: Set<string>): boolean`, `findNearestValidCell(worldX: number, worldZ: number, bounds: PlayAreaBounds, occupiedCells: Set<string>, maxRadius?: number): GridCell | null`, `cellKey(cell: GridCell): string`.

- [ ] **Step 1: Create `constants/equipmentGrid.ts`**

```ts
import {
  EQUIPMENT_GRID_TILE_SIZE,
  gridToWorldPosition,
  type Equipment,
  type EquipmentCustomization,
} from "@/constants/equipment";
import {
  SMOOTHIE_BAR_POSITION,
  LOCKER_POSITION,
  type PlayAreaBounds,
} from "@/constants/zones";

export type GridCell = { row: number; col: number };

/** One full tile of clearance from any wall/pillar. Tracing the actual
 * world coordinates showed Iron Vault's two wireframe fence panels sit
 * exactly on its own minX/minZ boundary edge, so this single margin rule
 * covers walls, corner pillars, and fence panels in one shot — none of them
 * need their own exclusion entry. */
const EDGE_MARGIN = EQUIPMENT_GRID_TILE_SIZE;

/** Smoothie Bar / Locker Room Door are interior landmarks (not
 * boundary-adjacent), so they need their own distance check instead. */
const LANDMARK_EXCLUSION_RADIUS = EQUIPMENT_GRID_TILE_SIZE * 0.8;

export function cellKey(cell: GridCell): string {
  return `${cell.row},${cell.col}`;
}

function distance2D(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

function isWithinBounds(cell: GridCell, bounds: PlayAreaBounds): boolean {
  const [worldX, , worldZ] = gridToWorldPosition(cell.row, cell.col);
  return (
    worldX >= bounds.minX + EDGE_MARGIN &&
    worldX <= bounds.maxX - EDGE_MARGIN &&
    worldZ >= bounds.minZ + EDGE_MARGIN &&
    worldZ <= bounds.maxZ - EDGE_MARGIN
  );
}

function overlapsLandmark(cell: GridCell): boolean {
  const [worldX, , worldZ] = gridToWorldPosition(cell.row, cell.col);
  return [SMOOTHIE_BAR_POSITION, LOCKER_POSITION].some(
    ([landmarkX, , landmarkZ]) =>
      distance2D(worldX, worldZ, landmarkX, landmarkZ) < LANDMARK_EXCLUSION_RADIUS
  );
}

/** Every cell currently occupied by an owned equipment item's *effective*
 * position (catalog default, overridden by `customizations` when present).
 * Pass the item currently being dragged as `excludeEquipmentId` so it
 * doesn't block its own original cell. */
export function getOccupiedCells(
  ownedEquipment: Equipment[],
  customizations: Record<string, EquipmentCustomization>,
  excludeEquipmentId?: string
): Set<string> {
  const occupied = new Set<string>();
  for (const item of ownedEquipment) {
    if (item.id === excludeEquipmentId) continue;
    const override = customizations[item.id];
    const row = override?.row ?? item.gridPosition.row;
    const col = override?.col ?? item.gridPosition.col;
    occupied.add(cellKey({ row, col }));
  }
  return occupied;
}

/** A cell is placeable iff: inside the current play area with a full tile
 * of wall/pillar clearance, not overlapping a fixed interior landmark, and
 * not already occupied by another owned item. */
export function isValidCell(
  cell: GridCell,
  bounds: PlayAreaBounds,
  occupiedCells: Set<string>
): boolean {
  return (
    isWithinBounds(cell, bounds) &&
    !overlapsLandmark(cell) &&
    !occupiedCells.has(cellKey(cell))
  );
}

/** Converts a raw world X/Z (from a raycast during a drag) to the nearest
 * valid cell, expanding outward ring-by-ring (Chebyshev distance) up to
 * `maxRadius` tiles if the closest cell is occupied or invalid. Returns
 * null if nothing valid is found within `maxRadius` — the caller should
 * snap the drag back to the item's original cell in that case. */
export function findNearestValidCell(
  worldX: number,
  worldZ: number,
  bounds: PlayAreaBounds,
  occupiedCells: Set<string>,
  maxRadius = 6
): GridCell | null {
  const centerCol = Math.round(
    (worldX - EQUIPMENT_GRID_TILE_SIZE / 2) / EQUIPMENT_GRID_TILE_SIZE
  );
  const centerRow = Math.round(
    (worldZ - EQUIPMENT_GRID_TILE_SIZE / 2) / EQUIPMENT_GRID_TILE_SIZE
  );

  for (let radius = 0; radius <= maxRadius; radius++) {
    for (let dRow = -radius; dRow <= radius; dRow++) {
      for (let dCol = -radius; dCol <= radius; dCol++) {
        if (Math.max(Math.abs(dRow), Math.abs(dCol)) !== radius) continue;
        const candidate = { row: centerRow + dRow, col: centerCol + dCol };
        if (isValidCell(candidate, bounds, occupiedCells)) return candidate;
      }
    }
  }
  return null;
}
```

- [ ] **Step 2: Write a throwaway scratch script exercising the real logic**

Since there's no `ts-node`/`tsx` in this project (confirmed: not in `node_modules/.bin`), compile just this one module's logic to plain JS inline for the scratch check rather than trying to import the `.ts` file directly. Create `/tmp/claude-scratch-grid-check.js`:

```js
const TILE_SIZE = 2.5;
const EDGE_MARGIN = TILE_SIZE;
const LANDMARK_RADIUS = TILE_SIZE * 0.8;
const SMOOTHIE_BAR = [-6, -6];
const LOCKER_ROOM = [6, -6];

function gridToWorld(row, col) {
  return [col * TILE_SIZE + TILE_SIZE / 2, row * TILE_SIZE + TILE_SIZE / 2];
}
function isWithinBounds(cell, bounds) {
  const [x, z] = gridToWorld(cell.row, cell.col);
  return x >= bounds.minX + EDGE_MARGIN && x <= bounds.maxX - EDGE_MARGIN &&
         z >= bounds.minZ + EDGE_MARGIN && z <= bounds.maxZ - EDGE_MARGIN;
}
function overlapsLandmark(cell) {
  const [x, z] = gridToWorld(cell.row, cell.col);
  return [SMOOTHIE_BAR, LOCKER_ROOM].some(([lx, lz]) => Math.hypot(x - lx, z - lz) < LANDMARK_RADIUS);
}
function isValidCell(cell, bounds, occupied) {
  const key = `${cell.row},${cell.col}`;
  return isWithinBounds(cell, bounds) && !overlapsLandmark(cell) && !occupied.has(key);
}

const mainFloorBounds = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };

// Cell right on the wall edge must be rejected.
if (isValidCell({ row: -4, col: -4 }, mainFloorBounds, new Set())) {
  throw new Error("edge cell should be invalid but was accepted");
}
// Cell near the Smoothie Bar (world -6,-6, nearest lattice cell (-3,-3) at world -6.25,-6.25) must be rejected.
if (isValidCell({ row: -3, col: -3 }, mainFloorBounds, new Set())) {
  throw new Error("Smoothie Bar cell should be invalid but was accepted");
}
// A comfortably central, unoccupied cell must be accepted.
if (!isValidCell({ row: -1, col: -1 }, mainFloorBounds, new Set())) {
  throw new Error("central cell should be valid but was rejected");
}
// An occupied cell must be rejected.
if (isValidCell({ row: -1, col: -1 }, mainFloorBounds, new Set(["-1,-1"]))) {
  throw new Error("occupied cell should be invalid but was accepted");
}

console.log("All grid-validity checks passed.");
```

- [ ] **Step 3: Run it and confirm expected output**

Run: `node /tmp/claude-scratch-grid-check.js`
Expected: `All grid-validity checks passed.` with no thrown error. Delete afterward: `rm /tmp/claude-scratch-grid-check.js`.

- [ ] **Step 4: Type-check the real module**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add constants/equipmentGrid.ts
git commit -m "$(cat <<'EOF'
Add pure equipment grid-validity module

Valid-cell computation for the drag-to-relocate feature: wall/pillar
clearance (which also covers Iron Vault's fence panels, confirmed to
sit exactly on its own boundary edge), landmark exclusion, occupancy,
and nearest-valid-cell search for snapping a drag to a real cell.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Persistence — `equipmentCustomizations` in `UserContext`

**Files:**
- Modify: `contexts/UserContext.tsx`

**Interfaces:**
- Consumes: `type EquipmentCustomization`, `EQUIPMENT_CATALOG` (from `constants/equipment.ts`); `isValidCell`, `getOccupiedCells` (from `constants/equipmentGrid.ts`); `getPlayAreaBounds` (from `constants/zones.ts`).
- Produces new fields on `UserContextValue`: `equipmentCustomizations: Record<string, EquipmentCustomization>`, `setEquipmentColor(equipmentId: string, color: string): void`, `rotateEquipment(equipmentId: string): void`, `moveEquipment(equipmentId: string, row: number, col: number): boolean` (returns whether the move was accepted).

- [ ] **Step 1: Add the import**

In `contexts/UserContext.tsx`, find:

```ts
import { ZONE_CATALOG, MAIN_FLOOR_ZONE_ID } from "@/constants/zones";
```

Replace with:

```ts
import { ZONE_CATALOG, MAIN_FLOOR_ZONE_ID, getPlayAreaBounds } from "@/constants/zones";
```

Find:

```ts
import { EQUIPMENT_CATALOG } from "@/constants/equipment";
```

Replace with:

```ts
import { EQUIPMENT_CATALOG, type EquipmentCustomization } from "@/constants/equipment";
import { isValidCell, getOccupiedCells } from "@/constants/equipmentGrid";
```

- [ ] **Step 2: Add the field to `PersistedUserStats` and its validator**

Find:

```ts
  equipmentLevels: Record<string, number>;
  hiredStaffIds: string[];
};
```

Replace with:

```ts
  equipmentLevels: Record<string, number>;
  hiredStaffIds: string[];
  equipmentCustomizations: Record<string, EquipmentCustomization>;
};
```

Find:

```ts
    typeof stats.equipmentLevels === "object" &&
    stats.equipmentLevels !== null &&
    Array.isArray(stats.hiredStaffIds)
  );
}
```

Replace with:

```ts
    typeof stats.equipmentLevels === "object" &&
    stats.equipmentLevels !== null &&
    Array.isArray(stats.hiredStaffIds) &&
    typeof stats.equipmentCustomizations === "object" &&
    stats.equipmentCustomizations !== null
  );
}
```

- [ ] **Step 3: Add state, load, and save wiring**

Find:

```ts
  const [equipmentLevels, setEquipmentLevels] = useState<Record<string, number>>({});
  const [hiredStaffIds, setHiredStaffIds] = useState<string[]>([]);
```

Replace with:

```ts
  const [equipmentLevels, setEquipmentLevels] = useState<Record<string, number>>({});
  const [hiredStaffIds, setHiredStaffIds] = useState<string[]>([]);
  const [equipmentCustomizations, setEquipmentCustomizations] = useState<
    Record<string, EquipmentCustomization>
  >({});
```

Find (inside the load `useEffect`):

```ts
        setEquipmentLevels(stored.equipmentLevels);
        setHiredStaffIds(stored.hiredStaffIds);
      }
      setIsHydrated(true);
```

Replace with:

```ts
        setEquipmentLevels(stored.equipmentLevels);
        setHiredStaffIds(stored.hiredStaffIds);
        setEquipmentCustomizations(stored.equipmentCustomizations);
      }
      setIsHydrated(true);
```

Find (inside the save `useEffect`'s `stats` object):

```ts
      equipmentLevels,
      hiredStaffIds,
    };
    debouncedSave(stats);
```

Replace with:

```ts
      equipmentLevels,
      hiredStaffIds,
      equipmentCustomizations,
    };
    debouncedSave(stats);
```

Find the save `useEffect`'s dependency array:

```ts
    equipmentLevels,
    hiredStaffIds,
    isHydrated,
    debouncedSave,
  ]);
```

Replace with:

```ts
    equipmentLevels,
    hiredStaffIds,
    equipmentCustomizations,
    isHydrated,
    debouncedSave,
  ]);
```

- [ ] **Step 4: Add the three actions**

Find the end of `upgradeEquipment` (right before `function buyUpgrade`):

```ts
    return { success: true, ...questResult };
  }

  function buyUpgrade(upgradeId: string): PurchaseResult {
```

Replace with:

```ts
    return { success: true, ...questResult };
  }

  function setEquipmentColor(equipmentId: string, color: string): void {
    if (!purchasedEquipmentIds.includes(equipmentId)) return;
    setEquipmentCustomizations((prev) => {
      const item = EQUIPMENT_CATALOG.find((entry) => entry.id === equipmentId);
      if (!item) return prev;
      const existing = prev[equipmentId];
      return {
        ...prev,
        [equipmentId]: {
          row: existing?.row ?? item.gridPosition.row,
          col: existing?.col ?? item.gridPosition.col,
          rotationStep: existing?.rotationStep ?? 0,
          color,
        },
      };
    });
  }

  function rotateEquipment(equipmentId: string): void {
    if (!purchasedEquipmentIds.includes(equipmentId)) return;
    setEquipmentCustomizations((prev) => {
      const item = EQUIPMENT_CATALOG.find((entry) => entry.id === equipmentId);
      if (!item) return prev;
      const existing = prev[equipmentId];
      const currentStep = existing?.rotationStep ?? 0;
      const nextStep = ((currentStep + 1) % 4) as 0 | 1 | 2 | 3;
      return {
        ...prev,
        [equipmentId]: {
          row: existing?.row ?? item.gridPosition.row,
          col: existing?.col ?? item.gridPosition.col,
          color: existing?.color ?? item.color,
          rotationStep: nextStep,
        },
      };
    });
  }

  /** Returns whether the move was accepted. Rejects (no-op) if the target
   * cell fails validity (out of bounds, on a landmark, or occupied by
   * another owned item) — the caller (GymFloor3D's drag handler) should
   * snap its ghost preview back to the item's prior cell when this returns
   * false. */
  function moveEquipment(equipmentId: string, row: number, col: number): boolean {
    if (!purchasedEquipmentIds.includes(equipmentId)) return false;
    const item = EQUIPMENT_CATALOG.find((entry) => entry.id === equipmentId);
    if (!item) return false;

    const bounds = getPlayAreaBounds(unlockedZones);
    const ownedEquipment = EQUIPMENT_CATALOG.filter((entry) =>
      purchasedEquipmentIds.includes(entry.id)
    );
    const occupied = getOccupiedCells(ownedEquipment, equipmentCustomizations, equipmentId);
    if (!isValidCell({ row, col }, bounds, occupied)) return false;

    setEquipmentCustomizations((prev) => {
      const existing = prev[equipmentId];
      return {
        ...prev,
        [equipmentId]: {
          row,
          col,
          color: existing?.color ?? item.color,
          rotationStep: existing?.rotationStep ?? 0,
        },
      };
    });
    return true;
  }

  function buyUpgrade(upgradeId: string): PurchaseResult {
```

- [ ] **Step 5: Clear customizations on prestige reset**

Find:

```ts
    setCash(STARTING_CASH);
    setPurchasedEquipmentIds([]);
    setEquipmentLevels({});
    setHiredManagerIds([]);
    setHiredStaffIds([]);
    setPrestigeCount((prev) => prev + 1);
```

Replace with:

```ts
    setCash(STARTING_CASH);
    setPurchasedEquipmentIds([]);
    setEquipmentLevels({});
    setEquipmentCustomizations({});
    setHiredManagerIds([]);
    setHiredStaffIds([]);
    setPrestigeCount((prev) => prev + 1);
```

- [ ] **Step 6: Expose the new field/actions on the context value**

Find in the `UserContextValue` type:

```ts
  unlockedZones: string[];
  buyZone: (zoneId: string) => PurchaseResult;
};
```

Replace with:

```ts
  unlockedZones: string[];
  buyZone: (zoneId: string) => PurchaseResult;
  equipmentCustomizations: Record<string, EquipmentCustomization>;
  setEquipmentColor: (equipmentId: string, color: string) => void;
  rotateEquipment: (equipmentId: string) => void;
  moveEquipment: (equipmentId: string, row: number, col: number) => boolean;
};
```

Find in the `useMemo` return object:

```ts
      unlockedZones,
      buyZone,
      hiredStaffIds,
      hireStaff,
      injectDevRiches,
    }),
```

Replace with:

```ts
      unlockedZones,
      buyZone,
      hiredStaffIds,
      hireStaff,
      injectDevRiches,
      equipmentCustomizations,
      setEquipmentColor,
      rotateEquipment,
      moveEquipment,
    }),
```

Find the `useMemo` dependency array:

```ts
      unlockedZones,
      hiredStaffIds,
    ]
  );
```

Replace with:

```ts
      unlockedZones,
      hiredStaffIds,
      equipmentCustomizations,
    ]
  );
```

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add contexts/UserContext.tsx
git commit -m "$(cat <<'EOF'
Add equipmentCustomizations persistence to UserContext

New per-player Record<equipmentId, {row,col,color,rotationStep}>,
following the exact pattern already used by equipmentLevels: same
debounced AsyncStorage saver, same load/save wiring, cleared on
prestige reset. moveEquipment validates the target cell through the
grid-validity module before accepting it.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Thread customizations into rendering and NPC/staff walk targets

**Files:**
- Modify: `components/GymFloor3D.tsx` (equipment rendering block, `~line 1409-1432`)
- Modify: `components/GymNpcs.tsx` (walk-target calculation, `~line 274`, and its props type)
- Modify: `components/GymStaff.tsx` (walk-target calculation, `~line 103`, and its props type)

**Interfaces:**
- Consumes: `getEquipmentColor`, `getEquipmentRotationStep` (from Task 1's `constants/equipment.ts`); `equipmentCustomizations` (from Task 4's `UserContext`).
- Produces: `GymNpcsProps.equipmentCustomizations: Record<string, EquipmentCustomization>`, `GymStaffProps.equipmentCustomizations: Record<string, EquipmentCustomization>`.

- [ ] **Step 1: Pull `equipmentCustomizations` out of `useUser()` in `GymFloor3D.tsx`**

Find:

```ts
  const { purchasedEquipmentIds, unlockedZones, equipmentLevels, hiredStaffIds, addCash, currentLocationId, prestigeCount } =
    useUser();
```

Replace with:

```ts
  const {
    purchasedEquipmentIds,
    unlockedZones,
    equipmentLevels,
    hiredStaffIds,
    addCash,
    currentLocationId,
    prestigeCount,
    equipmentCustomizations,
  } = useUser();
```

- [ ] **Step 2: Apply color/rotation/position overrides in the equipment render block**

Find:

```ts
        {ownedEquipment.map((item) => {
          const position = getEquipmentWorldPosition(item);
          const isTopEarner = maxCashPerSecond > 0 && item.cashPerSecond === maxCashPerSecond;
          const isSelected = selection?.type === "equipment" && selection.id === item.id;
          return (
            <group key={item.id} position={position}>
              <GymEquipment
                equipmentId={item.id}
                color={item.color}
                isTopEarner={isTopEarner}
                isSelected={isSelected}
                level={equipmentLevels[item.id] ?? 1}
                occupancyRef={occupancyRef}
              />
            </group>
          );
        })}

        {ownedEquipment.map((item) => (
          <EquipmentSpotlight
            key={`spot-${item.id}`}
            position={getEquipmentWorldPosition(item)}
          />
        ))}
```

Replace with:

```ts
        {ownedEquipment.map((item) => {
          const position = getEquipmentWorldPosition(item, equipmentCustomizations);
          const rotationStep = getEquipmentRotationStep(item, equipmentCustomizations);
          const isTopEarner = maxCashPerSecond > 0 && item.cashPerSecond === maxCashPerSecond;
          const isSelected = selection?.type === "equipment" && selection.id === item.id;
          return (
            <group key={item.id} position={position} rotation={[0, rotationStep * (Math.PI / 2), 0]}>
              <GymEquipment
                equipmentId={item.id}
                color={getEquipmentColor(item, equipmentCustomizations)}
                isTopEarner={isTopEarner}
                isSelected={isSelected}
                level={equipmentLevels[item.id] ?? 1}
                occupancyRef={occupancyRef}
              />
            </group>
          );
        })}

        {ownedEquipment.map((item) => (
          <EquipmentSpotlight
            key={`spot-${item.id}`}
            position={getEquipmentWorldPosition(item, equipmentCustomizations)}
          />
        ))}
```

- [ ] **Step 3: Update the import to pull in the new resolvers**

Find:

```ts
import {
  EQUIPMENT_CATALOG,
  EQUIPMENT_GRID_TILE_SIZE as TILE_SIZE,
  getEquipmentWorldPosition,
} from "@/constants/equipment";
```

Replace with:

```ts
import {
  EQUIPMENT_CATALOG,
  EQUIPMENT_GRID_TILE_SIZE as TILE_SIZE,
  getEquipmentWorldPosition,
  getEquipmentColor,
  getEquipmentRotationStep,
} from "@/constants/equipment";
```

- [ ] **Step 4: Pass `equipmentCustomizations` down to `GymNpcs` and `GymStaff`**

Find:

```ts
        <GymNpcs
          npcRuntimesRef={npcRuntimesRef}
          ownedEquipmentIds={purchasedEquipmentIds}
          unlockedZones={unlockedZones}
          occupancyRef={occupancyRef}
          selectedNpcId={selection?.type === "npc" ? selection.id : null}
          speedMultiplier={janitorSpeedMultiplier}
          onRecharged={() => addCash(smoothieBarRechargeCash)}
        />

        <GymStaff
          hiredStaffIds={hiredStaffIds}
          unlockedZones={unlockedZones}
          occupancyRef={occupancyRef}
        />
```

Replace with:

```ts
        <GymNpcs
          npcRuntimesRef={npcRuntimesRef}
          ownedEquipmentIds={purchasedEquipmentIds}
          unlockedZones={unlockedZones}
          occupancyRef={occupancyRef}
          selectedNpcId={selection?.type === "npc" ? selection.id : null}
          speedMultiplier={janitorSpeedMultiplier}
          onRecharged={() => addCash(smoothieBarRechargeCash)}
          equipmentCustomizations={equipmentCustomizations}
        />

        <GymStaff
          hiredStaffIds={hiredStaffIds}
          unlockedZones={unlockedZones}
          occupancyRef={occupancyRef}
          equipmentCustomizations={equipmentCustomizations}
        />
```

- [ ] **Step 5: Update `GymNpcs.tsx`'s props and walk-target call**

Find:

```ts
type GymNpcsProps = {
  npcRuntimesRef: MutableRefObject<NpcRuntime[]>;
  ownedEquipmentIds: string[];
  unlockedZones: string[];
  occupancyRef: MutableRefObject<Record<string, boolean>>;
  selectedNpcId: string | null;
  /** 1.05 when the Janitor is hired, else 1 — his ambient bonus applies to
   * regular members, not to his own patrol speed. */
  speedMultiplier: number;
  /** Fired once per NPC each time it finishes a recharge cycle at the bar —
   * a discrete event, not a per-frame callback. */
  onRecharged: () => void;
};
```

Replace with:

```ts
type GymNpcsProps = {
  npcRuntimesRef: MutableRefObject<NpcRuntime[]>;
  ownedEquipmentIds: string[];
  unlockedZones: string[];
  occupancyRef: MutableRefObject<Record<string, boolean>>;
  selectedNpcId: string | null;
  /** 1.05 when the Janitor is hired, else 1 — his ambient bonus applies to
   * regular members, not to his own patrol speed. */
  speedMultiplier: number;
  /** Fired once per NPC each time it finishes a recharge cycle at the bar —
   * a discrete event, not a per-frame callback. */
  onRecharged: () => void;
  equipmentCustomizations: Record<string, EquipmentCustomization>;
};
```

Find `GymNpcs.tsx`'s import from `@/constants/equipment` (confirmed exact current text):

```ts
import { EQUIPMENT_CATALOG, getEquipmentWorldPosition } from "@/constants/equipment";
```

Replace with:

```ts
import {
  EQUIPMENT_CATALOG,
  getEquipmentWorldPosition,
  type EquipmentCustomization,
} from "@/constants/equipment";
```

Find the destructured props in `export function GymNpcs({ ... }: GymNpcsProps)` and add `equipmentCustomizations` to the destructuring list.

Find:

```ts
      npc.target = getEquipmentWorldPosition(equipment);
```

Replace with:

```ts
      npc.target = getEquipmentWorldPosition(equipment, equipmentCustomizations);
```

- [ ] **Step 6: Update `GymStaff.tsx`'s props and walk-target call**

Find:

```ts
type GymStaffProps = {
  hiredStaffIds: string[];
  unlockedZones: string[];
  occupancyRef: MutableRefObject<Record<string, boolean>>;
};
```

Replace with:

```ts
type GymStaffProps = {
  hiredStaffIds: string[];
  unlockedZones: string[];
  occupancyRef: MutableRefObject<Record<string, boolean>>;
  equipmentCustomizations: Record<string, EquipmentCustomization>;
};
```

Find `GymStaff.tsx`'s import from `@/constants/equipment` (confirmed exact current text, identical to `GymNpcs.tsx`'s):

```ts
import { EQUIPMENT_CATALOG, getEquipmentWorldPosition } from "@/constants/equipment";
```

Replace with:

```ts
import {
  EQUIPMENT_CATALOG,
  getEquipmentWorldPosition,
  type EquipmentCustomization,
} from "@/constants/equipment";
```

Find:

```ts
export function GymStaff({ hiredStaffIds, unlockedZones, occupancyRef }: GymStaffProps) {
```

Replace with:

```ts
export function GymStaff({ hiredStaffIds, unlockedZones, occupancyRef, equipmentCustomizations }: GymStaffProps) {
```

Find:

```ts
            ? getEquipmentWorldPosition(
                occupiedVaultEquipment[Math.floor(Math.random() * occupiedVaultEquipment.length)]
              )
```

Replace with:

```ts
            ? getEquipmentWorldPosition(
                occupiedVaultEquipment[Math.floor(Math.random() * occupiedVaultEquipment.length)],
                equipmentCustomizations
              )
```

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 8: Manual verification**

Run: `npx expo start --web` (or reuse an already-running dev server), open the Gym Floor tab, confirm all owned equipment still renders in its expected default position/color with no visual change yet (this task only threads plumbing through — no UI to trigger a customization exists until Task 6).

- [ ] **Step 9: Commit**

```bash
git add components/GymFloor3D.tsx components/GymNpcs.tsx components/GymStaff.tsx
git commit -m "$(cat <<'EOF'
Thread equipmentCustomizations into rendering and NPC/staff walk targets

Equipment now renders at its resolved (catalog-default-or-overridden)
position/color/rotation, and NPCs/staff walk to wherever an item
actually is rather than its static catalog position. No user-facing
change yet — no UI exists to create a customization until the next
task.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Edit-mode UI — Colour and Rotate controls

**Files:**
- Modify: `components/InspectorPanel.tsx`
- Modify: `app/tycoon.tsx`

**Interfaces:**
- Consumes: `setEquipmentColor`, `rotateEquipment`, `equipmentCustomizations` (from Task 4's `UserContext`).
- Produces: `InspectorPanel`'s `Props` gains `onSetColor: (equipmentId: string, color: string) => void`, `onRotate: (equipmentId: string) => void`, `onStartMove: (equipmentId: string) => void`, `isEditing: boolean`, `onToggleEdit: () => void`. `onStartMove`/actual move behavior is wired here but only fully functional after Task 7 — this task adds the button and its callback plumbing so Task 7 has something to hook into.

- [ ] **Step 1: Add the Colour palette constant and edit-panel styles/JSX to `InspectorPanel.tsx`**

Find the top of the file:

```ts
import { useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "@/constants/theme";
import { EQUIPMENT_CATALOG } from "@/constants/equipment";
import { useUser } from "@/contexts/UserContext";
import type { Selection, NpcSnapshot } from "@/components/GymFloor3D";

const PANEL_HIDDEN_OFFSET = 320;
const NPC_SNAPSHOT_POLL_MS = 500;

type Props = {
  selection: Selection | null;
  onClose: () => void;
  onUpgrade: (equipmentId: string) => void;
};
```

Replace with:

```ts
import { useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "@/constants/theme";
import { EQUIPMENT_CATALOG } from "@/constants/equipment";
import { useUser } from "@/contexts/UserContext";
import type { Selection, NpcSnapshot } from "@/components/GymFloor3D";

const PANEL_HIDDEN_OFFSET = 320;
const NPC_SNAPSHOT_POLL_MS = 500;

/** Curated palette, reusing hex values already present in the game's
 * equipment catalog and neon signage rather than inventing new colors —
 * keeps player recoloring visually consistent with the existing aesthetic. */
const EQUIPMENT_COLOR_SWATCHES = [
  "#FBBF24",
  "#C084FC",
  "#2DD4BF",
  "#38BDF8",
  "#F472B6",
  "#A3E635",
  "#8B5CF6",
  "#F8F9FA",
];

type Props = {
  selection: Selection | null;
  onClose: () => void;
  onUpgrade: (equipmentId: string) => void;
  onSetColor: (equipmentId: string, color: string) => void;
  onRotate: (equipmentId: string) => void;
  onStartMove: (equipmentId: string) => void;
  isEditing: boolean;
  onToggleEdit: () => void;
};
```

- [ ] **Step 2: Add the props to the function signature**

Find:

```ts
export function InspectorPanel({ selection, onClose, onUpgrade }: Props) {
```

Replace with:

```ts
export function InspectorPanel({
  selection,
  onClose,
  onUpgrade,
  onSetColor,
  onRotate,
  onStartMove,
  isEditing,
  onToggleEdit,
}: Props) {
```

- [ ] **Step 3: Reset `isEditing` when selection changes away from this item**

Find:

```ts
  useEffect(() => {
    if (!selection || selection.type !== "npc") {
      setNpcSnapshot(null);
      return;
    }
```

Leave this block as-is (it's unrelated npc-snapshot logic) — `isEditing` is owned by the parent (`app/tycoon.tsx`, Step 6 below), not local state here, so no change needed in this file for reset behavior; the parent already clears `selection` on tab-leave (see the existing `handleSelectPage` comment in `app/tycoon.tsx`), and Task 6 Step 6 makes it clear `isEditing` at the same time.

- [ ] **Step 4: Add the Edit / Colour / Rotate / Move UI**

Find:

```ts
            <Pressable
              style={[styles.actionButton, !canAffordUpgrade && styles.actionButtonDisabled]}
              disabled={!canAffordUpgrade}
              onPress={() => onUpgrade(equipmentItem.id)}
            >
              <Text style={styles.actionButtonText}>Upgrade ⚡</Text>
            </Pressable>
          </View>
```

Replace with:

```ts
            <Pressable
              style={[styles.actionButton, !canAffordUpgrade && styles.actionButtonDisabled]}
              disabled={!canAffordUpgrade}
              onPress={() => onUpgrade(equipmentItem.id)}
            >
              <Text style={styles.actionButtonText}>Upgrade ⚡</Text>
            </Pressable>
          </View>

          <Pressable style={styles.editToggleButton} onPress={onToggleEdit}>
            <Ionicons
              name={isEditing ? "checkmark-done-outline" : "create-outline"}
              size={16}
              color={colors.accentPrimary}
            />
            <Text style={styles.editToggleText}>{isEditing ? "Done Editing" : "Edit"}</Text>
          </Pressable>

          {isEditing && (
            <View style={styles.editSection}>
              <Text style={styles.statLabel}>Colour</Text>
              <View style={styles.swatchRow}>
                {EQUIPMENT_COLOR_SWATCHES.map((swatch) => (
                  <Pressable
                    key={swatch}
                    style={[styles.swatch, { backgroundColor: swatch }]}
                    onPress={() => onSetColor(equipmentItem.id, swatch)}
                  />
                ))}
              </View>

              <View style={styles.editButtonRow}>
                <Pressable
                  style={styles.editActionButton}
                  onPress={() => onRotate(equipmentItem.id)}
                >
                  <Ionicons name="refresh-outline" size={16} color={colors.textPrimary} />
                  <Text style={styles.editActionButtonText}>Rotate</Text>
                </Pressable>
                <Pressable
                  style={styles.editActionButton}
                  onPress={() => onStartMove(equipmentItem.id)}
                >
                  <Ionicons name="swap-horizontal-outline" size={16} color={colors.textPrimary} />
                  <Text style={styles.editActionButtonText}>Move</Text>
                </Pressable>
              </View>
            </View>
          )}
```

- [ ] **Step 5: Add the new styles**

Find:

```ts
const styles = StyleSheet.create({
  panel: {
```

Leave `panel` and everything before it untouched; find the end of the `styles` object — the closing `});` — and add these entries right before it (i.e. insert as new keys anywhere inside the object; appending near the end keeps the diff small):

```ts
  editToggleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  editToggleText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.accentPrimary,
  },
  editSection: {
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  swatchRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  editButtonRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  editActionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceElevated,
  },
  editActionButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textPrimary,
  },
```

- [ ] **Step 6: Wire the new props in `app/tycoon.tsx`**

Find:

```ts
  const [selection, setSelection] = useState<Selection | null>(null);
```

Replace with:

```ts
  const [selection, setSelection] = useState<Selection | null>(null);
  const [isEditingEquipment, setIsEditingEquipment] = useState(false);
```

Find the `handleSelectPage` function (which already clears `selection` on tab-leave):

```ts
  function handleSelectPage(page: GymPageKey) {
    if (page !== "gymFloor") {
      setSelection(null);
```

Replace with:

```ts
  function handleSelectPage(page: GymPageKey) {
    if (page !== "gymFloor") {
      setSelection(null);
      setIsEditingEquipment(false);
```

Find `app/tycoon.tsx`'s `useUser()` destructure (confirmed exact current text):

```ts
  const {
    level,
    cash,
    cashPerSecond,
    purchasedEquipmentIds,
    purchasedUpgradeIds,
    hiredManagerIds,
    buyEquipment,
    buyUpgrade,
    hireManager,
    upgradeEquipment,
    hiredStaffIds,
    hireStaff,
    buyZone,
    unlockedZones,
    renownPoints,
    renownToNextGymLevel,
    gymLevel,
    completedQuestIds,
    prestigeCount,
    currentLocationId,
    currentLocation,
    addCash,
    injectDevRiches,
  } = useUser();
```

Replace with:

```ts
  const {
    level,
    cash,
    cashPerSecond,
    purchasedEquipmentIds,
    purchasedUpgradeIds,
    hiredManagerIds,
    buyEquipment,
    buyUpgrade,
    hireManager,
    upgradeEquipment,
    hiredStaffIds,
    hireStaff,
    buyZone,
    unlockedZones,
    renownPoints,
    renownToNextGymLevel,
    gymLevel,
    completedQuestIds,
    prestigeCount,
    currentLocationId,
    currentLocation,
    addCash,
    injectDevRiches,
    setEquipmentColor,
    rotateEquipment,
  } = useUser();
```

Find:

```ts
            <GymFloor3D onSelect={setSelection} />
            <InspectorPanel
              selection={selection}
              onClose={() => setSelection(null)}
```

Replace with:

```ts
            <GymFloor3D onSelect={setSelection} />
            <InspectorPanel
              selection={selection}
              onClose={() => {
                setSelection(null);
                setIsEditingEquipment(false);
              }}
              isEditing={isEditingEquipment}
              onToggleEdit={() => setIsEditingEquipment((prev) => !prev)}
              onSetColor={setEquipmentColor}
              onRotate={rotateEquipment}
              onStartMove={() => {
                /* Wired to the drag-to-relocate gesture in Task 7 — this
                   task only adds the button; pressing it currently does
                   nothing observable yet. */
              }}
```

(The existing `onUpgrade={...}` prop and anything else already passed to `<InspectorPanel>` stays as-is — only add the new props above, don't remove or reorder existing ones.)

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 8: Manual verification**

Run the app, buy/select an owned equipment item, tap **Edit** — confirm the Colour swatch row and Rotate/Move buttons appear. Tap a swatch — confirm the item recolors live in the 3D scene. Tap Rotate four times — confirm the item visibly turns 90° each time and returns to its original facing on the fourth tap. Tap **Done Editing** — confirm the edit section collapses. Close and reopen the app (or force-reload) — confirm the color/rotation persisted.

- [ ] **Step 9: Commit**

```bash
git add components/InspectorPanel.tsx app/tycoon.tsx
git commit -m "$(cat <<'EOF'
Add Colour and Rotate controls to the equipment inspector

Edit button reveals a curated 8-swatch colour row (reusing existing
in-game hex values) and a Rotate button that steps rotationStep
0->1->2->3->0 in 90 degree increments, both applying instantly via
UserContext's new setEquipmentColor/rotateEquipment actions. The Move
button is present but not yet functional — wired up in the next task.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Move gesture — drag-to-relocate with ghost preview

**Files:**
- Modify: `components/GymFloor3D.tsx` (PanResponder single-touch branch, render tree, props)
- Modify: `app/tycoon.tsx` (wire the real `onStartMove` behavior from Task 6's placeholder)

**Interfaces:**
- Consumes: `findNearestValidCell`, `getOccupiedCells` (from Task 3's `constants/equipmentGrid.ts`); `moveEquipment` (from Task 4's `UserContext`).
- Produces: `GymFloor3DProps` gains `placingEquipmentId: string | null` and `onPlacementSettled: () => void` (fired whether the move commits or is cancelled, so the parent can clear its own "is placing" state).

- [ ] **Step 1: Add a screen-to-ground raycast helper next to the existing `worldToScreen`**

Find (this is the end of the existing `worldToScreen` function in `GymFloor3D.tsx`):

```ts
  return {
    x: ((vector.x + 1) / 2) * viewWidth,
    y: ((1 - vector.y) / 2) * viewHeight,
  };
}
```

Right after this closing brace, insert a new function:

```ts
/** The inverse of worldToScreen: given a screen pixel and the same camera
 * parameters, finds where that pixel's ray intersects the floor's y=0
 * plane. Used to turn a live finger position into a live world X/Z while
 * dragging an equipment item, replicating the camera the same
 * self-contained way worldToScreen already does rather than reaching into
 * R3F's internal raycasting system. */
function screenToGroundPosition(
  screenX: number,
  screenY: number,
  azimuth: number,
  polar: number,
  orbitRadius: number,
  targetX: number,
  targetZ: number,
  viewWidth: number,
  viewHeight: number
): { x: number; z: number } | null {
  if (viewWidth <= 0 || viewHeight <= 0) return null;

  const camera = new PerspectiveCamera(CAMERA_FOV, viewWidth / viewHeight, 0.1, 1000);
  camera.position.set(
    targetX + orbitRadius * Math.sin(polar) * Math.sin(azimuth),
    orbitRadius * Math.cos(polar),
    targetZ + orbitRadius * Math.sin(polar) * Math.cos(azimuth)
  );
  camera.lookAt(targetX, 0, targetZ);
  camera.updateMatrixWorld();

  const ndcX = (screenX / viewWidth) * 2 - 1;
  const ndcY = -(screenY / viewHeight) * 2 + 1;

  const nearPoint = new Vector3(ndcX, ndcY, 0).unproject(camera);
  const farPoint = new Vector3(ndcX, ndcY, 1).unproject(camera);
  const direction = farPoint.clone().sub(nearPoint).normalize();

  // Intersect with the y=0 plane: nearPoint.y + t * direction.y = 0.
  if (Math.abs(direction.y) < 1e-6) return null;
  const t = -nearPoint.y / direction.y;
  if (t < 0) return null;

  return {
    x: nearPoint.x + direction.x * t,
    z: nearPoint.z + direction.z * t,
  };
}
```

- [ ] **Step 2: Add a ghost-preview component**

Find the `EquipmentSpotlight` function (a good neighbor — both are small per-equipment visual helpers) and add this new component right after it:

```ts
/** Translucent stand-in shown at the live drag position while an equipment
 * item is being moved, plus a highlighted tile at the nearest valid drop
 * cell — not the item's actual detailed model, matching how other
 * lightweight visual affordances in this file (GlowLayer, selection ring)
 * favor simple geometry over reusing a heavy model for a transient effect. */
function PlacementGhost({
  dragPosition,
  targetCell,
  color,
}: {
  dragPosition: [number, number, number];
  targetCell: { row: number; col: number } | null;
  color: string;
}) {
  return (
    <>
      <mesh position={dragPosition}>
        <boxGeometry args={[1.4, 1.4, 1.4]} />
        <meshStandardMaterial color={color} transparent opacity={0.5} />
      </mesh>
      {targetCell && (
        <mesh
          position={gridToWorldPosition(targetCell.row, targetCell.col)}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[TILE_SIZE - TILE_SEAM_GAP, TILE_SIZE - TILE_SEAM_GAP]} />
          <meshBasicMaterial color={NEON_COLOR} transparent opacity={0.4} />
        </mesh>
      )}
    </>
  );
}
```

- [ ] **Step 3: Import the new dependencies**

Find:

```ts
import {
  EQUIPMENT_CATALOG,
  EQUIPMENT_GRID_TILE_SIZE as TILE_SIZE,
  getEquipmentWorldPosition,
  getEquipmentColor,
  getEquipmentRotationStep,
} from "@/constants/equipment";
```

Replace with:

```ts
import {
  EQUIPMENT_CATALOG,
  EQUIPMENT_GRID_TILE_SIZE as TILE_SIZE,
  getEquipmentWorldPosition,
  getEquipmentColor,
  getEquipmentRotationStep,
  gridToWorldPosition,
} from "@/constants/equipment";
import { findNearestValidCell, getOccupiedCells, type GridCell } from "@/constants/equipmentGrid";
```

- [ ] **Step 4: Add `placingEquipmentId`/`onPlacementSettled` props and drag-state refs**

Find:

```ts
type GymFloor3DProps = {
  onSelect?: (selection: Selection | null) => void;
};

export function GymFloor3D({ onSelect }: GymFloor3DProps) {
  return (
    <GymFloorErrorBoundary>
      <GymFloorScene onSelect={onSelect} />
    </GymFloorErrorBoundary>
  );
}
```

Replace with:

```ts
type GymFloor3DProps = {
  onSelect?: (selection: Selection | null) => void;
  /** Non-null while the player is actively dragging this equipment item to
   * a new cell — redirects single-finger drag from camera-pan to
   * repositioning a ghost preview of the item instead. */
  placingEquipmentId?: string | null;
  /** Fired once the drag ends, whether the move committed or was
   * cancelled — lets the parent clear its own "is placing" state. */
  onPlacementSettled?: () => void;
};

export function GymFloor3D({ onSelect, placingEquipmentId, onPlacementSettled }: GymFloor3DProps) {
  return (
    <GymFloorErrorBoundary>
      <GymFloorScene
        onSelect={onSelect}
        placingEquipmentId={placingEquipmentId ?? null}
        onPlacementSettled={onPlacementSettled ?? (() => {})}
      />
    </GymFloorErrorBoundary>
  );
}
```

Find:

```ts
type GymFloorSceneProps = {
  onSelect?: (selection: Selection | null) => void;
};

function GymFloorScene({ onSelect }: GymFloorSceneProps) {
```

Replace with:

```ts
type GymFloorSceneProps = {
  onSelect?: (selection: Selection | null) => void;
  placingEquipmentId: string | null;
  onPlacementSettled: () => void;
};

function GymFloorScene({ onSelect, placingEquipmentId, onPlacementSettled }: GymFloorSceneProps) {
```

- [ ] **Step 5: Pull `moveEquipment` from `useUser()` and add drag-state refs**

Find:

```ts
  const { purchasedEquipmentIds, unlockedZones, equipmentLevels, hiredStaffIds, addCash, currentLocationId, prestigeCount, equipmentCustomizations } =
    useUser();
```

Replace with:

```ts
  const {
    purchasedEquipmentIds,
    unlockedZones,
    equipmentLevels,
    hiredStaffIds,
    addCash,
    currentLocationId,
    prestigeCount,
    equipmentCustomizations,
    moveEquipment,
  } = useUser();
```

Find:

```ts
  const [selection, setSelection] = useState<Selection | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const ownedEquipmentRef = useRef(ownedEquipment);
  ownedEquipmentRef.current = ownedEquipment;
```

Replace with:

```ts
  const [selection, setSelection] = useState<Selection | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const ownedEquipmentRef = useRef(ownedEquipment);
  ownedEquipmentRef.current = ownedEquipment;

  // Live drag state for the Move interaction — a ref (not state) since it
  // updates every touch-move frame; ghostPositionForRender mirrors it into
  // state only at a throttled rate suitable for a re-render (see the drag
  // handler below), the same pattern this file already uses for azimuth
  // easing (ref for the hot path, occasional state for what needs to
  // actually re-render).
  const dragWorldPositionRef = useRef<[number, number, number] | null>(null);
  const dragTargetCellRef = useRef<GridCell | null>(null);
  const [ghostRenderTick, setGhostRenderTick] = useState(0);
  const placingEquipmentIdRef = useRef(placingEquipmentId);
  placingEquipmentIdRef.current = placingEquipmentId;
  const onPlacementSettledRef = useRef(onPlacementSettled);
  onPlacementSettledRef.current = onPlacementSettled;
```

- [ ] **Step 6: Redirect single-finger drag to placement when `placingEquipmentId` is set**

Find (the start of the single-finger branch, right after the two-finger branch's early `return`):

```ts
          if (wasMultiTouchRef.current) {
            // Just dropped from two touches to one — reset the drag baseline
            // to the current cumulative delta so the pan doesn't jump.
            lastPan.current = { dx: gestureState.dx, dy: gestureState.dy };
            wasMultiTouchRef.current = false;
            pinchStartDistanceRef.current = null;
          }

          const deltaX = gestureState.dx - lastPan.current.dx;
          const deltaY = gestureState.dy - lastPan.current.dy;
          lastPan.current = { dx: gestureState.dx, dy: gestureState.dy };

          // Free ground-plane panning, rotated by the camera's current
```

Replace with:

```ts
          if (wasMultiTouchRef.current) {
            // Just dropped from two touches to one — reset the drag baseline
            // to the current cumulative delta so the pan doesn't jump.
            lastPan.current = { dx: gestureState.dx, dy: gestureState.dy };
            wasMultiTouchRef.current = false;
            pinchStartDistanceRef.current = null;
          }

          const placingId = placingEquipmentIdRef.current;
          if (placingId) {
            // Placement mode: single-finger drag repositions a ghost
            // preview instead of panning the camera. Two-finger
            // pinch/rotate (handled above, before this branch) still works
            // normally, so the player can zoom out mid-drag to see across
            // what used to be separate zones.
            //
            // `placingId` is captured into this local const (rather than
            // reading `placingEquipmentIdRef.current` again below) so its
            // type narrows from `string | null` to `string` for the calls
            // below — TypeScript's control-flow narrowing on a mutable
            // ref's `.current` property isn't guaranteed to persist across
            // multiple reads the way a local const's narrowing is.
            const { width, height } = layoutSizeRef.current;
            const ground = screenToGroundPosition(
              evt.nativeEvent.locationX,
              evt.nativeEvent.locationY,
              azimuthRef.current,
              polarRef.current,
              currentRadiusRef.current + zoomOffsetRef.current,
              panXRef.current,
              panZRef.current,
              width,
              height
            );
            if (ground) {
              dragWorldPositionRef.current = [ground.x, 0.8, ground.z];
              const ownedForOccupancy = ownedEquipmentRef.current;
              const occupied = getOccupiedCells(ownedForOccupancy, equipmentCustomizations, placingId);
              dragTargetCellRef.current = findNearestValidCell(
                ground.x,
                ground.z,
                boundsRef.current,
                occupied
              );
              setGhostRenderTick((tick) => tick + 1);
            }
            return;
          }

          const deltaX = gestureState.dx - lastPan.current.dx;
          const deltaY = gestureState.dy - lastPan.current.dy;
          lastPan.current = { dx: gestureState.dx, dy: gestureState.dy };

          // Free ground-plane panning, rotated by the camera's current
```

- [ ] **Step 7: Commit or cancel the placement on release**

Find:

```ts
        onPanResponderRelease: (evt, gestureState) => {
          const wasPanning = !wasMultiTouchRef.current;
          wasMultiTouchRef.current = false;
          pinchStartDistanceRef.current = null;

          const elapsed = Date.now() - gestureStartTimeRef.current;
```

Replace with:

```ts
        onPanResponderRelease: (evt, gestureState) => {
          const wasPanning = !wasMultiTouchRef.current;
          wasMultiTouchRef.current = false;
          pinchStartDistanceRef.current = null;

          const placingIdOnRelease = placingEquipmentIdRef.current;
          if (placingIdOnRelease) {
            const targetCell = dragTargetCellRef.current;
            if (targetCell) {
              moveEquipment(placingIdOnRelease, targetCell.row, targetCell.col);
            }
            dragWorldPositionRef.current = null;
            dragTargetCellRef.current = null;
            setGhostRenderTick((tick) => tick + 1);
            onPlacementSettledRef.current();
            return;
          }

          const elapsed = Date.now() - gestureStartTimeRef.current;
```

- [ ] **Step 8: Render the ghost while placing**

Find:

```ts
        <GymStaff
          hiredStaffIds={hiredStaffIds}
          unlockedZones={unlockedZones}
          occupancyRef={occupancyRef}
          equipmentCustomizations={equipmentCustomizations}
        />

        <CameraRig
```

Replace with:

```ts
        <GymStaff
          hiredStaffIds={hiredStaffIds}
          unlockedZones={unlockedZones}
          occupancyRef={occupancyRef}
          equipmentCustomizations={equipmentCustomizations}
        />

        {placingEquipmentId && dragWorldPositionRef.current && (
          <PlacementGhost
            dragPosition={dragWorldPositionRef.current}
            targetCell={dragTargetCellRef.current}
            color={getEquipmentColor(
              EQUIPMENT_CATALOG.find((entry) => entry.id === placingEquipmentId)!,
              equipmentCustomizations
            )}
          />
        )}

        <CameraRig
```

(`ghostRenderTick` from Step 5/6 is read implicitly — its only job is to be a `useState` value that changes each drag-move frame so React actually re-renders this conditional block, since `dragWorldPositionRef`/`dragTargetCellRef` are refs and wouldn't otherwise trigger a re-render on their own. No direct reference to `ghostRenderTick` is needed in JSX beyond having called `setGhostRenderTick` to trigger the render.)

- [ ] **Step 9: Wire the real `onStartMove` behavior in `app/tycoon.tsx`**

Find the `isEditingEquipment` state added in Task 6:

```ts
  const [isEditingEquipment, setIsEditingEquipment] = useState(false);
```

Replace with:

```ts
  const [isEditingEquipment, setIsEditingEquipment] = useState(false);
  const [placingEquipmentId, setPlacingEquipmentId] = useState<string | null>(null);
```

Find the `<GymFloor3D onSelect={setSelection} />` line from Task 6:

```ts
            <GymFloor3D onSelect={setSelection} />
```

Replace with:

```ts
            <GymFloor3D
              onSelect={setSelection}
              placingEquipmentId={placingEquipmentId}
              onPlacementSettled={() => setPlacingEquipmentId(null)}
            />
```

Find the placeholder from Task 6:

```ts
              onStartMove={() => {
                /* Wired to the drag-to-relocate gesture in Task 7 — this
                   task only adds the button; pressing it currently does
                   nothing observable yet. */
              }}
```

Replace with:

```ts
              onStartMove={(equipmentId) => setPlacingEquipmentId(equipmentId)}
```

- [ ] **Step 10: Type-check**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 11: Manual verification**

Run the app, select an owned equipment item, tap Edit, tap **Move**. Drag a single finger across the floor — confirm a translucent ghost cube follows the finger and a highlighted tile shows the nearest valid drop cell, and that camera pan does NOT happen during this drag. Release over a valid empty cell — confirm the real item jumps there. Try dragging onto another owned item's cell — confirm the ghost's highlight lands on a different nearby cell (not the occupied one) and the real item moves there instead, not onto the occupied cell. Try a two-finger pinch/rotate mid-drag — confirm the camera still zooms/rotates normally while the ghost keeps tracking the single finger. If a real Iron Vault/Cardio Deck zone is unlocked in your test save, drag an item across what used to be a zone boundary and confirm it lands correctly and NPCs/staff subsequently walk to its new spot (per Task 5's wiring).

- [ ] **Step 12: Commit**

```bash
git add components/GymFloor3D.tsx app/tycoon.tsx
git commit -m "$(cat <<'EOF'
Add drag-to-relocate gesture with ghost preview

Move button enters a placement mode where single-finger drag
repositions a translucent ghost (raycast onto the floor's y=0 plane,
mirroring the existing worldToScreen camera setup in reverse) while
two-finger pinch/rotate keeps controlling the camera as normal.
Releasing over a valid cell commits the move through UserContext's
moveEquipment; releasing over an invalid one is a no-op, same as the
item never moved.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Final integration pass

**Files:** none (verification only)

- [ ] **Step 1: Full type-check**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 2: Run the app and exercise the full flow end-to-end**

Run: `npx expo start --web` (or via the existing tunnel setup for a physical device). Walk through:
1. A freshly-migrated save (no existing `equipmentCustomizations`) shows every owned item at its catalog-default position/color/rotation, matching pre-feature layout within about half a tile.
2. Edit → recolor → Done Editing → item stays recolored after leaving and returning to the Gym Floor tab.
3. Edit → rotate 4 times → returns to original facing.
4. Edit → Move → drag to an empty cell within the same zone → commits.
5. Buy/unlock Cardio Deck or Iron Vault (or use a dev-riches save if available) → drag an item from Main Floor into the newly-unlocked zone's floor space → commits, and an NPC/staff member subsequently visits it at the new location.
6. Attempt to drop on top of another owned item's cell → rejected, item stays at its prior cell.
7. Prestige reset (if reachable in a reasonable test) → confirm `equipmentCustomizations` clears along with other prestige-reset state.

- [ ] **Step 3: Confirm no regressions in existing floor behavior**

Confirm: camera pan/pinch/rotate/tilt still work normally outside of placement mode (this was the exact class of gesture-conflict bug fixed earlier this session for browser pinch-zoom — placement mode must not have regressed it). Confirm tap-to-select still works for both equipment and NPCs.

- [ ] **Step 4: Update the spec doc's status (optional, if the project tracks this)**

No status-tracking convention exists elsewhere in `docs/superpowers/specs/` (checked: no other spec files have a status field) — skip this step unless the user asks for one.
