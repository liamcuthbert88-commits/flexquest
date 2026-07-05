export type QuestContext = {
  purchasedEquipmentIds: string[];
  hiredManagerIds: string[];
  cashPerSecond: number;
  /** Exercise names from the workout that was just finished; empty outside that flow. */
  finishedWorkoutExerciseNames: string[];
};

export type QuestProgress = {
  current: number;
  target: number;
};

export type Quest = {
  id: string;
  title: string;
  description: string;
  rewardCash: number;
  rewardRenown: number;
  getProgress: (ctx: QuestContext) => QuestProgress;
  isComplete: (ctx: QuestContext) => boolean;
};

export const QUEST_CATALOG: Quest[] = [
  {
    id: "iron-first-steps",
    title: "Iron First Steps",
    description: "Own 2 pieces of equipment",
    rewardCash: 500,
    rewardRenown: 50,
    getProgress: (ctx) => ({
      current: Math.min(ctx.purchasedEquipmentIds.length, 2),
      target: 2,
    }),
    isComplete: (ctx) => ctx.purchasedEquipmentIds.length >= 2,
  },
  {
    id: "cardio-king",
    title: "Cardio King",
    description: "Complete a workout containing a Treadmill activity",
    rewardCash: 300,
    rewardRenown: 30,
    getProgress: (ctx) => ({
      current: ctx.finishedWorkoutExerciseNames.some((name) =>
        name.trim().toLowerCase().includes("treadmill")
      )
        ? 1
        : 0,
      target: 1,
    }),
    isComplete: (ctx) =>
      ctx.finishedWorkoutExerciseNames.some((name) =>
        name.trim().toLowerCase().includes("treadmill")
      ),
  },
  {
    id: "passive-tycoon",
    title: "Passive Tycoon",
    description: "Reach a passive income of at least $5/sec",
    rewardCash: 1000,
    rewardRenown: 100,
    getProgress: (ctx) => ({
      current: Math.min(ctx.cashPerSecond, 5),
      target: 5,
    }),
    isComplete: (ctx) => ctx.cashPerSecond >= 5,
  },
];
