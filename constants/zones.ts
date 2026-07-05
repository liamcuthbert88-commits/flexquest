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
