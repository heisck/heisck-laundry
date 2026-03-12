import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const AUTH_TIMEOUT_MESSAGE =
  "Authentication check timed out while contacting Supabase.";
const AUTH_TIMEOUT_ERROR_NAMES = new Set([
  "AbortError",
  "SUPABASE_FETCH_TIMEOUT",
]);

function isDynamicServerUsageError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  if ("digest" in error && (error as { digest?: string }).digest === "DYNAMIC_SERVER_USAGE") {
    return true;
  }

  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  return message.includes("Dynamic server usage");
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  if (error instanceof DOMException) {
    return error.name === "AbortError";
  }

  const name = "name" in error ? String((error as { name?: unknown }).name ?? "") : "";
  const message =
    "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  const code = "code" in error ? Number((error as { code?: unknown }).code) : NaN;
  const cause =
    "cause" in error ? (error as { cause?: unknown }).cause : undefined;

  return (
    AUTH_TIMEOUT_ERROR_NAMES.has(name) ||
    code === 20 ||
    message.includes("aborted") ||
    message.includes("timed out") ||
    (cause !== undefined && isAbortError(cause))
  );
}

function isSupabaseAuthTimeoutResult(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  if (isAbortError(error)) {
    return true;
  }

  const message =
    "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  const status =
    "status" in error ? String((error as { status?: unknown }).status ?? "") : "";
  return (
    message.includes("Supabase request timed out") ||
    message.includes("aborted") ||
    message.includes("timed out") ||
    status === "0"
  );
}

function isAuthTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.message === AUTH_TIMEOUT_MESSAGE;
}

export async function getOptionalUser(): Promise<User | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      if (isSupabaseAuthTimeoutResult(error)) {
        throw new Error(AUTH_TIMEOUT_MESSAGE, { cause: error });
      }
      return null;
    }
    if (!data.user) {
      return null;
    }

    return data.user;
  } catch (error) {
    if (isDynamicServerUsageError(error)) {
      throw error;
    }
    if (isSupabaseAuthTimeoutResult(error)) {
      console.error("[auth] getOptionalUser timed out", error);
      throw new Error(AUTH_TIMEOUT_MESSAGE, { cause: error });
    }
    console.error("[auth] getOptionalUser failed", error);
    return null;
  }
}

export async function requirePageUser(): Promise<User> {
  const user = await getOptionalUser();

  if (!user) {
    redirect("/admin/login");
  }

  return user;
}

export async function requireApiUser(): Promise<
  { user: User } | { response: NextResponse }
> {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return {
        response: NextResponse.json(
          { error: "Unauthorized. Please sign in." },
          { status: 401 },
        ),
      };
    }

    return { user };
  } catch (error) {
    if (isAuthTimeoutError(error)) {
      return {
        response: NextResponse.json(
          {
            error: AUTH_TIMEOUT_MESSAGE,
            code: "AUTH_TIMEOUT",
          },
          { status: 503 },
        ),
      };
    }

    throw error;
  }
}
