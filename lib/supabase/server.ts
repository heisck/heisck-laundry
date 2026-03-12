import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const MIN_SUPABASE_FETCH_TIMEOUT_MS = 10000;
const SUPABASE_FETCH_TIMEOUT_ERROR = "SUPABASE_FETCH_TIMEOUT";

function readEnvNumber(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().replace(/^['"]|['"]$/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function getSupabaseFetchTimeoutMs(): number {
  const raw = readEnvNumber(process.env.SUPABASE_FETCH_TIMEOUT_MS);
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
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      const timeoutError = new Error("Supabase request timed out.", {
        cause: error,
      });
      timeoutError.name = SUPABASE_FETCH_TIMEOUT_ERROR;
      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function getSupabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be configured.",
    );
  }

  return { url, anonKey };
}

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseEnv();

  return createServerClient(url, anonKey, {
    global: {
      fetch: fetchWithTimeout,
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // Setting cookies can throw in some server component contexts.
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // No-op: session refresh can continue on the next request.
        }
      },
    },
  });
}
