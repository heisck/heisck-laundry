import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { handleApiError } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import {
  isPrivateAccessCookieValueValid,
  PRIVATE_ACCESS_COOKIE_NAME,
} from "@/lib/private-access";
import { listPackages } from "@/lib/services/packages";
import {
  getCurrentProcessingWeek,
  getWeekOperationalSummary,
  listProcessingWeeks,
} from "@/lib/services/weeks";

export async function GET() {
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
      { error: "Private access is required." },
      { status: 403 },
    );
  }

  try {
    const [currentWeek, weeks, packages] = await Promise.all([
      getCurrentProcessingWeek(),
      listProcessingWeeks(),
      listPackages(),
    ]);
    const operationalSummary = await getWeekOperationalSummary(currentWeek?.id ?? null);

    return NextResponse.json({
      currentWeek,
      weeks,
      packages,
      expressBusinessSummary: operationalSummary.expressBusinessSummary,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
