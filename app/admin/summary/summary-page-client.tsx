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
      title="Order Summary"
      subtitle="Review operations here and use /admin/private directly for protected totals and exports."
    >
      <section className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="skeleton-card h-24" />
        ))}
      </section>
      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="skeleton-card h-[440px]" />
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

  const [currentWeek, setCurrentWeek] = useState<ProcessingWeek | null>(
    initialCurrentWeek,
  );
  const [weeks, setWeeks] = useState<ProcessingWeekWithReport[]>(initialWeeks);
  const [activePackageCount, setActivePackageCount] = useState(
    initialActivePackageCount,
  );
  const [expressPackageCount, setExpressPackageCount] = useState(
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
      title="Order Summary"
      subtitle="Review operations here and use /admin/private directly for protected totals and exports."
    >
      <Toaster toasts={toasts} dismiss={dismissToast} />

      <section className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="metric-tile px-5 py-5">
          <p className="label-kicker">Closed Weeks</p>
          <p className="font-display mt-3 text-3xl font-semibold text-slate-950">
            {summary.closedWeekCount}
          </p>
        </article>
        <article className="metric-tile px-5 py-5">
          <p className="label-kicker">Total Packages</p>
          <p className="font-display mt-3 text-3xl font-semibold text-slate-950">
            {summary.totalPackages}
          </p>
        </article>
        <article className="metric-tile px-5 py-5">
          <p className="label-kicker">Active Packages</p>
          <p className="font-display mt-3 text-3xl font-semibold text-slate-950">
            {summary.activePackageCount}
          </p>
        </article>
        <article className="metric-tile px-5 py-5">
          <p className="label-kicker">Express Orders</p>
          <p className="font-display mt-3 text-3xl font-semibold text-slate-950">
            {expressPackageCount}
          </p>
        </article>
      </section>

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

      <section className="mb-5 grid gap-5 lg:grid-cols-2">
        <article className="glass-card overflow-hidden">
          <div className="border-b border-slate-200/70 px-5 py-4">
            <p className="label-kicker">Active Week Snapshot</p>
          </div>
          <div className="space-y-4 p-5">
            <div className="metric-tile p-4">
              <p className="label-kicker">Active Week</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">
                {currentWeek?.label ?? "No active week"}
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="metric-tile p-4">
                <p className="label-kicker">Packages</p>
                <p className="font-display mt-2 text-2xl font-semibold text-slate-950">
                  {summary.activePackageCount}
                </p>
              </div>
              <div className="metric-tile p-4">
                <p className="label-kicker">Status</p>
                <p className="font-display mt-2 text-2xl font-semibold text-slate-950">
                  {currentWeek?.status ?? "No active week"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              className="btn btn-secondary"
            >
              {refreshing ? "Refreshing..." : "Refresh Summary"}
            </button>
          </div>
        </article>

        <article className="glass-card overflow-hidden">
          <div className="border-b border-slate-200/70 px-5 py-4">
            <p className="label-kicker">Protected Private Totals</p>
          </div>
          <div className="space-y-4 p-5">
            <div className="metric-tile p-4">
              <p className="label-kicker">Direct URL Only</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">
                Sensitive totals and exports moved
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Total weight, total amount made, partner amount made, total express kg,
                weekly exports, and week start or end controls now live at
                /admin/private behind the owner password.
              </p>
            </div>
            <p className="text-sm leading-6 text-slate-600">
              The private page is no longer shown in the menu.
            </p>
          </div>
        </article>
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
