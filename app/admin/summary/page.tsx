import { requirePageUser } from "@/lib/auth";
import { listPackages } from "@/lib/services/packages";
import {
  getCurrentProcessingWeek,
  listProcessingWeeks,
} from "@/lib/services/weeks";
import type {
  PackageRecord,
  ProcessingWeek,
  ProcessingWeekWithReport,
} from "@/lib/types";

import { SummaryPageClient } from "./summary-page-client";

export default async function AdminSummaryPage() {
  const user = await requirePageUser();

  let initialCurrentWeek: ProcessingWeek | null = null;
  let initialWeeks: ProcessingWeekWithReport[] = [];
  let initialPackages: PackageRecord[] = [];
  let initialLoadReady = true;
  let initialLoadError: string | null = null;

  try {
    [initialCurrentWeek, initialWeeks, initialPackages] = await Promise.all([
      getCurrentProcessingWeek(),
      listProcessingWeeks(),
      listPackages(),
    ]);
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
      initialLoadReady={initialLoadReady}
      initialLoadError={initialLoadError}
    />
  );
}
