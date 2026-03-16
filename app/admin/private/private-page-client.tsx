"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { buildDashboardMetrics } from "@/lib/dashboard-metrics";
import { formatAccraDateTime } from "@/lib/time";
import type {
  ExpressBusinessSummary,
  PackageRecord,
  ProcessingWeek,
  ProcessingWeekWithReport,
} from "@/lib/types";

import { AdminShell } from "../_components/admin-shell";
import { fetchWithTimeout, parseApiResponse } from "../_components/client-utils";
import { Toaster, useToasts } from "../_components/toaster";

interface DashboardPayload {
  currentWeek: ProcessingWeek | null;
  weeks: ProcessingWeekWithReport[];
  packages: PackageRecord[];
  expressBusinessSummary: ExpressBusinessSummary;
}

interface PrivatePageClientProps {
  userEmail: string;
  initialCurrentWeek: ProcessingWeek | null;
  initialWeeks: ProcessingWeekWithReport[];
  initialPackages: PackageRecord[];
  initialExpressBusinessSummary: ExpressBusinessSummary | null;
  initialLoadReady: boolean;
  initialLoadError: string | null;
}

const EMPTY_EXPRESS_BUSINESS_SUMMARY: ExpressBusinessSummary = {
  express_package_count: 0,
  express_total_weight_kg: 0,
  your_express_share_ghs: 0,
  partner_express_share_ghs: 0,
  express_fixed_charge_total_ghs: 0,
};

function SkeletonPrivatePage({ userEmail }: { userEmail: string }) {
  return (
    <AdminShell
      userEmail={userEmail}
      title="Private"
      subtitle="Admin-only totals protected by a second password."
    >
      <section className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="skeleton-card h-24" />
        ))}
      </section>
      <section className="mt-4 skeleton-card h-48" />
    </AdminShell>
  );
}

function PrivateHeaderExtras({
  refreshing,
  onRefresh,
}: {
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRefresh}
      className="admin-icon-btn"
      aria-label="Refresh private page"
      title="Refresh private page"
    >
      <svg
        viewBox="0 0 20 20"
        fill="none"
        className={`h-4 w-4 text-slate-700 ${refreshing ? "animate-spin" : ""}`}
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
  );
}

