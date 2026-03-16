import { PackagesPageClient } from "../../packages/packages-page-client";

export default function AdminPackagesPage() {
  return (
    <PackagesPageClient
      initialCurrentWeek={null}
      initialPackages={[]}
      initialLoadReady={false}
      initialLoadError={null}
    />
  );
}
