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
