import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api";
import {
  isPrivateAccessCookieValueValid,
  PRIVATE_ACCESS_COOKIE_NAME,
} from "@/lib/private-access";
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

  const cookieStore = await cookies();
  const hasPrivateAccess = await isPrivateAccessCookieValueValid(
    cookieStore.get(PRIVATE_ACCESS_COOKIE_NAME)?.value,
  );

  if (!hasPrivateAccess) {
    return NextResponse.json(
      { error: "Private access is required for exports." },
      { status: 403 },
    );
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
