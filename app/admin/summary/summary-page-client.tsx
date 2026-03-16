"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { getWorkerLabel } from "@/lib/payouts";
import { formatAccraDateTime } from "@/lib/time";
import type {
  PackageTypeSummary,
  ProcessingWeek,
  ProcessingWeekWithReport,
  WorkerPayoutSummary,
} from "@/lib/types";

import { fetchWithTimeout, parseApiResponse } from "../_components/client-utils";
import { Toaster, useToasts } from "../_components/toaster";
import { useWorkspaceShell } from "../_components/workspace-shell-frame";

interface SummaryPageClientProps {
  initialCurrentWeek: ProcessingWeek | null;
  initialWeeks: ProcessingWeekWithReport[];
  initialActivePackageCount: number;
  initialExpressPackageCount: number;
  initialPackageTypeSummary: PackageTypeSummary;
  initialWorkerPayoutSummaries: WorkerPayoutSummary[];
  initialLoadReady: boolean;
  initialLoadError: string | null;
}

interface DashboardPayload {
  currentWeek: ProcessingWeek | null;
  weeks: ProcessingWeekWithReport[];
  activePackageCount: number;
  expressPackageCount: number;
  packageTypeSummary: PackageTypeSummary;
  workerPayoutSummaries: WorkerPayoutSummary[];
}

const SUMMARY_DASHBOARD_STORAGE_KEY = "heisck.admin.summary.dashboard";

function getWeekRangeLabel(week: ProcessingWeekWithReport): string {
  return `${formatAccraDateTime(week.start_at)} - ${formatAccraDateTime(week.end_at)}`;
}

function getWeekRangeCompactLabel(week: ProcessingWeekWithReport): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Accra",
    month: "short",
    day: "numeric",
  });

  return `${formatter.format(new Date(week.start_at))} - ${formatter.format(new Date(week.end_at))}`;
}

function weekStatusPill(status: ProcessingWeekWithReport["status"]): string {
  if (status === "ACTIVE") {
    return "bg-emerald-100 text-emerald-700";
  }

  return "bg-slate-100 text-slate-700";
}

function readSummaryDashboardCache(): DashboardPayload | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(SUMMARY_DASHBOARD_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as DashboardPayload;
    if (!parsed || !Array.isArray(parsed.weeks)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function writeSummaryDashboardCache(payload: DashboardPayload) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      SUMMARY_DASHBOARD_STORAGE_KEY,
      JSON.stringify(payload),
    );
  } catch {
    // Best effort only.
  }
}

function SkeletonSummaryPage() {
  return (
    <>
      <section className="grid gap-4">
        <div className="skeleton-card h-[220px]" />
        <div className="skeleton-card h-[440px]" />
      </section>
    </>
  );
}

