import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api";
import { getActivePackages } from "@/lib/dashboard-metrics";
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

  try {
    const [currentWeek, weeks, packages] = await Promise.all([
      getCurrentProcessingWeek(),
      listProcessingWeeks(),
      listPackages(),
    ]);
    const activePackages = getActivePackages(packages);
    const operationalSummary = await getWeekOperationalSummary(currentWeek?.id ?? null);

    return NextResponse.json({
      currentWeek,
      weeks: weeks.map((week) => ({
        ...week,
        total_weight_kg: null,
        total_price_ghs: null,
      })),
      activePackageCount: activePackages.length,
      expressPackageCount: operationalSummary.expressBusinessSummary.express_package_count,
      packageTypeSummary: operationalSummary.packageTypeSummary,
      workerPayoutSummaries: operationalSummary.workerPayoutSummaries,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
