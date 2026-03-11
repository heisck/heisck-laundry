import { requirePageUser } from "@/lib/auth";
import { listPackages } from "@/lib/services/packages";
import { getCurrentProcessingWeek } from "@/lib/services/weeks";
import type { PackageRecord, ProcessingWeek } from "@/lib/types";

import { PackagesPageClient } from "./packages-page-client";

export default async function AdminPackagesPage() {
  const user = await requirePageUser();

  let initialCurrentWeek: ProcessingWeek | null = null;
  let initialPackages: PackageRecord[] = [];
  let initialLoadReady = true;
  let initialLoadError: string | null = null;

  try {
    [initialCurrentWeek, initialPackages] = await Promise.all([
      getCurrentProcessingWeek(),
      listPackages(),
    ]);
  } catch (error) {
    initialLoadReady = false;
    initialLoadError =
      error instanceof Error
        ? error.message
        : "Initial package data failed to load.";
  }

  return (
    <PackagesPageClient
      userEmail={user.email ?? "admin"}
      initialCurrentWeek={initialCurrentWeek}
      initialPackages={initialPackages}
      initialLoadReady={initialLoadReady}
      initialLoadError={initialLoadError}
    />
  );
}
