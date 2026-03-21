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

export function getActivePackages(packages: PackageRecord[]): PackageRecord[] {
  return packages.filter((item) => item.week_status === "ACTIVE");
}

export function buildDashboardMetrics(
  weeks: ProcessingWeekWithReport[],
  packages: PackageRecord[],
): DashboardMetrics {
  const closedWeeks = weeks.filter((week) => week.status === "CLOSED");
  const activePackages = getActivePackages(packages);
  const activePackageCount = activePackages.length;
  const activeWeight = activePackages.reduce((sum, item) => sum + item.total_weight_kg, 0);
  const activeRevenue = activePackages.reduce((sum, item) => sum + item.total_price_ghs, 0);

  return {
    closedWeekCount: closedWeeks.length,
    totalPackages: activePackageCount,
    totalWeight: activeWeight,
    totalRevenue: activeRevenue,
    activePackageCount,
    activeWeight,
    activeRevenue,
  };
}
