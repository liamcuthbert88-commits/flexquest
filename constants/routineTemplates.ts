import type { DayKey } from "@/constants/week";

export type ExerciseTemplate = {
  name: string;
  targetSets: number;
  defaultWeight: number;
  defaultReps: number;
};

export type DayRoutine = {
  name: string;
  exercises: ExerciseTemplate[];
};

export const REST_FOCUS = "Rest";

const PUSH_DAY_EXERCISES: ExerciseTemplate[] = [
  { name: "Bench Press", targetSets: 3, defaultWeight: 0, defaultReps: 8 },
  { name: "Overhead Press", targetSets: 3, defaultWeight: 0, defaultReps: 8 },
];

const PULL_DAY_EXERCISES: ExerciseTemplate[] = [
  { name: "Pull-ups", targetSets: 3, defaultWeight: 0, defaultReps: 8 },
  { name: "Barbell Rows", targetSets: 3, defaultWeight: 0, defaultReps: 8 },
];

const LEGS_DAY_EXERCISES: ExerciseTemplate[] = [
  { name: "Squats", targetSets: 3, defaultWeight: 0, defaultReps: 8 },
  { name: "Romanian Deadlifts", targetSets: 3, defaultWeight: 0, defaultReps: 8 },
];

/** Exercises that come bundled with each preset chip in the routine editor. */
export const EXERCISE_TEMPLATES_BY_PRESET: Record<string, ExerciseTemplate[]> = {
  Push: PUSH_DAY_EXERCISES,
  Pull: PULL_DAY_EXERCISES,
  Legs: LEGS_DAY_EXERCISES,
};

function restDay(): DayRoutine {
  return { name: REST_FOCUS, exercises: [] };
}

function presetDay(preset: string): DayRoutine {
  return { name: preset, exercises: EXERCISE_TEMPLATES_BY_PRESET[preset] ?? [] };
}

export const DEFAULT_ROUTINE: Record<DayKey, DayRoutine> = {
  monday: presetDay("Push"),
  tuesday: restDay(),
  wednesday: presetDay("Pull"),
  thursday: restDay(),
  friday: presetDay("Legs"),
  saturday: restDay(),
  sunday: restDay(),
};
