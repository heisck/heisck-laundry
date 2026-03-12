"use client";

import { createBrowserClient } from "@supabase/ssr";

const MIN_SUPABASE_FETCH_TIMEOUT_MS = 10000;

function readEnvNumber(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().replace(/^['"]|['"]$/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function getSupabaseFetchTimeoutMs(): number {
  const raw = readEnvNumber(process.env.NEXT_PUBLIC_SUPABASE_FETCH_TIMEOUT_MS);
  return raw !== null && raw > 0
    ? Math.max(Math.floor(raw), MIN_SUPABASE_FETCH_TIMEOUT_MS)
    : MIN_SUPABASE_FETCH_TIMEOUT_MS;
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getSupabaseFetchTimeoutMs());

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be configured.",
    );
  }

  return createBrowserClient(url, anonKey, {
    global: {
      fetch: fetchWithTimeout,
    },
  });
}
