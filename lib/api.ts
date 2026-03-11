import { NextResponse } from "next/server";

import { toErrorResponse } from "@/lib/app-error";

export function handleApiError(error: unknown): NextResponse {
  console.error("[api-error]", error);

  const parsed = toErrorResponse(error);
  if (process.env.NODE_ENV !== "production") {
    const message =
      error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json(
      { ...parsed.body, debug: message },
      { status: parsed.status },
    );
  }

  return NextResponse.json(parsed.body, { status: parsed.status });
}
