/** Dates au format AAAA-MM-JJ, calculées en UTC pour éviter les surprises de fuseau. */

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(iso: string, days: number): string {
  const d = parseIso(iso);
  d.setUTCDate(d.getUTCDate() + Math.round(days));
  return isoDate(d);
}

export function addYears(iso: string, years: number): string {
  const d = parseIso(iso);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return isoDate(d);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((parseIso(toIso).getTime() - parseIso(fromIso).getTime()) / 86_400_000);
}

/** Âge révolu à une date donnée. */
export function ageAt(birthIso: string, dateIso: string): number {
  const b = parseIso(birthIso);
  const d = parseIso(dateIso);
  let age = d.getUTCFullYear() - b.getUTCFullYear();
  if (d.getUTCMonth() < b.getUTCMonth() || (d.getUTCMonth() === b.getUTCMonth() && d.getUTCDate() < b.getUTCDate())) age -= 1;
  return age;
}

export function formatDate(iso: string): string {
  return parseIso(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** « octobre 2026 ». */
export function monthLabel(iso: string): string {
  return parseIso(iso).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
}
