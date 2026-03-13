import type { PackageRecord, ProcessingWeek } from "@/lib/types";

import { getCurrentProcessingWeek } from "@/lib/services/weeks";

import { listPackages } from "./packages";

interface AdminPackagesCacheEntry {
  cachedAt: string;
  week: ProcessingWeek | null;
  packages: PackageRecord[];
}

declare global {
  var __adminPackagesCache: AdminPackagesCacheEntry | undefined;
}

const BOOTSTRAP_CACHE_TTL_MS = 15000;

function getCachedBootstrap(): AdminPackagesCacheEntry | null {
  return globalThis.__adminPackagesCache ?? null;
}

function setCachedBootstrap(entry: AdminPackagesCacheEntry) {
  globalThis.__adminPackagesCache = entry;
}

export function invalidateAdminPackagesCache() {
  globalThis.__adminPackagesCache = undefined;
}

export async function getAdminPackagesBootstrap(): Promise<{
  week: ProcessingWeek | null;
  packages: PackageRecord[];
  stale: boolean;
  cachedAt: string | null;
}> {
  const cached = getCachedBootstrap();
  const now = Date.now();

  if (cached && now - new Date(cached.cachedAt).getTime() <= BOOTSTRAP_CACHE_TTL_MS) {
    return {
      week: cached.week,
      packages: cached.packages,
      stale: false,
      cachedAt: cached.cachedAt,
    };
  }

  try {
    const [week, packages] = await Promise.all([
      getCurrentProcessingWeek(),
      listPackages(),
    ]);
    const nextEntry: AdminPackagesCacheEntry = {
      cachedAt: new Date().toISOString(),
      week,
      packages,
    };

    setCachedBootstrap(nextEntry);

    return {
      week,
      packages,
      stale: false,
      cachedAt: nextEntry.cachedAt,
    };
  } catch (error) {
    if (cached) {
      console.warn("[packages-bootstrap] serving stale cache after load failure", {
        cachedAt: cached.cachedAt,
        message: error instanceof Error ? error.message : "Unknown error",
      });

      return {
        week: cached.week,
        packages: cached.packages,
        stale: true,
        cachedAt: cached.cachedAt,
      };
    }

    throw error;
  }
}
