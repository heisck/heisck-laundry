"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { getWorkerLabel } from "@/lib/payouts";
import { formatAccraDateTime } from "@/lib/time";
import type {
  ExpressBusinessSummary,
  PackageRecord,
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
  initialPackages: PackageRecord[];
  initialPackageTypeSummary: PackageTypeSummary;
  initialExpressBusinessSummary: ExpressBusinessSummary;
  initialWorkerPayoutSummaries: WorkerPayoutSummary[];
  initialLoadReady: boolean;
  initialLoadError: string | null;
}

interface DashboardPayload {
  currentWeek: ProcessingWeek | null;
  remainingSeconds: number;
  weeks: ProcessingWeekWithReport[];
  packages: PackageRecord[];
  packageTypeSummary: PackageTypeSummary;
  expressBusinessSummary: ExpressBusinessSummary;
  workerPayoutSummaries: WorkerPayoutSummary[];
}

function SkeletonSummaryPage({ userEmail }: { userEmail: string }) {
  return (
    <AdminShell
      userEmail={userEmail}
      title="Order Summary"
      subtitle="Review totals and export closed weekly reports."
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
  initialPackages,
  initialPackageTypeSummary,
  initialExpressBusinessSummary,
  initialWorkerPayoutSummaries,
  initialLoadReady,
  initialLoadError,
}: SummaryPageClientProps) {
  const { toasts, dismissToast, pushToast } = useToasts();

  const [currentWeek, setCurrentWeek] = useState<ProcessingWeek | null>(
    initialCurrentWeek,
  );
  const [weeks, setWeeks] = useState<ProcessingWeekWithReport[]>(initialWeeks);
  const [packages, setPackages] = useState<PackageRecord[]>(initialPackages);
  const [packageTypeSummary, setPackageTypeSummary] =
    useState<PackageTypeSummary>(initialPackageTypeSummary);
  const [expressBusinessSummary, setExpressBusinessSummary] =
    useState<ExpressBusinessSummary>(initialExpressBusinessSummary);
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
    const closedWeight = closedWeeks.reduce(
      (sum, week) => sum + (week.total_weight_kg ?? 0),
      0,
    );
    const closedRevenue = closedWeeks.reduce(
      (sum, week) => sum + (week.total_price_ghs ?? 0),
      0,
    );

    const activePackageCount = packages.length;
    const activeWeight = packages.reduce(
      (sum, item) => sum + item.total_weight_kg,
      0,
    );
    const activeRevenue = packages.reduce(
      (sum, item) => sum + item.total_price_ghs,
      0,
    );

    return {
      closedWeekCount: closedWeeks.length,
      totalPackages: closedPackageCount + activePackageCount,
      totalWeight: closedWeight + activeWeight,
      totalRevenue: closedRevenue + activeRevenue,
      activePackageCount,
      activeWeight,
      activeRevenue,
    };
  }, [closedWeeks, packages]);

  async function loadDashboard() {
    const response = await fetchWithTimeout("/api/admin/dashboard", {
      cache: "no-store",
    });
    const payload = await parseApiResponse<DashboardPayload>(response);
    setCurrentWeek(payload.currentWeek);
    setWeeks(payload.weeks);
    setPackages(payload.packages);
    setPackageTypeSummary(payload.packageTypeSummary);
    setExpressBusinessSummary(payload.expressBusinessSummary);
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
      subtitle="Review totals and export closed weekly reports."
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
          <p className="label-kicker">Total Weight</p>
          <p className="font-display mt-3 text-3xl font-semibold text-slate-950">
            {summary.totalWeight.toFixed(2)} kg
          </p>
        </article>
        <article className="metric-tile px-5 py-5">
          <p className="label-kicker">Total Revenue</p>
          <p className="font-display mt-3 text-3xl font-semibold text-slate-950">
            GHS {summary.totalRevenue.toFixed(2)}
          </p>
        </article>
      </section>

      <section className="mb-5 grid gap-5 lg:grid-cols-2">
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
              <p className="label-kicker">
                Normal Wash & Dry
              </p>
              <p className="font-display mt-2 text-2xl font-semibold text-slate-950">
                {packageTypeSummary.normal_wash_dry_count}
              </p>
            </div>
            <div className="metric-tile p-4">
              <p className="label-kicker">
                Express Wash & Dry
              </p>
              <p className="font-display mt-2 text-2xl font-semibold text-slate-950">
                {packageTypeSummary.express_wash_dry_count}
              </p>
            </div>
          </div>
        </article>

        <article className="glass-card overflow-hidden">
          <div className="border-b border-slate-200/70 px-5 py-4">
            <p className="label-kicker">Express Split</p>
          </div>
          <div className="grid gap-4 p-5 md:grid-cols-2">
            <div className="metric-tile p-4">
              <p className="label-kicker">Express Packages</p>
              <p className="font-display mt-2 text-2xl font-semibold text-slate-950">
                {expressBusinessSummary.express_package_count}
              </p>
            </div>
            <div className="metric-tile p-4">
              <p className="label-kicker">Express Weight</p>
              <p className="font-display mt-2 text-2xl font-semibold text-slate-950">
                {expressBusinessSummary.express_total_weight_kg.toFixed(2)} kg
              </p>
            </div>
            <div className="metric-tile p-4">
              <p className="label-kicker">Your Share</p>
              <p className="font-display mt-2 text-2xl font-semibold text-slate-950">
                GHS {expressBusinessSummary.your_express_share_ghs.toFixed(2)}
              </p>
            </div>
            <div className="metric-tile p-4">
              <p className="label-kicker">Partner Share</p>
              <p className="font-display mt-2 text-2xl font-semibold text-slate-950">
                GHS {expressBusinessSummary.partner_express_share_ghs.toFixed(2)}
              </p>
            </div>
          </div>
        </article>
      </section>

      <section className="mb-5 glass-card overflow-hidden">
        <div className="border-b border-slate-200/70 px-5 py-4">
          <p className="label-kicker">Worker Payout Tracker</p>
        </div>
        <div className="table-wrap">
          <table className="data-table min-w-[860px]">
            <thead>
              <tr className="text-left">
                <th>Worker</th>
                <th>Washing</th>
                <th>Drying Downstairs</th>
                <th>Removed From Line</th>
                <th>Dryer Operation</th>
                <th>Your Side</th>
                <th>Partner Side</th>
                <th>Grand Total</th>
              </tr>
            </thead>
            <tbody>
              {workerPayoutSummaries.map((summary) => (
                <tr key={summary.worker_name}>
                  <td className="font-medium text-slate-900">
                    {getWorkerLabel(summary.worker_name)}
                  </td>
                  <td>{summary.washing_count}</td>
                  <td>{summary.drying_downstairs_count}</td>
                  <td>{summary.removed_from_line_count}</td>
                  <td>{summary.dryer_operation_count}</td>
                  <td>
                    GHS {summary.your_side_total_ghs.toFixed(2)}
                  </td>
                  <td>
                    GHS {summary.partner_side_total_ghs.toFixed(2)}
                  </td>
                  <td className="font-semibold text-slate-900">
                    GHS {summary.grand_total_ghs.toFixed(2)}
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
            <div className="grid gap-4 md:grid-cols-3">
              <div className="metric-tile p-4">
                <p className="label-kicker">Packages</p>
                <p className="font-display mt-2 text-2xl font-semibold text-slate-950">
                  {summary.activePackageCount}
                </p>
              </div>
              <div className="metric-tile p-4">
                <p className="label-kicker">Weight</p>
                <p className="font-display mt-2 text-2xl font-semibold text-slate-950">
                  {summary.activeWeight.toFixed(2)} kg
                </p>
              </div>
              <div className="metric-tile p-4">
                <p className="label-kicker">Revenue</p>
                <p className="font-display mt-2 text-2xl font-semibold text-slate-950">
                  GHS {summary.activeRevenue.toFixed(2)}
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
            <p className="label-kicker">Export Reports</p>
          </div>
          {closedWeeks.length === 0 ? (
            <p className="p-5 text-sm leading-6 text-slate-500">
              No closed weeks yet. Exports become available after a week is closed.
            </p>
          ) : (
            <div className="divide-y divide-slate-200">
              {closedWeeks.map((week) => (
                <article
                  key={week.id}
                  className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="font-display text-xl font-semibold text-slate-950">{week.label}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      {formatAccraDateTime(week.start_at)} - {formatAccraDateTime(week.end_at)}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      {week.package_count ?? 0} packages |{" "}
                      {week.total_weight_kg?.toFixed(2) ?? "0.00"} kg | GHS{" "}
                      {week.total_price_ghs?.toFixed(2) ?? "0.00"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href={`/api/admin/weeks/${week.id}/report.csv`}
                      className="btn btn-secondary"
                    >
                      Export CSV
                    </Link>
                    <Link
                      href={`/api/admin/weeks/${week.id}/report.pdf`}
                      className="btn btn-secondary"
                    >
                      Export PDF
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </article>
      </section>

      <section className="glass-card overflow-hidden">
        <div className="border-b border-slate-200/70 px-5 py-4">
          <p className="label-kicker">Week Totals Table</p>
        </div>
        {weeks.length === 0 ? (
          <p className="p-5 text-sm leading-6 text-slate-500">No weekly totals available yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table min-w-[760px]">
              <thead>
                <tr className="text-left">
                  <th>Week</th>
                  <th>Status</th>
                  <th>Packages</th>
                  <th>Weight</th>
                  <th>Revenue</th>
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
                    <td>{week.total_weight_kg?.toFixed(2) ?? "0.00"} kg</td>
                    <td>GHS {week.total_price_ghs?.toFixed(2) ?? "0.00"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdminShell>
  );
}
