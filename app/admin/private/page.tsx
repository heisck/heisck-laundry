import { cookies } from "next/headers";

import { requirePageUser } from "@/lib/auth";
import {
  isPrivateAccessCookieValueValid,
  PRIVATE_ACCESS_COOKIE_NAME,
} from "@/lib/private-access";
import { getPrivateDashboardData } from "@/lib/services/private-dashboard";
import type {
  ExpressBusinessSummary,
  PackageRecord,
  ProcessingWeek,
  ProcessingWeekWithReport,
} from "@/lib/types";

import { PrivateAccessGate } from "./private-access-gate";
import { PrivatePageClient } from "./private-page-client";

export default async function AdminPrivatePage() {
  const user = await requirePageUser();
  const cookieStore = await cookies();
  const privateAccessToken =
    cookieStore.get(PRIVATE_ACCESS_COOKIE_NAME)?.value ?? null;
  const hasAccess = await isPrivateAccessCookieValueValid(
    privateAccessToken ?? undefined,
    user.id,
  );

  if (!hasAccess) {
    return <PrivateAccessGate userEmail={user.email ?? "admin"} />;
  }

  let initialCurrentWeek: ProcessingWeek | null = null;
  let initialWeeks: ProcessingWeekWithReport[] = [];
  let initialPackages: PackageRecord[] = [];
  let initialExpressBusinessSummary: ExpressBusinessSummary | null = null;
  let initialLoadReady = false;
  let initialLoadError: string | null = null;

  try {
    const payload = await getPrivateDashboardData();
    initialCurrentWeek = payload.currentWeek;
    initialWeeks = payload.weeks;
    initialPackages = payload.packages;
    initialExpressBusinessSummary = payload.expressBusinessSummary;
    initialLoadReady = true;
  } catch (error) {
    initialLoadError =
      error && typeof error === "object" && "message" in error
        ? String((error as Error).message)
        : "Unable to load private totals.";
  }

  return (
    <PrivatePageClient
      userEmail={user.email ?? "admin"}
      initialCurrentWeek={initialCurrentWeek}
      initialWeeks={initialWeeks}
      initialPackages={initialPackages}
      initialExpressBusinessSummary={initialExpressBusinessSummary}
      initialLoadReady={initialLoadReady}
      initialLoadError={initialLoadError}
      initialPrivateAccessToken={privateAccessToken}
    />
  );
}
