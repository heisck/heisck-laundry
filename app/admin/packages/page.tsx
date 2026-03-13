import { requirePageUser } from "@/lib/auth";

import { PackagesPageClient } from "./packages-page-client";

export default async function AdminPackagesPage() {
  const user = await requirePageUser();

  return (
    <PackagesPageClient
      userEmail={user.email ?? "admin"}
      initialCurrentWeek={null}
      initialPackages={[]}
      initialLoadReady={false}
      initialLoadError={null}
    />
  );
}
