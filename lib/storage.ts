import AsyncStorage from "@react-native-async-storage/async-storage";

/** Reads and parses JSON at `key`. Returns null on a missing key, a read
 * failure, or malformed JSON — callers fall back to their own defaults. */
export async function loadJSON<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Writes `value` as JSON to `key`. Write failures are swallowed — losing a
 * single autosave isn't worth crashing the app over. */
export async function saveJSON(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // non-fatal
  }
}

/** Builds a debounced saver for `key`: rapid calls (e.g. a burst of idle-cash
 * ticks or quick purchases) coalesce into a single write `delayMs` after the
 * last call, instead of hitting disk on every state change. */
export function createDebouncedSaver(key: string, delayMs: number) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return function debouncedSave(value: unknown) {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timeoutId = null;
      saveJSON(key, value);
    }, delayMs);
  };
}
