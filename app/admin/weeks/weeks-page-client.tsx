"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { formatAccraDateTime } from "@/lib/time";
import type { ProcessingWeek, ProcessingWeekWithReport } from "@/lib/types";

import { AdminShell } from "../_components/admin-shell";
import { fetchWithTimeout, parseApiResponse } from "../_components/client-utils";
import { Toaster, useToasts } from "../_components/toaster";

interface WeeksPageClientProps {
  userEmail: string;
  initialCurrentWeek: ProcessingWeek | null;
  initialWeeks: ProcessingWeekWithReport[];
  initialLoadReady: boolean;
  initialLoadError: string | null;
}

type BusyAction = null | "refresh" | "startWeek" | "closeWeek";

interface CurrentWeekPayload {
  week: ProcessingWeek | null;
  remainingSeconds: number;
}

interface WeeksPayload {
  weeks: ProcessingWeekWithReport[];
}

function SkeletonWeeksPage({ userEmail }: { userEmail: string }) {
  return (
    <AdminShell
      userEmail={userEmail}
      title="Weeks"
      subtitle="Start, close, and monitor processing weeks."
    >
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="skeleton-card h-64" />
        <div className="skeleton-card h-64" />
      </section>
      <section className="mt-4 skeleton-card h-[520px]" />
    </AdminShell>
  );
}

