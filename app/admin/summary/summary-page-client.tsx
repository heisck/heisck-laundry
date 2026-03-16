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

import { AdminShell } from "../_components/admin-shell";
import { fetchWithTimeout, parseApiResponse } from "../_components/client-utils";
import { Toaster, useToasts } from "../_components/toaster";

interface SummaryPageClientProps {
  userEmail: string;
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

function SkeletonSummaryPage({ userEmail }: { userEmail: string }) {
  return (
    <AdminShell
      userEmail={userEmail}
      title="Summary"
      subtitle="Review operations here and use /admin/private directly for protected totals and exports."
    >
      <section className="grid gap-4">
        <div className="skeleton-card h-[220px]" />
        <div className="skeleton-card h-[440px]" />
      </section>
    </AdminShell>
  );
}

export function SummaryPageClient({
  userEmail,
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

  async function loadDashboard() {
    const response = await fetchWithTimeout("/api/admin/dashboard", {
      cache: "no-store",
    });
    const payload = await parseApiResponse<DashboardPayload>(response);
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
      void refresh(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLoadError, initialLoadReady]);

  if (loading) {
    return <SkeletonSummaryPage userEmail={userEmail} />;
  }

  return (
    <AdminShell
      userEmail={userEmail}
      title="Summary"
      subtitle="Review operations here and use /admin/private directly for protected totals and exports."
      headerExtras={
        <>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing}
            className="admin-icon-btn"
            aria-label="Refresh summary"
            title="Refresh summary"
          >
            <svg
              viewBox="0 0 20 20"
              fill="none"
              className={refreshing ? "h-4 w-4 animate-spin text-slate-700" : "h-4 w-4 text-slate-700"}
              aria-hidden="true"
            >
              <path
                d="M16.5 10A6.5 6.5 0 0 1 5.41 14.59"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <path
                d="M4.5 10A6.5 6.5 0 0 1 14.59 5.41"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <path
                d="M6.1 14.75H5v-1.1"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M13.9 5.25H15v1.1"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <div className="inline-flex min-h-[2.9rem] items-center gap-2 rounded-full border border-slate-200 bg-white/92 px-3 py-2 shadow-[0_8px_18px_rgba(20,32,51,0.06)]">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Packages
            </span>
            <span className="font-display text-lg font-semibold text-slate-950">
              {summary.totalPackages}
            </span>
          </div>
        </>
      }
    >
      <Toaster toasts={toasts} dismiss={dismissToast} />

      <section className="mb-5">
        <article className="glass-card overflow-hidden">
          <div className="border-b border-slate-200/70 px-5 py-4">
            <p className="label-kicker">Package Type Breakdown</p>
          </div>
          <div className="grid gap-4 p-5 md:grid-cols-3">
            <div className="metric-tile p-4">
              <p className="label-kicker">Wash Only</p>
              <p className="font-display mt-2 text-2xl font-semibold text-slate-950">
                {packageTypeSummary.wash_only_count}
              </p>
            </div>
            <div className="metric-tile p-4">
              <p className="label-kicker">Normal</p>
              <p className="font-display mt-2 text-2xl font-semibold text-slate-950">
                {packageTypeSummary.normal_wash_dry_count}
              </p>
            </div>
            <div className="metric-tile p-4">
              <p className="label-kicker">Express</p>
              <p className="font-display mt-2 text-2xl font-semibold text-slate-950">
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
          <p className="label-kicker">Week Activity Table</p>
        </div>
        {weeks.length === 0 ? (
          <p className="p-5 text-sm leading-6 text-slate-500">No weekly activity available yet.</p>
        ) : (
          <>
            <div className="space-y-4 p-4 md:hidden">
              {weeks.map((week) => (
                <article key={week.id} className="metric-tile p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-xl font-semibold text-slate-950">
                        {week.label}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-slate-500">
                        {formatAccraDateTime(week.start_at)} - {formatAccraDateTime(week.end_at)}
                      </p>
                    </div>
                    <span className="pill-soft">{week.status}</span>
                  </div>
                  <div className="mt-4">
                    <div className="surface-subtle px-4 py-3">
                      <p className="label-kicker">Packages</p>
                      <p className="mt-2 text-sm font-semibold text-slate-950">
                        {week.package_count ?? 0}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <div className="table-wrap hidden md:block">
              <table className="data-table min-w-[640px]">
                <thead>
                  <tr className="text-left">
                    <th>Week</th>
                    <th>Status</th>
                    <th>Packages</th>
                  </tr>
                </thead>
                <tbody>
                  {weeks.map((week) => (
                    <tr key={week.id}>
                      <td>
                        <p className="font-medium text-slate-900">{week.label}</p>
                        <p className="text-sm leading-6 text-slate-500">
                          {formatAccraDateTime(week.start_at)} - {formatAccraDateTime(week.end_at)}
                        </p>
                      </td>
                      <td>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium">
                          {week.status}
                        </span>
                      </td>
                      <td>{week.package_count ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </AdminShell>
  );
}
