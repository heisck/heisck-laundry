import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api";
import { listProcessingWeeks } from "@/lib/services/weeks";

export async function GET() {
  const auth = await requireApiUser();
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const weeks = await listProcessingWeeks();
    return NextResponse.json({ weeks });
  } catch (error) {
    return handleApiError(error);
  }
}
