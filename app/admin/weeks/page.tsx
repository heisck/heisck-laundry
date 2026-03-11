import { requirePageUser } from "@/lib/auth";
import {
  getCurrentProcessingWeek,
  listProcessingWeeks,
} from "@/lib/services/weeks";
import type { ProcessingWeek, ProcessingWeekWithReport } from "@/lib/types";

import { WeeksPageClient } from "./weeks-page-client";

export default async function AdminWeeksPage() {
  const user = await requirePageUser();

  let initialCurrentWeek: ProcessingWeek | null = null;
  let initialWeeks: ProcessingWeekWithReport[] = [];
  let initialLoadReady = true;
  let initialLoadError: string | null = null;

  try {
    [initialCurrentWeek, initialWeeks] = await Promise.all([
      getCurrentProcessingWeek(),
      listProcessingWeeks(),
    ]);
  } catch (error) {
    initialLoadReady = false;
    initialLoadError =
      error instanceof Error ? error.message : "Initial week data failed to load.";
  }

  return (
    <WeeksPageClient
      userEmail={user.email ?? "admin"}
      initialCurrentWeek={initialCurrentWeek}
      initialWeeks={initialWeeks}
      initialLoadReady={initialLoadReady}
      initialLoadError={initialLoadError}
    />
  );
}
