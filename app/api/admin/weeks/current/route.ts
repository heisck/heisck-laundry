import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api";
import { getCurrentProcessingWeek } from "@/lib/services/weeks";

export async function GET() {
  const auth = await requireApiUser();
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const week = await getCurrentProcessingWeek();
    const remainingMs = week
      ? Math.max(0, new Date(week.end_at).getTime() - Date.now())
      : 0;

    return NextResponse.json({
      week,
      remainingSeconds: Math.floor(remainingMs / 1000),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
