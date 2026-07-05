export type GridPosition = {
  row: number;
  col: number;
};

const GRID_SPACING = 2;
const CENTER_OFFSET = 2;

/** World position of the Iron Vault zone group (matches GymFloor3D.tsx's
 * IronVaultZone placement) — kept here too so equipment-position math has a
 * single anchor point without importing the 3D component. */
const IRON_VAULT_WORLD_POSITION: [number, number, number] = [-15, 0, -10];

/** Converts an equipment's grid row/col into a world-space [x, y, z] position
 * on the gym floor. Shared by GymFloor3D (placing equipment) and GymNpcs
 * (walking to it), so it lives here rather than being duplicated. */
export function gridToWorldPosition(row: number, col: number): [number, number, number] {
  const x = (col - CENTER_OFFSET) * GRID_SPACING;
  const z = (row - CENTER_OFFSET) * GRID_SPACING;
  return [x, 0, z];
}

export type Equipment = {
  id: string;
  name: string;
  cost: number;
  cashPerSecond: number;
  requiredLevel: number;
  /** Hex color for this equipment's 3D block on the gym floor. */
  color: string;
  /** Where this equipment's 3D block sits on the gym floor grid — used when
   * zoneId is "main_floor". */
  gridPosition: GridPosition;
  /** Which zone this equipment physically lives in. */
  zoneId: string;
  /** Position local to the zone's own group origin — used instead of
   * gridPosition when zoneId isn't "main_floor". */
  zoneLocalPosition?: [number, number, number];
};

export const EQUIPMENT_CATALOG: Equipment[] = [
  {
    id: "rusty-dumbbell-rack",
    name: "Rusty Dumbbell Rack",
    cost: 50,
    cashPerSecond: 1,
    requiredLevel: 1,
    color: "#FBBF24",
    gridPosition: { row: 1, col: 1 },
    zoneId: "main_floor",
  },
  {
    id: "commercial-bench-press",
    name: "Commercial Bench Press",
    cost: 200,
    cashPerSecond: 5,
    requiredLevel: 2,
    color: "#C084FC",
    gridPosition: { row: 1, col: 2 },
    zoneId: "main_floor",
  },
  {
    id: "squat-rack",
    name: "Squat Rack",
    cost: 500,
    cashPerSecond: 15,
    requiredLevel: 3,
    color: "#2DD4BF",
    gridPosition: { row: 1, col: 3 },
    zoneId: "main_floor",
  },
  {
    id: "cardio-treadmill",
    name: "Cardio Treadmill",
    cost: 15000,
    cashPerSecond: 120,
    requiredLevel: 6,
    color: "#38BDF8",
    gridPosition: { row: 2, col: 1 },
    zoneId: "main_floor",
  },
  {
    id: "cable-crossover-tower",
    name: "Cable Crossover Tower",
    cost: 45000,
    cashPerSecond: 450,
    requiredLevel: 8,
    color: "#F472B6",
    gridPosition: { row: 2, col: 2 },
    zoneId: "iron_vault",
    zoneLocalPosition: [2, 0, 2],
  },
  {
    id: "lat-pulldown-machine",
    name: "Lat Pulldown Machine",
    cost: 90000,
    cashPerSecond: 1000,
    requiredLevel: 10,
    color: "#A3E635",
    gridPosition: { row: 2, col: 3 },
    zoneId: "iron_vault",
    zoneLocalPosition: [-2, 0, -2],
  },
];

/** The single source of truth for where an equipment item actually renders —
 * main-floor grid math, or an offset from its zone's world anchor. Used by
 * both GymFloor3D (rendering) and GymNpcs/GymStaff (walk targets) so the two
 * never disagree about where a machine is. */
export function getEquipmentWorldPosition(item: Equipment): [number, number, number] {
  if (item.zoneId === "iron_vault" && item.zoneLocalPosition) {
    const [lx, ly, lz] = item.zoneLocalPosition;
    const [vx, vy, vz] = IRON_VAULT_WORLD_POSITION;
    return [vx + lx, vy + ly, vz + lz];
  }
  return gridToWorldPosition(item.gridPosition.row, item.gridPosition.col);
}