export function SummaryPageClient({
  initialCurrentWeek,
  initialWeeks,
  initialActivePackageCount,
  initialExpressPackageCount,
  initialPackageTypeSummary,
  initialWorkerPayoutSummaries,
  initialLoadReady,
  initialLoadError,
}: SummaryPageClientProps) {
  const { toasts, dismissToast, pushToast } = useToasts();

  const [, setCurrentWeek] = useState<ProcessingWeek | null>(
    initialCurrentWeek,
  );
  const [weeks, setWeeks] = useState<ProcessingWeekWithReport[]>(initialWeeks);
  const [activePackageCount, setActivePackageCount] = useState(
    initialActivePackageCount,
  );
  const [, setExpressPackageCount] = useState(
    initialExpressPackageCount,
  );
  const [packageTypeSummary, setPackageTypeSummary] =
    useState<PackageTypeSummary>(initialPackageTypeSummary);
  const [workerPayoutSummaries, setWorkerPayoutSummaries] =
    useState<WorkerPayoutSummary[]>(initialWorkerPayoutSummaries);
  const [loading, setLoading] = useState(!initialLoadReady);
  const [refreshing, setRefreshing] = useState(false);
  const initRef = useRef(false);

  const closedWeeks = useMemo(
    () => weeks.filter((week) => week.status === "CLOSED"),
    [weeks],
  );

  const summary = useMemo(() => {
    const closedPackageCount = closedWeeks.reduce(
      (sum, week) => sum + (week.package_count ?? 0),
      0,
    );

    return {
      closedWeekCount: closedWeeks.length,
      totalPackages: closedPackageCount + activePackageCount,
      activePackageCount,
    };
  }, [activePackageCount, closedWeeks]);

  useWorkspaceShell({
    packageCount: summary.totalPackages,
    refreshing,
    onRefresh: () => void refresh(),
  });

  async function loadDashboard() {
    const response = await fetchWithTimeout("/api/admin/dashboard", {
      cache: "no-store",
    });
    const payload = await parseApiResponse<DashboardPayload>(response);
    writeSummaryDashboardCache(payload);
    setCurrentWeek(payload.currentWeek);
    setWeeks(payload.weeks);
    setActivePackageCount(payload.activePackageCount);
    setExpressPackageCount(payload.expressPackageCount);
    setPackageTypeSummary(payload.packageTypeSummary);
    setWorkerPayoutSummaries(payload.workerPayoutSummaries);
  }

  async function refresh(showLoader = false) {
    if (showLoader) {
      setLoading(true);
    }
    setRefreshing(true);
    try {
      await loadDashboard();
    } catch (error) {
      pushToast(
        "error",
        "Unable to refresh summary",
        error instanceof Error ? error.message : "Unknown error",
      );
    } finally {
      setRefreshing(false);
      if (showLoader) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    if (initRef.current) {
      return;
    }
    initRef.current = true;

    if (initialLoadError) {
      pushToast("error", "Initial load failed", initialLoadError);
    }

    if (!initialLoadReady) {
      const cached = readSummaryDashboardCache();
      if (cached) {
        setCurrentWeek(cached.currentWeek);
        setWeeks(cached.weeks);
        setActivePackageCount(cached.activePackageCount);
        setExpressPackageCount(cached.expressPackageCount);
        setPackageTypeSummary(cached.packageTypeSummary);
        setWorkerPayoutSummaries(cached.workerPayoutSummaries);
        setLoading(false);
        pushToast(
          "info",
          "Loaded saved summary",
          "Refreshing live data in the background.",
        );
        void refresh(false);
        return;
      }

      void refresh(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLoadError, initialLoadReady]);

  if (loading) {
    return <SkeletonSummaryPage />;
  }

  return (
    <>
      <Toaster toasts={toasts} dismiss={dismissToast} />

      <section className="mb-5">
        <article className="glass-card overflow-hidden">
          <div className="border-b border-slate-200/70 px-5 py-4">
            <p className="label-kicker">Package Type Breakdown</p>
          </div>
          <div className="grid grid-cols-3 gap-2 p-3 sm:gap-4 sm:p-5">
            <div className="metric-tile px-3 py-3 sm:p-4">
              <p className="label-kicker">
                <span className="sm:hidden">Wash</span>
                <span className="hidden sm:inline">Wash Only</span>
              </p>
              <p className="font-display mt-2 text-xl font-semibold text-slate-950 sm:text-2xl">
                {packageTypeSummary.wash_only_count}
              </p>
            </div>
            <div className="metric-tile px-3 py-3 sm:p-4">
              <p className="label-kicker">Normal</p>
              <p className="font-display mt-2 text-xl font-semibold text-slate-950 sm:text-2xl">
                {packageTypeSummary.normal_wash_dry_count}
              </p>
            </div>
            <div className="metric-tile px-3 py-3 sm:p-4">
              <p className="label-kicker">Express</p>
              <p className="font-display mt-2 text-xl font-semibold text-slate-950 sm:text-2xl">
                {packageTypeSummary.express_wash_dry_count}
              </p>
            </div>
          </div>
        </article>
      </section>

      <section className="mb-5 glass-card overflow-hidden">
        <div className="border-b border-slate-200/70 px-5 py-4">
          <p className="label-kicker">Worker Payout Tracker</p>
        </div>
        <div className="space-y-4 p-4 md:hidden">
          {workerPayoutSummaries.map((summaryRow) => (
            <article key={summaryRow.worker_name} className="metric-tile p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-display text-xl font-semibold text-slate-950">
                    {getWorkerLabel(summaryRow.worker_name)}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    Grand total: GHS {summaryRow.grand_total_ghs.toFixed(2)}
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="surface-subtle px-4 py-3">
                  <p className="label-kicker">Intake</p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">
                    {summaryRow.intake_count}
                  </p>
                </div>
                <div className="surface-subtle px-4 py-3">
                  <p className="label-kicker">Washing</p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">
                    {summaryRow.washing_count}
                  </p>
                </div>
                <div className="surface-subtle px-4 py-3">
                  <p className="label-kicker">Drying Downstairs</p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">
                    {summaryRow.drying_downstairs_count}
                  </p>
                </div>
                <div className="surface-subtle px-4 py-3">
                  <p className="label-kicker">Removed From Line</p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">
                    {summaryRow.removed_from_line_count}
                  </p>
                </div>
                <div className="surface-subtle px-4 py-3">
                  <p className="label-kicker">Folded</p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">
                    {summaryRow.folded_count}
                  </p>
                </div>
                <div className="surface-subtle px-4 py-3">
                  <p className="label-kicker">Dryer Operation</p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">
                    {summaryRow.dryer_operation_count}
                  </p>
                </div>
                <div className="surface-subtle px-4 py-3">
                  <p className="label-kicker">Express Remove + Fold</p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">
                    {summaryRow.removed_and_folded_from_dryer_count}
                  </p>
                </div>
                <div className="surface-subtle px-4 py-3">
                  <p className="label-kicker">Your Side</p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">
                    GHS {summaryRow.your_side_total_ghs.toFixed(2)}
                  </p>
                </div>
                <div className="surface-subtle px-4 py-3">
                  <p className="label-kicker">Partner Side</p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">
                    GHS {summaryRow.partner_side_total_ghs.toFixed(2)}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="table-wrap hidden md:block">
          <table className="data-table min-w-[1120px]">
            <thead>
              <tr className="text-left">
                <th>Worker</th>
                <th>Intake</th>
                <th>Washing</th>
                <th>Drying Downstairs</th>
                <th>Removed From Line</th>
                <th>Folded</th>
                <th>Dryer Operation</th>
                <th>Express Remove + Fold</th>
                <th>Your Side</th>
                <th>Partner Side</th>
                <th>Grand Total</th>
              </tr>
            </thead>
            <tbody>
              {workerPayoutSummaries.map((summaryRow) => (
                <tr key={summaryRow.worker_name}>
                  <td className="font-medium text-slate-900">
                    {getWorkerLabel(summaryRow.worker_name)}
                  </td>
                  <td>{summaryRow.intake_count}</td>
                  <td>{summaryRow.washing_count}</td>
                  <td>{summaryRow.drying_downstairs_count}</td>
                  <td>{summaryRow.removed_from_line_count}</td>
                  <td>{summaryRow.folded_count}</td>
                  <td>{summaryRow.dryer_operation_count}</td>
                  <td>{summaryRow.removed_and_folded_from_dryer_count}</td>
                  <td>GHS {summaryRow.your_side_total_ghs.toFixed(2)}</td>
                  <td>GHS {summaryRow.partner_side_total_ghs.toFixed(2)}</td>
                  <td className="font-semibold text-slate-900">
                    GHS {summaryRow.grand_total_ghs.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="glass-card overflow-hidden">
        <div className="border-b border-slate-200/70 px-5 py-4">
          <p className="label-kicker">Week Activity</p>
        </div>
        {weeks.length === 0 ? (
          <p className="p-5 text-sm leading-6 text-slate-500">No weekly activity available yet.</p>
        ) : (
          <>
            <div className="space-y-4 p-4 md:hidden">
              {weeks.map((week) => (
                <article key={week.id} className="metric-tile p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-display text-lg font-semibold text-slate-950">
                        {week.label}
                      </p>
                      <p className="mt-1 text-sm leading-5 text-slate-500">
                        {getWeekRangeCompactLabel(week)}
                      </p>
                    </div>
                    <span className={`status-chip ${weekStatusPill(week.status)}`}>
                      {week.status}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="surface-subtle px-4 py-3">
                      <p className="label-kicker">Packages</p>
                      <p className="mt-2 text-sm font-semibold text-slate-950">
                        {week.package_count ?? 0}
                      </p>
                    </div>
                    <div className="surface-subtle px-4 py-3">
                      <p className="label-kicker">Range</p>
                      <p className="mt-2 truncate text-sm font-semibold text-slate-950">
                        {getWeekRangeCompactLabel(week)}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <div className="hidden divide-y divide-slate-200 md:block">
              {weeks.map((week) => (
                <article
                  key={week.id}
                  className="flex items-center justify-between gap-5 px-5 py-4"
                >
                  <div className="min-w-0">
                    <p className="font-display truncate text-xl font-semibold text-slate-950">
                      {week.label}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      {getWeekRangeLabel(week)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <div className="surface-subtle min-w-[7.5rem] px-4 py-3 text-center">
                      <p className="label-kicker">Packages</p>
                      <p className="mt-2 text-sm font-semibold text-slate-950">
                        {week.package_count ?? 0}
                      </p>
                    </div>
                    <span className={`status-chip ${weekStatusPill(week.status)}`}>
                      {week.status}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </>
  );
}
