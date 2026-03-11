import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api";
import { buildWeekCsv } from "@/lib/services/reports";
import { getWeekSnapshot } from "@/lib/services/weeks";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: Params) {
  const auth = await requireApiUser();
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const { id } = await params;
    const snapshot = await getWeekSnapshot(id);
    const csv = buildWeekCsv(snapshot);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="week-${snapshot.week.label.replace(/\s+/g, "-").toLowerCase()}.csv"`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