export function PrivatePageClient({
  userEmail,
  initialCurrentWeek,
  initialWeeks,
  initialPackages,
  initialExpressBusinessSummary,
  initialLoadReady,
  initialLoadError,
}: PrivatePageClientProps) {
  const { toasts, dismissToast, pushToast } = useToasts();

  const [currentWeek, setCurrentWeek] = useState<ProcessingWeek | null>(
    initialCurrentWeek,
  );
  const [weeks, setWeeks] = useState<ProcessingWeekWithReport[]>(initialWeeks);
  const [packages, setPackages] = useState<PackageRecord[]>(initialPackages);
  const [expressBusinessSummary, setExpressBusinessSummary] =
    useState<ExpressBusinessSummary>(
      initialExpressBusinessSummary ?? EMPTY_EXPRESS_BUSINESS_SUMMARY,
    );
  const [startWeekLabel, setStartWeekLabel] = useState("");
  const [loading, setLoading] = useState(!initialLoadReady);
  const [refreshing, setRefreshing] = useState(false);
  const [startingWeek, setStartingWeek] = useState(false);
  const [closingWeek, setClosingWeek] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const initRef = useRef(false);

  const closedWeeks = useMemo(
    () => weeks.filter((week) => week.status === "CLOSED"),
    [weeks],
  );
  const summary = useMemo(() => buildDashboardMetrics(weeks, packages), [weeks, packages]);
  const currentWeekRemaining = useMemo(() => {
    if (!currentWeek) {
      return "No active week";
    }

    const remainingMs = new Date(currentWeek.end_at).getTime() - Date.now();
    if (remainingMs <= 0) {
      return "Closing soon";
    }

    const remainingHours = Math.floor(remainingMs / (1000 * 60 * 60));
    const remainingMinutes = Math.floor((remainingMs / (1000 * 60)) % 60);
    return `${remainingHours}h ${remainingMinutes}m remaining`;
  }, [currentWeek]);

  async function loadDashboard() {
    const response = await fetchWithTimeout("/api/admin/private-dashboard", {
      cache: "no-store",
    });
    const payload = await parseApiResponse<DashboardPayload>(response);
    setCurrentWeek(payload.currentWeek);
    setWeeks(payload.weeks);
    setPackages(payload.packages);
    setExpressBusinessSummary(payload.expressBusinessSummary);
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
        "Unable to refresh private totals",
        error instanceof Error ? error.message : "Unknown error",
      );
    } finally {
      setRefreshing(false);
      if (showLoader) {
        setLoading(false);
      }
    }
  }

  async function handleStartWeek(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStartingWeek(true);

    try {
      const response = await fetchWithTimeout("/api/admin/weeks/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: startWeekLabel.trim() || undefined }),
      });
      await parseApiResponse<{ week: ProcessingWeek }>(response);
      setStartWeekLabel("");
      pushToast("success", "Week started", "Processing week is now active.");
      await refresh();
    } catch (error) {
      pushToast(
        "error",
        "Failed to start week",
        error instanceof Error ? error.message : "Unknown error",
      );
    } finally {
      setStartingWeek(false);
    }
  }

  async function handleCloseWeek() {
    if (!currentWeek) {
      return;
    }

    setClosingWeek(true);

    try {
      const response = await fetchWithTimeout(`/api/admin/weeks/${currentWeek.id}/close`, {
        method: "POST",
      });
      await parseApiResponse(response);
      pushToast("success", "Week closed", "Next week was opened automatically.");
      await refresh();
    } catch (error) {
      pushToast(
        "error",
        "Failed to close week",
        error instanceof Error ? error.message : "Unknown error",
      );
    } finally {
      setClosingWeek(false);
    }
  }

  async function handlePasswordChange(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (newPassword.trim().length < 4) {
      pushToast(
        "error",
        "Password too short",
        "Use at least 4 characters for the private password.",
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      pushToast(
        "error",
        "Passwords do not match",
        "Re-enter the same password in both fields.",
      );
      return;
    }

    setUpdatingPassword(true);

    try {
      const response = await fetchWithTimeout("/api/admin/private-access/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword.trim() }),
      });
      await parseApiResponse<{ success: boolean }>(response);
      setNewPassword("");
      setConfirmPassword("");
      pushToast(
        "success",
        "Private password updated",
        "The new password is now active for /admin/private.",
      );
    } catch (error) {
      pushToast(
        "error",
        "Failed to update password",
        error instanceof Error ? error.message : "Unknown error",
      );
    } finally {
      setUpdatingPassword(false);
    }
  }

  useEffect(() => {
    if (initRef.current) {
      return;
    }
    initRef.current = true;

    if (initialLoadError) {
      pushToast("error", "Private page load failed", initialLoadError);
    }

    if (!initialLoadReady) {
      void refresh(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLoadError, initialLoadReady]);

  if (loading) {
    return <SkeletonPrivatePage userEmail={userEmail} />;
  }

  return (
    <AdminShell
      userEmail={userEmail}
      title="Private"
      subtitle="Admin-only totals protected by a second password."
      headerExtras={
        <PrivateHeaderExtras
          refreshing={refreshing}
          onRefresh={() => void refresh()}
        />
      }
    >
      <Toaster toasts={toasts} dismiss={dismissToast} />

      <section className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="metric-tile px-5 py-5">
          <p className="label-kicker">Total Weight</p>
          <p className="font-display mt-3 text-3xl font-semibold text-slate-950">
            {summary.totalWeight.toFixed(2)} kg
          </p>
        </article>
        <article className="metric-tile px-5 py-5">
          <p className="label-kicker">Total Amount Made</p>
          <p className="font-display mt-3 text-3xl font-semibold text-slate-950">
            GHS {summary.totalRevenue.toFixed(2)}
          </p>
        </article>
        <article className="metric-tile px-5 py-5">
          <p className="label-kicker">Partner Amount Made</p>
          <p className="font-display mt-3 text-3xl font-semibold text-slate-950">
            GHS {expressBusinessSummary.partner_express_share_ghs.toFixed(2)}
          </p>
        </article>
        <article className="metric-tile px-5 py-5">
          <p className="label-kicker">Total Express Kg</p>
          <p className="font-display mt-3 text-3xl font-semibold text-slate-950">
            {expressBusinessSummary.express_total_weight_kg.toFixed(2)} kg
          </p>
        </article>
      </section>

      <section className="mb-5 grid gap-5 lg:grid-cols-2">
        <article className="glass-card overflow-hidden">
          <div className="border-b border-slate-200/70 px-5 py-4">
            <p className="label-kicker">Week Control</p>
            <h3 className="font-display mt-2 text-2xl font-semibold text-slate-950">
              Start or end weeks here
            </h3>
          </div>
          <div className="space-y-4 p-5">
            <div className="surface-subtle px-4 py-4">
              {currentWeek ? (
                <p className="text-sm leading-6 text-slate-700">
                  <span className="font-semibold text-slate-950">{currentWeek.label}</span>
                  {" "}is active from{" "}
                  <span className="font-medium text-slate-950">
                    {formatAccraDateTime(currentWeek.start_at)}
                  </span>
                  {" "}to{" "}
                  <span className="font-medium text-slate-950">
                    {formatAccraDateTime(currentWeek.end_at)}
                  </span>
                  . {currentWeekRemaining}.
                </p>
              ) : (
                <p className="text-sm leading-6 text-slate-700">
                  No active week right now. Start a new processing week from the form beside this card.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void handleCloseWeek()}
                disabled={closingWeek || !currentWeek}
                className="btn btn-accent"
              >
                {closingWeek ? "Ending week..." : "End Current Week"}
              </button>
            </div>
          </div>
        </article>

        <article className="glass-card overflow-hidden">
          <div className="border-b border-slate-200/70 px-5 py-4">
            <p className="label-kicker">Create Week</p>
            <h3 className="font-display mt-2 text-2xl font-semibold text-slate-950">
              Start a new processing week
            </h3>
          </div>
          <form className="space-y-4 p-5" onSubmit={handleStartWeek}>
            <label className="block text-sm font-semibold text-slate-700">
              Week label (optional)
            </label>
            <input
              type="text"
              placeholder="Week 2026-03-16"
              value={startWeekLabel}
              onChange={(event) => setStartWeekLabel(event.target.value)}
              className="input-control"
            />
            <button
              type="submit"
              disabled={startingWeek || Boolean(currentWeek)}
              className="btn btn-primary"
            >
              {startingWeek ? "Starting..." : "Start Processing Week"}
            </button>
            {currentWeek ? (
              <p className="text-xs text-amber-700">
                End the current active week before starting a new one.
              </p>
            ) : null}
          </form>
        </article>
      </section>

      <section className="mb-5">
        <article className="glass-card overflow-hidden">
          <div className="border-b border-slate-200/70 px-5 py-4">
            <p className="label-kicker">Private Password</p>
            <h3 className="font-display mt-2 text-2xl font-semibold text-slate-950">
              Change the owner password
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              This password is stored in Supabase and is only used when visiting
              /admin/private directly.
            </p>
          </div>
          <form className="grid gap-4 p-5" onSubmit={handlePasswordChange}>
            <input
              type="password"
              placeholder="New private password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="input-control"
              autoComplete="new-password"
              required
            />
            <input
              type="password"
              placeholder="Confirm private password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="input-control"
              autoComplete="new-password"
              required
            />
            <button
              type="submit"
              disabled={updatingPassword}
              className="btn btn-primary w-full sm:w-auto"
            >
              {updatingPassword ? "Saving..." : "Save New Password"}
            </button>
          </form>
        </article>
      </section>

      <section className="glass-card overflow-hidden">
        <div className="border-b border-slate-200/70 px-5 py-4">
          <p className="label-kicker">Private Reports</p>
          <h3 className="font-display mt-2 text-2xl font-semibold text-slate-950">
            Weekly exports
          </h3>
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
                    {week.package_count ?? 0} packages
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
      </section>
    </AdminShell>
  );
}
