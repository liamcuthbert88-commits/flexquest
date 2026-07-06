export type ChallengeTier = "easy" | "medium" | "hard" | "elite";

export type Challenge = {
  id: string;
  tier: ChallengeTier;
  title: string;
  description: string;
  rewardCash: number;
  rewardRenown: number;
};

export const CHALLENGE_CATALOG: Challenge[] = [
  // Easy
  { id: "pushup-starter", tier: "easy", title: "Push-Up Starter", description: "Do 10 push-ups", rewardCash: 50, rewardRenown: 5 },
  { id: "morning-mile", tier: "easy", title: "Morning Mile", description: "Take a 10-minute walk", rewardCash: 50, rewardRenown: 5 },
  { id: "hydration-check", tier: "easy", title: "Hydration Check", description: "Drink 2 liters of water today", rewardCash: 50, rewardRenown: 5 },
  // Medium
  { id: "step-it-up", tier: "medium", title: "Step It Up", description: "Walk 5,000 steps", rewardCash: 150, rewardRenown: 15 },
  { id: "core-crusher", tier: "medium", title: "Core Crusher", description: "Do 30 sit-ups", rewardCash: 150, rewardRenown: 15 },
  { id: "half-hour-hustle", tier: "medium", title: "Half-Hour Hustle", description: "Complete a 20-minute workout session", rewardCash: 150, rewardRenown: 15 },
  // Hard
  { id: "10k-strider", tier: "hard", title: "10K Strider", description: "Walk 10,000 steps", rewardCash: 400, rewardRenown: 40 },
  { id: "pushup-half-century", tier: "hard", title: "Push-Up Half-Century", description: "Do 50 push-ups", rewardCash: 400, rewardRenown: 40 },
  { id: "sweat-session", tier: "hard", title: "Sweat Session", description: "Complete a 45-minute workout", rewardCash: 400, rewardRenown: 40 },
  // Elite
  { id: "step-master", tier: "elite", title: "Step Master", description: "Walk 15,000 steps", rewardCash: 1000, rewardRenown: 100 },
  { id: "century-club", tier: "elite", title: "Century Club", description: "Do 100 push-ups", rewardCash: 1000, rewardRenown: 100 },
  { id: "iron-hour", tier: "elite", title: "Iron Hour", description: "Complete a 60-minute workout or run 5K", rewardCash: 1000, rewardRenown: 100 },
];

export const CHALLENGE_TIERS: ChallengeTier[] = ["easy", "medium", "hard", "elite"];
