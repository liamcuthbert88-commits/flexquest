// Single source of truth for "what day is it" so the calendar bar, the
// workout card, and the routine modal never disagree with each other.

export const DAY_KEYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type DayKey = (typeof DAY_KEYS)[number];

export const DAY_LABELS: Record<DayKey, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

export const DAY_LETTERS: Record<DayKey, string> = {
  monday: "M",
  tuesday: "T",
  wednesday: "W",
  thursday: "T",
  friday: "F",
  saturday: "S",
  sunday: "S",
};

/** JS's `Date#getDay()` is 0 = Sunday; we want 0 = Monday to match DAY_KEYS. */
export function getDayKeyForDate(date: Date): DayKey {
  const index = (date.getDay() + 6) % 7;
  return DAY_KEYS[index];
}

export function getTodayKey(): DayKey {
  return getDayKeyForDate(new Date());
}
