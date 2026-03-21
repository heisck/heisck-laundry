import type {
  PackageRecord,
  ProcessingWeek,
  ProcessingWeekWithReport,
} from "@/lib/types";

import {
  getCurrentProcessingWeek,
  listProcessingWeeks,
} from "@/lib/services/weeks";

import { listPackages } from "./packages";

interface AdminPackagesCacheEntry {
  cachedAt: string;
  week: ProcessingWeek | null;
  weeks: ProcessingWeekWithReport[];
  packages: PackageRecord[];
}

declare global {
  var __adminPackagesCache: AdminPackagesCacheEntry | undefined;
}

const BOOTSTRAP_CACHE_TTL_MS = 15000;
const BOOTSTRAP_SOURCE_TIMEOUT_MS = 4500;

type BootstrapSourceResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "timeout" | "error"; error?: unknown };

function serializeError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function withSoftTimeout<T>(
  task: Promise<T>,
  timeoutMs: number,
): Promise<BootstrapSourceResult<T>> {
  return new Promise((resolve) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      resolve({ ok: false, reason: "timeout" });
    }, timeoutMs);

    task
      .then((value) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);
        resolve({ ok: true, value });
      })
      .catch((error) => {
        if (settled) {
          console.warn("[packages-bootstrap] late source failure", {
            message: serializeError(error),
          });
          return;
        }

        settled = true;
        clearTimeout(timeout);
        resolve({ ok: false, reason: "error", error });
      });
  });
}

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
  weeks: ProcessingWeekWithReport[];
  packages: PackageRecord[];
  stale: boolean;
  cachedAt: string | null;
}> {
  const cached = getCachedBootstrap();
  const now = Date.now();

  if (cached && now - new Date(cached.cachedAt).getTime() <= BOOTSTRAP_CACHE_TTL_MS) {
    return {
      week: cached.week,
      weeks: cached.weeks,
      packages: cached.packages,
      stale: false,
      cachedAt: cached.cachedAt,
    };
  }

  const [weekResult, weeksResult, packagesResult] = await Promise.all([
    withSoftTimeout(getCurrentProcessingWeek(), BOOTSTRAP_SOURCE_TIMEOUT_MS),
    withSoftTimeout(listProcessingWeeks(), BOOTSTRAP_SOURCE_TIMEOUT_MS),
    withSoftTimeout(listPackages(), BOOTSTRAP_SOURCE_TIMEOUT_MS),
  ]);

  const hasFallback = !weekResult.ok || !weeksResult.ok || !packagesResult.ok;
  const week = weekResult.ok ? weekResult.value : cached?.week ?? null;
  const weeks = weeksResult.ok ? weeksResult.value : cached?.weeks ?? [];
  const packages = packagesResult.ok ? packagesResult.value : cached?.packages ?? [];
  const hasAnyData =
    weekResult.ok || weeksResult.ok || packagesResult.ok || Boolean(cached);

  if (!hasAnyData) {
    const errorSource =
      !packagesResult.ok && "error" in packagesResult && packagesResult.error
        ? packagesResult
        : !weeksResult.ok && "error" in weeksResult && weeksResult.error
          ? weeksResult
          : weekResult;

    if ("error" in errorSource && errorSource.error) {
      throw errorSource.error;
    }

    throw new Error("Package data is taking too long to load.");
  }

  const nextEntry: AdminPackagesCacheEntry = {
    cachedAt: new Date().toISOString(),
    week,
    weeks,
    packages,
  };

  setCachedBootstrap(nextEntry);

  if (hasFallback) {
    console.warn("[packages-bootstrap] serving partial or cached bootstrap data", {
      cachedAt: cached?.cachedAt ?? null,
      weekSource: weekResult.ok ? "live" : weekResult.reason,
      weeksSource: weeksResult.ok ? "live" : weeksResult.reason,
      packagesSource: packagesResult.ok ? "live" : packagesResult.reason,
      weekError:
        !weekResult.ok && weekResult.reason === "error"
          ? serializeError(weekResult.error)
          : null,
      weeksError:
        !weeksResult.ok && weeksResult.reason === "error"
          ? serializeError(weeksResult.error)
          : null,
      packagesError:
        !packagesResult.ok && packagesResult.reason === "error"
          ? serializeError(packagesResult.error)
          : null,
    });
  }

  return {
    week,
    weeks,
    packages,
    stale: hasFallback,
    cachedAt: hasFallback ? cached?.cachedAt ?? nextEntry.cachedAt : nextEntry.cachedAt,
  };
}
