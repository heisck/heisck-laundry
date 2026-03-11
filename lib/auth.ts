import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

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

export async function getOptionalUser(): Promise<User | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return null;
    }

    return data.user;
  } catch (error) {
    if (isDynamicServerUsageError(error)) {
      throw error;
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
}
