export const ACCRA_TIME_ZONE = "Africa/Accra";

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function formatAccraDateTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: ACCRA_TIME_ZONE,
  }).format(date);
}

export function toIso(value: string | Date): string {
  return (typeof value === "string" ? new Date(value) : value).toISOString();
}
