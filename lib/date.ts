/** Local-calendar-day key, e.g. "2026-07-06". Deliberately built from
 * getFullYear()/getMonth()/getDate() rather than toLocaleDateString(),
 * whose locale-dependent format isn't guaranteed stable across Hermes/JSC. */
export function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
