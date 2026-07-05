export type Upgrade = {
  id: string;
  name: string;
  cost: number;
  /** Additive bonus applied to workout cash rewards, e.g. 0.2 = +20%. */
  cashBonus: number;
};

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
