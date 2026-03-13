import { requirePageUser } from "@/lib/auth";

import { WeeksPageClient } from "./weeks-page-client";

export default async function AdminWeeksPage() {
  const user = await requirePageUser();

  return (
    <WeeksPageClient
      userEmail={user.email ?? "admin"}
      initialCurrentWeek={null}
      initialWeeks={[]}
      initialLoadReady={false}
      initialLoadError={null}
    />
  );
}
