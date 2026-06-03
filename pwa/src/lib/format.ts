// Locale formatting — BCP-47 fr-FR throughout the web surface (DESIGN §5).

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const DATE_FMT_SHORT = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** Parse a YYYY-MM-DD article date as a local Date (noon avoids TZ day-shift). */
function parseDate(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12);
}

/** "lundi 1 juin 2026" — long form for the article reader. */
export function formatDateLong(date: string): string {
  return DATE_FMT.format(parseDate(date));
}

/** "1 juin 2026" — compact form for cards/history. */
export function formatDateShort(date: string): string {
  return DATE_FMT_SHORT.format(parseDate(date));
}

/** Today in YYYY-MM-DD, Europe/Paris (the article document key). */
export function todayParis(): string {
  // en-CA yields YYYY-MM-DD; timeZone pins the civil date to Paris.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
}

/** "1,2 s" / "1 min 05 s" — elapsed between two ISO timestamps (supervision timeline). `endMs`
 * lets the running step tick against a live clock. Returns "—" when the start is unknown. */
export function formatDuration(startIso?: string | null, endIso?: string | null, endMs?: number): string {
  if (!startIso) return "—";
  const start = Date.parse(startIso);
  const end = endIso ? Date.parse(endIso) : (endMs ?? Date.now());
  const sec = Math.max(0, (end - start) / 1000);
  if (sec < 60) return `${sec.toFixed(1).replace(".", ",")} s`;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m} min ${String(s).padStart(2, "0")} s`;
}
