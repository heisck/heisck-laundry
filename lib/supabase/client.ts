"use client";

import { createBrowserClient } from "@supabase/ssr";

function getSupabaseFetchTimeoutMs(): number {
  const raw = Number(process.env.NEXT_PUBLIC_SUPABASE_FETCH_TIMEOUT_MS ?? 6000);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 6000;
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
