import { requirePageUser } from "@/lib/auth";
import { listPackages } from "@/lib/services/packages";
import {
  getCurrentProcessingWeek,
  getWeekOperationalSummary,
  listProcessingWeeks,
} from "@/lib/services/weeks";
import type {
  ExpressBusinessSummary,
  PackageRecord,
  PackageTypeSummary,
  ProcessingWeek,
  ProcessingWeekWithReport,
  WorkerPayoutSummary,
} from "@/lib/types";

import { SummaryPageClient } from "./summary-page-client";

export default async function AdminSummaryPage() {
  const user = await requirePageUser();

  let initialCurrentWeek: ProcessingWeek | null = null;
  let initialWeeks: ProcessingWeekWithReport[] = [];
  let initialPackages: PackageRecord[] = [];
  let initialPackageTypeSummary: PackageTypeSummary = {
    wash_only_count: 0,
    normal_wash_dry_count: 0,
    express_wash_dry_count: 0,
  };
  let initialExpressBusinessSummary: ExpressBusinessSummary = {
    express_package_count: 0,
    express_total_weight_kg: 0,
    your_express_share_ghs: 0,
    partner_express_share_ghs: 0,
    express_fixed_charge_total_ghs: 0,
  };
  let initialWorkerPayoutSummaries: WorkerPayoutSummary[] = [];
  let initialLoadReady = true;
  let initialLoadError: string | null = null;

  try {
    [initialCurrentWeek, initialWeeks, initialPackages] = await Promise.all([
      getCurrentProcessingWeek(),
      listProcessingWeeks(),
      listPackages(),
    ]);
    const operationalSummary = await getWeekOperationalSummary(
      initialCurrentWeek?.id ?? null,
    );
    initialPackageTypeSummary = operationalSummary.packageTypeSummary;
    initialExpressBusinessSummary = operationalSummary.expressBusinessSummary;
    initialWorkerPayoutSummaries = operationalSummary.workerPayoutSummaries;
  } catch (error) {
    initialLoadReady = false;
    initialLoadError =
      error instanceof Error ? error.message : "Initial summary data failed to load.";
  }

  return (
    <SummaryPageClient
      userEmail={user.email ?? "admin"}
      initialCurrentWeek={initialCurrentWeek}
      initialWeeks={initialWeeks}
      initialPackages={initialPackages}
      initialPackageTypeSummary={initialPackageTypeSummary}
      initialExpressBusinessSummary={initialExpressBusinessSummary}
      initialWorkerPayoutSummaries={initialWorkerPayoutSummaries}
      initialLoadReady={initialLoadReady}
      initialLoadError={initialLoadError}
    />
  );
}
