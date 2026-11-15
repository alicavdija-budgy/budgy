/**
 * Store calendar dates as ISO YYYY-MM-DD in the DEVICE'S local calendar.
 *
 * Date.toISOString().slice(0,10) is UTC and can shift the day around
 * midnight in Switzerland. Date.toLocaleDateString() depends on language
 * (en-US is MM/DD/YYYY and was parsed as DD/MM/YYYY by some selectors).
 * Labels shown to users remain locale-aware; only stored values are ISO.
 */
export function formatLocalISODate(date: Date): string {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new RangeError('Invalid calendar date');
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
