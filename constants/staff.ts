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
  {
    id: "tech_alex",
    name: "Alex",
    role: "Equipment Technician",
    cost: 30000,
    description: "+10% cash/sec from all equipment",
    operationalZone: "All Zones",
  },
  {
    id: "marketer_jess",
    name: "Jess",
    role: "Marketing Specialist",
    cost: 60000,
    description: "+20% cash from workout taps",
    operationalZone: "All Zones",
  },
  {
    id: "trainer_mike",
    name: "Mike",
    role: "Head Trainer",
    cost: 100000,
    description: "+15% cash from equipment and workout taps",
    operationalZone: "All Zones",
  },
];

export const SMOOTHIE_BAR_RECHARGE_CASH = 5;
export const CLERK_RECHARGE_MULTIPLIER = 1.5;
export const TRAINER_IRON_VAULT_MULTIPLIER = 2;
export const JANITOR_SPEED_MULTIPLIER = 1.05;
/** The 3 new general-purpose staff bonuses below are additive with each
 * other (and with UPGRADE_CATALOG's cashBonus sum) - e.g. hiring both
 * tech_alex and trainer_mike gives +25% equipment income, not a
 * multiplied stack. This deliberately differs from TRAINER_IRON_VAULT_
 * MULTIPLIER above, which is a multiplicative, zone-locked bonus scoped
 * to exactly 2 catalog items - these three are broad percentage bonuses
 * across the whole facility instead, so they follow the additive
 * pattern UPGRADE_CATALOG's cashBonus already established. */
export const EQUIPMENT_TECHNICIAN_BONUS = 0.1;
export const MARKETING_SPECIALIST_BONUS = 0.2;
export const HEAD_TRAINER_EQUIPMENT_BONUS = 0.15;
export const HEAD_TRAINER_WORKOUT_BONUS = 0.15;
