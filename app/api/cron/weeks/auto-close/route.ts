import { NextResponse } from "next/server";

import { handleApiError } from "@/lib/api";
import { autoCloseOverdueWeeks, SYSTEM_ACTOR_ID } from "@/lib/services/weeks";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return true;
  }

  const headerSecret = request.headers.get("x-cron-secret");
  const urlSecret = new URL(request.url).searchParams.get("secret");

  return headerSecret === secret || urlSecret === secret;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: "Unauthorized cron request." },
      { status: 401 },
    );
  }

  try {
    const closed = await autoCloseOverdueWeeks(SYSTEM_ACTOR_ID);
    return NextResponse.json({
      closedCount: closed.length,
      closed,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
