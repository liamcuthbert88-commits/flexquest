export type Manager = {
  id: string;
  name: string;
  cost: number;
  cashPerSecond: number;
};

export const MANAGER_CATALOG: Manager[] = [
  {
    id: "front-desk-attendant",
    name: "Front Desk Attendant",
    cost: 400,
    cashPerSecond: 2,
  },
  {
    id: "certified-personal-trainer",
    name: "Certified Personal Trainer",
    cost: 1200,
    cashPerSecond: 8,
  },
];
