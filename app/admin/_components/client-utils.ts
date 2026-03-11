"use client";

export function cn(...inputs: Array<string | false | null | undefined>): string {
  return inputs.filter(Boolean).join(" ");
}

export async function parseApiResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const baseError =
      typeof payload.error === "string"
        ? payload.error
        : `Request failed (${response.status})`;
    const debug =
      payload && typeof payload === "object" && "debug" in payload
        ? String(payload.debug)
        : "";
    throw new Error(`${baseError}${debug ? ` ${debug}` : ""}`.trim());
  }

  return payload as T;
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = 10000,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(
        "Request timed out while contacting the server. Check database connectivity and env settings.",
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function toLocalDatetimeValue(date: Date): string {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

export function formatAccraClockTime(value: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Accra",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
}

export function getAdminInitials(email: string): string {
  const base = email.split("@")[0]?.replace(/[^a-zA-Z0-9]/g, "") || "AD";
  return base.slice(0, 2).toUpperCase();
}
