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
];

/** World-space landmark NPCs wander to when visiting a zone ambiently. */
export const ZONE_LANDMARKS: Record<string, [number, number, number]> = {
  cardio_deck: [15, 0.3, 0],
  iron_vault: [-15, 0, -10],
};

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
