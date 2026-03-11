function stripPhone(value: string): string {
  return value.replace(/[^\d+]/g, "");
}

export function normalizeGhanaPhone(raw: string): string | null {
  const cleaned = stripPhone(raw);

  if (/^\+233\d{9}$/.test(cleaned)) {
    return cleaned;
  }

  if (/^233\d{9}$/.test(cleaned)) {
    return `+${cleaned}`;
  }

  if (/^0\d{9}$/.test(cleaned)) {
    return `+233${cleaned.slice(1)}`;
  }

  return null;
}

export function dedupePhones(primary: string, secondary?: string | null): string[] {
  if (!secondary) {
    return [primary];
  }

  return Array.from(new Set([primary, secondary]));
}
