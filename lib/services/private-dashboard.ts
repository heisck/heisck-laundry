import type {
  ExpressBusinessSummary,
  PackageRecord,
  ProcessingWeek,
  ProcessingWeekWithReport,
} from "@/lib/types";

import { listPackages } from "./packages";
import {
  getCurrentProcessingWeek,
  getWeekOperationalSummary,
  listProcessingWeeks,
} from "./weeks";

export interface PrivateDashboardData {
  currentWeek: ProcessingWeek | null;
  weeks: ProcessingWeekWithReport[];
  packages: PackageRecord[];
  expressBusinessSummary: ExpressBusinessSummary;
}

export async function getPrivateDashboardData(): Promise<PrivateDashboardData> {
  const [currentWeek, weeks, packages] = await Promise.all([
    getCurrentProcessingWeek(),
    listProcessingWeeks(),
    listPackages(),
  ]);
  const operationalSummary = await getWeekOperationalSummary(currentWeek?.id ?? null);

  return {
    currentWeek,
    weeks,
    packages,
    expressBusinessSummary: operationalSummary.expressBusinessSummary,
  };
}
