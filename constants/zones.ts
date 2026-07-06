import { EQUIPMENT_GRID_TILE_SIZE } from "./equipment";

export type Zone = {
  id: string;
  name: string;
  cost: number;
  requiredLevel: number;
};

/** The starting zone every player already has — not purchasable, so it's
 * kept separate from ZONE_CATALOG rather than as a free entry in it. */
export const MAIN_FLOOR_ZONE_ID = "main_floor";

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

/** Safely inside the base (n=0, 8x8 tile) bounds — the smallest the floor
 * can ever be — rather than a position tied to either zone's old, distinct
 * physical room shape (which no longer exists under the uniform per-zone
 * growth model). A player can buy zones in any order (purchase depends
 * only on level/cash, not on owning any other zone first), so a landmark
 * only needs to be valid regardless of how many zones are actually owned;
 * basing it on the smallest possible floor achieves that trivially. */
export const ZONE_LANDMARKS: Record<string, [number, number, number]> = {
  cardio_deck: [8, 0.3, 3],
  iron_vault: [-8, 0, -8],
};

export type PlayAreaBounds = { minX: number; maxX: number; minZ: number; maxZ: number };

/** Base half-size in tiles (not units) — 4 tiles each way from center is an
 * 8x8 tile (20x20 unit) starting floor. Kept in tiles, not units, since
 * every term in the formula below is naturally tile-denominated. */
const BASE_HALF_TILES = 4;
/** +1 tile each side of X per zone owned (2 columns total) — see the
 * 2026-07-06 play-area-resize design doc for the full rationale. */
const COLUMNS_PER_ZONE = 1;
/** +2 tiles on -Z per zone owned (2 rows total) — all on one side since
 * +Z (maxZ) is permanently fixed at the entrance wall and can never grow. */
const ROWS_PER_ZONE = 2;

/** The enclosing shell has to grow with the facility instead of staying
 * fixed at the 8x8-tile starting floor. Purely a function of *how many*
 * zones are owned, not which specific ones — every zone purchase adds the
 * same +2 columns (X, split 1 tile to each side) and +2 rows (Z, all on the
 * -Z side, since +Z/maxZ is fixed at the entrance wall and can never grow).
 * This means a future 5th zone tier needs zero changes here. */
export function getPlayAreaBounds(unlockedZones: string[]): PlayAreaBounds {
  const zonesOwned = unlockedZones.filter((id) => id !== MAIN_FLOOR_ZONE_ID).length;

  const halfWidthTiles = BASE_HALF_TILES + zonesOwned * COLUMNS_PER_ZONE;
  const minX = -halfWidthTiles * EQUIPMENT_GRID_TILE_SIZE;
  const maxX = halfWidthTiles * EQUIPMENT_GRID_TILE_SIZE;

  const minZ = -(BASE_HALF_TILES + zonesOwned * ROWS_PER_ZONE) * EQUIPMENT_GRID_TILE_SIZE;
  const maxZ = BASE_HALF_TILES * EQUIPMENT_GRID_TILE_SIZE;

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
