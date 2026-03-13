import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api";
import {
  getCurrentProcessingWeek,
  listProcessingWeeks,
} from "@/lib/services/weeks";

export async function GET() {
  const auth = await requireApiUser();
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const [week, weeks] = await Promise.all([
      getCurrentProcessingWeek(),
      listProcessingWeeks(),
    ]);

    const remainingMs = week
      ? Math.max(0, new Date(week.end_at).getTime() - Date.now())
      : 0;

    return NextResponse.json({
      week,
      weeks,
      remainingSeconds: Math.floor(remainingMs / 1000),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
