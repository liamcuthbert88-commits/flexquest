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
