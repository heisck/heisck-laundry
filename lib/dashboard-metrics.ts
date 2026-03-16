import type { PackageRecord, ProcessingWeekWithReport } from "./types";

export interface DashboardMetrics {
  closedWeekCount: number;
  totalPackages: number;
  totalWeight: number;
  totalRevenue: number;
  activePackageCount: number;
  activeWeight: number;
  activeRevenue: number;
}

export function buildDashboardMetrics(
  weeks: ProcessingWeekWithReport[],
  packages: PackageRecord[],
): DashboardMetrics {
  const closedWeeks = weeks.filter((week) => week.status === "CLOSED");
  const closedPackageCount = closedWeeks.reduce(
    (sum, week) => sum + (week.package_count ?? 0),
    0,
  );
  const closedWeight = closedWeeks.reduce(
    (sum, week) => sum + (week.total_weight_kg ?? 0),
    0,
  );
  const closedRevenue = closedWeeks.reduce(
    (sum, week) => sum + (week.total_price_ghs ?? 0),
    0,
  );
  const activePackageCount = packages.length;
  const activeWeight = packages.reduce((sum, item) => sum + item.total_weight_kg, 0);
  const activeRevenue = packages.reduce((sum, item) => sum + item.total_price_ghs, 0);

  return {
    closedWeekCount: closedWeeks.length,
    totalPackages: closedPackageCount + activePackageCount,
    totalWeight: closedWeight + activeWeight,
    totalRevenue: closedRevenue + activeRevenue,
    activePackageCount,
    activeWeight,
    activeRevenue,
  };
}
