import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DAY_KEYS, type DayKey } from "@/constants/week";
import { DEFAULT_ROUTINE, REST_FOCUS, type DayRoutine, type ExerciseTemplate } from "@/constants/routineTemplates";
import { createDebouncedSaver, loadJSON } from "@/lib/storage";

export type Routine = Record<DayKey, DayRoutine>;
export type { DayRoutine };
export { REST_FOCUS };

const STORAGE_KEY = "@flexquest/routine";
const SAVE_DEBOUNCE_MS = 1500;

export function isWorkoutDay(day: DayRoutine): boolean {
  return day.name.trim().length > 0 && day.name.trim().toLowerCase() !== REST_FOCUS.toLowerCase();
}

function isValidExerciseTemplate(value: unknown): value is ExerciseTemplate {
  if (typeof value !== "object" || value === null) return false;
  const template = value as Record<string, unknown>;
  return (
    typeof template.name === "string" &&
    typeof template.targetSets === "number" &&
    typeof template.defaultWeight === "number" &&
    typeof template.defaultReps === "number"
  );
}

function isValidDayRoutine(value: unknown): value is DayRoutine {
  if (typeof value !== "object" || value === null) return false;
  const day = value as Record<string, unknown>;
  return (
    typeof day.name === "string" &&
    Array.isArray(day.exercises) &&
    day.exercises.every(isValidExerciseTemplate)
  );
}

function isValidRoutine(value: unknown): value is Routine {
  if (typeof value !== "object" || value === null) return false;
  const routine = value as Record<string, unknown>;
  return DAY_KEYS.every((day) => isValidDayRoutine(routine[day]));
}

type RoutineContextValue = {
  routine: Routine;
  setRoutine: (routine: Routine) => void;
};

const RoutineContext = createContext<RoutineContextValue | undefined>(undefined);

export function RoutineProvider({ children }: { children: ReactNode }) {
  const [routine, setRoutine] = useState<Routine>(DEFAULT_ROUTINE);
  const [isHydrated, setIsHydrated] = useState(false);
  const saver = useRef(createDebouncedSaver(STORAGE_KEY, SAVE_DEBOUNCE_MS)).current;

  useEffect(() => {
    let cancelled = false;

    loadJSON<Routine>(STORAGE_KEY).then((stored) => {
      if (cancelled) return;
      if (stored && isValidRoutine(stored)) {
        setRoutine(stored);
      }
      setIsHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    saver.debouncedSave(routine);
  }, [routine, isHydrated, saver]);

  const value = useMemo(() => ({ routine, setRoutine }), [routine]);

  return <RoutineContext.Provider value={value}>{children}</RoutineContext.Provider>;
}

export function useRoutine(): RoutineContextValue {
  const context = useContext(RoutineContext);
  if (!context) {
    throw new Error("useRoutine must be used within a RoutineProvider");
  }
  return context;
}