export function WeeksPageClient({
  userEmail,
  initialCurrentWeek,
  initialWeeks,
  initialLoadReady,
  initialLoadError,
}: WeeksPageClientProps) {
  const { toasts, dismissToast, pushToast } = useToasts();

  const [currentWeek, setCurrentWeek] = useState<ProcessingWeek | null>(
    initialCurrentWeek,
  );
  const [weeks, setWeeks] = useState<ProcessingWeekWithReport[]>(initialWeeks);
  const [startWeekLabel, setStartWeekLabel] = useState("");
  const [loading, setLoading] = useState(!initialLoadReady);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const initRef = useRef(false);

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

  async function loadWeeksAndCurrent() {
    const [currentResponse, weeksResponse] = await Promise.all([
      fetchWithTimeout("/api/admin/weeks/current", { cache: "no-store" }),
      fetchWithTimeout("/api/admin/weeks", { cache: "no-store" }),
    ]);

    const currentPayload = await parseApiResponse<CurrentWeekPayload>(currentResponse);
    const weeksPayload = await parseApiResponse<WeeksPayload>(weeksResponse);
    setCurrentWeek(currentPayload.week);
    setWeeks(weeksPayload.weeks);
  }

  async function refreshAll(showLoader = false) {
    if (showLoader) {
      setLoading(true);
    }
    setBusyAction("refresh");
    try {
      await loadWeeksAndCurrent();
    } catch (error) {
      pushToast(
        "error",
        "Unable to refresh weeks",
        error instanceof Error ? error.message : "Unknown error",
      );
    } finally {
      setBusyAction(null);
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
      void refreshAll(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLoadError, initialLoadReady]);

  async function handleStartWeek(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyAction("startWeek");

    try {
      const response = await fetchWithTimeout("/api/admin/weeks/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: startWeekLabel.trim() || undefined }),
      });
      await parseApiResponse<{ week: ProcessingWeek }>(response);
      setStartWeekLabel("");
      pushToast("success", "Week started", "Processing week is now active.");
      await loadWeeksAndCurrent();
    } catch (error) {
      pushToast(
        "error",
        "Failed to start week",
        error instanceof Error ? error.message : "Unknown error",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCloseWeek() {
    if (!currentWeek) {
      return;
    }
    setBusyAction("closeWeek");

    try {
      const response = await fetchWithTimeout(`/api/admin/weeks/${currentWeek.id}/close`, {
        method: "POST",
      });
      await parseApiResponse(response);
      pushToast("success", "Week closed", "Next week was opened automatically.");
      await loadWeeksAndCurrent();
    } catch (error) {
      pushToast(
        "error",
        "Failed to close week",
        error instanceof Error ? error.message : "Unknown error",
      );
    } finally {
      setBusyAction(null);
    }
  }

  if (loading) {
    return <SkeletonWeeksPage userEmail={userEmail} />;
  }

  return (
    <AdminShell
      userEmail={userEmail}
      title="Weeks"
      subtitle="Start, close, and monitor processing weeks."
    >
      <Toaster toasts={toasts} dismiss={dismissToast} />

      <section className="mb-4 grid gap-4 lg:grid-cols-2">
        <article className="glass-card overflow-hidden border border-slate-200">
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">
              Active Week Control
            </h3>
          </div>
          <div className="space-y-3 p-4">
            <div className="rounded-xl border border-slate-200 bg-white/90 p-3">
              <p className="text-xs uppercase tracking-wider text-slate-500">Week Label</p>
              <p className="mt-1 font-semibold text-slate-900">
                {currentWeek?.label ?? "No active week"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white/90 p-3">
              <p className="text-xs uppercase tracking-wider text-slate-500">Start</p>
              <p className="mt-1 font-semibold text-slate-900">
                {currentWeek ? formatAccraDateTime(currentWeek.start_at) : "-"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white/90 p-3">
              <p className="text-xs uppercase tracking-wider text-slate-500">End</p>
              <p className="mt-1 font-semibold text-slate-900">
                {currentWeek ? formatAccraDateTime(currentWeek.end_at) : "-"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white/90 p-3">
              <p className="text-xs uppercase tracking-wider text-slate-500">Time Left</p>
              <p className="mt-1 font-semibold text-slate-900">{currentWeekRemaining}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleCloseWeek}
                disabled={busyAction === "closeWeek" || !currentWeek}
                className="btn btn-accent"
              >
                {busyAction === "closeWeek" ? "Ending week..." : "End Current Week"}
              </button>
              <button
                type="button"
                onClick={() => void refreshAll()}
                disabled={busyAction === "refresh"}
                className="btn btn-secondary"
              >
                {busyAction === "refresh" ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
        </article>

        <article className="glass-card overflow-hidden border border-slate-200">
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">
              Start New Week
            </h3>
          </div>
          <form className="space-y-3 p-4" onSubmit={handleStartWeek}>
            <label className="block text-sm font-medium text-slate-700">
              Week label (optional)
            </label>
            <input
              type="text"
              placeholder="Week 2026-03-11"
              value={startWeekLabel}
              onChange={(event) => setStartWeekLabel(event.target.value)}
              className="input-control"
            />
            <button
              type="submit"
              disabled={busyAction === "startWeek" || Boolean(currentWeek)}
              className="btn btn-primary"
            >
              {busyAction === "startWeek" ? "Starting..." : "Start Processing Week"}
            </button>
            {currentWeek ? (
              <p className="text-xs text-amber-700">
                Close current active week before starting a new one.
              </p>
            ) : null}
          </form>
        </article>
      </section>

      <section className="glass-card overflow-hidden border border-slate-200">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">
            Week History
          </h3>
        </div>
        {weeks.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No weeks yet.</p>
        ) : (
          <div className="divide-y divide-slate-200">
            {weeks.map((week) => (
              <article
                key={week.id}
                className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="font-semibold text-slate-900">{week.label}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatAccraDateTime(week.start_at)} - {formatAccraDateTime(week.end_at)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                  <span
                    className={
                      week.status === "ACTIVE"
                        ? "rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700"
                        : "rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
                    }
                  >
                    {week.status}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs">
                    {week.package_count ?? 0} packages
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs">
                    {week.total_weight_kg?.toFixed(2) ?? "0.00"} kg
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs">
                    GHS {week.total_price_ghs?.toFixed(2) ?? "0.00"}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </AdminShell>
  );
}
