export type StaffMember = {
  id: string;
  name: string;
  role: string;
  cost: number;
  description: string;
  operationalZone: string;
};

/** Distinct from constants/managers.ts's flat +$/sec "Staff Managers" — each
 * of these applies a targeted, contextual bonus instead. Effects are
 * hardcoded against these specific ids in UserContext/GymNpcs rather than a
 * generic dispatcher, since there are exactly three fixed, qualitatively
 * different effects. */
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
