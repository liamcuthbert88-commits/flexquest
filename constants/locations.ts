export type Location = {
  id: string;
  name: string;
  multiplier: number;
  requiredLevel: number;
  /** The prestigeCount you'll have AFTER resetting into this location. */
  requiredPrestige: number;
};

export const LOCATION_CATALOG: Location[] = [
  {
    id: "garage",
    name: "Iron Garage",
    multiplier: 1,
    requiredLevel: 1,
    requiredPrestige: 0,
  },
  {
    id: "warehouse",
    name: "Metro Warehouse",
    multiplier: 2.5,
    requiredLevel: 5,
    requiredPrestige: 1,
  },
  {
    id: "plaza",
    name: "Titanium Plaza",
    multiplier: 5,
    requiredLevel: 10,
    requiredPrestige: 2,
  },
];

export function getLocation(locationId: string): Location {
  const location = LOCATION_CATALOG.find((entry) => entry.id === locationId);
  return location ?? LOCATION_CATALOG[0];
}
