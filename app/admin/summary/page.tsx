import { requirePageUser } from "@/lib/auth";
import type {
  ExpressBusinessSummary,
  PackageTypeSummary,
  WorkerPayoutSummary,
} from "@/lib/types";

import { SummaryPageClient } from "./summary-page-client";

export default async function AdminSummaryPage() {
  const user = await requirePageUser();
  const initialPackageTypeSummary: PackageTypeSummary = {
    wash_only_count: 0,
    normal_wash_dry_count: 0,
    express_wash_dry_count: 0,
  };
  const initialExpressBusinessSummary: ExpressBusinessSummary = {
    express_package_count: 0,
    express_total_weight_kg: 0,
    your_express_share_ghs: 0,
    partner_express_share_ghs: 0,
    express_fixed_charge_total_ghs: 0,
  };
  const initialWorkerPayoutSummaries: WorkerPayoutSummary[] = [];

  return (
    <SummaryPageClient
      userEmail={user.email ?? "admin"}
      initialCurrentWeek={null}
      initialWeeks={[]}
      initialPackages={[]}
      initialPackageTypeSummary={initialPackageTypeSummary}
      initialExpressBusinessSummary={initialExpressBusinessSummary}
      initialWorkerPayoutSummaries={initialWorkerPayoutSummaries}
      initialLoadReady={false}
      initialLoadError={null}
    />
  );
}
