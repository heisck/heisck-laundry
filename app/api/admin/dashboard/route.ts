import { NextResponse } from "next/server";
import { z } from "zod";

import { requireApiUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api";
import { listPackages } from "@/lib/services/packages";
import {
  getCurrentProcessingWeek,
  getWeekOperationalSummary,
  listProcessingWeeks,
} from "@/lib/services/weeks";
import { PACKAGE_STATUSES } from "@/lib/types";

const statusSchema = z.enum(PACKAGE_STATUSES);

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("q")?.trim() || undefined;
    const statusInput = searchParams.get("status");
    const status = statusInput ? statusSchema.parse(statusInput) : undefined;

    const [currentWeek, weeks, packages] = await Promise.all([
      getCurrentProcessingWeek(),
      listProcessingWeeks(),
      listPackages({ search, status }),
    ]);
    const operationalSummary = await getWeekOperationalSummary(currentWeek?.id ?? null);

    const remainingMs = currentWeek
      ? Math.max(0, new Date(currentWeek.end_at).getTime() - Date.now())
      : 0;

    return NextResponse.json({
      currentWeek,
      remainingSeconds: Math.floor(remainingMs / 1000),
      weeks,
      packages,
      packageTypeSummary: operationalSummary.packageTypeSummary,
      expressBusinessSummary: operationalSummary.expressBusinessSummary,
      workerPayoutSummaries: operationalSummary.workerPayoutSummaries,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
