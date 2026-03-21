"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { getActivePackages } from "@/lib/dashboard-metrics";
import {
  calculatePackagePricing,
  getPackageTypeOptionLabel,
  getSuggestedEtaDate,
} from "@/lib/package-pricing";
import {
  getOwnerSideLabel,
  getPayableTaskForStatus,
  requiresReadyForPickupDetails,
  getTaskLabel,
  getWorkerLabel,
} from "@/lib/payouts";
import { getStatusLabel, getStatusOptionsForPackage } from "@/lib/status";
import { formatAccraDateTime } from "@/lib/time";
import {
  LAUNDRY_WORKERS,
  PACKAGE_TYPES,
  type LaundryWorker,
  type PackageRecord,
  type PaymentStatus,
  type PackageStatus,
  type PackageType,
  type ProcessingWeek,
  type ProcessingWeekWithReport,
} from "@/lib/types";

import {
  cn,
  fetchWithTimeout,
  parseApiResponse,
  toLocalDatetimeValue,
} from "../_components/client-utils";
import { Toaster, useToasts } from "../_components/toaster";
import { useWorkspaceShell } from "../_components/workspace-shell-frame";

interface PackagesPageClientProps {
  initialCurrentWeek: ProcessingWeek | null;
  initialPackages: PackageRecord[];
  initialWeeks?: ProcessingWeekWithReport[];
  initialLoadReady: boolean;
  initialLoadError: string | null;
}

interface CreatePackageForm {
  customerName: string;
  roomNumber: string;
  packageType: PackageType;
  workerName: LaundryWorker;
  clothesCount: string;
  totalWeightKg: string;
  primaryPhone: string;
  secondaryPhone: string;
  etaAt: string;
}

interface LastCreatedInfo {
  orderId: string;
  trackingUrl: string;
}

interface NotificationAttempt {
  phoneNumber: string;
  ok: boolean;
  deliveryState: string;
  providerMessageId: string | null;
  errorText: string | null;
  attemptedAt?: string;
}

interface PackagesBootstrapPayload {
  week: ProcessingWeek | null;
  weeks: ProcessingWeekWithReport[];
  packages: PackageRecord[];
  stale: boolean;
  cachedAt: string | null;
}

interface StatusDialogState {
  packageId: string;
  orderId: string;
  packageType: PackageType;
  currentStatus: PackageStatus;
  nextStatus: PackageStatus;
  workerName: LaundryWorker | "";
  removeWorkerName: LaundryWorker | "";
  foldCompleted: boolean | null;
  foldWorkerName: LaundryWorker | "";
}

type BusyAction =
  | null
  | "refresh"
  | "createPackage"
  | "updatePayment"
  | "updateStatus"
  | "retrySms";

const PACKAGES_BOOTSTRAP_STORAGE_KEY = "heisck.admin.packages.bootstrap";

const STATUS_ORDER: Record<PackageStatus, number> = {
  RECEIVED: 0,
  WASHING: 1,
  DRYING: 2,
  READY_FOR_PICKUP: 3,
  PICKED_UP: 4,
};

const PAYMENT_STATUS_OPTIONS = ["ALL", "UNPAID", "PENDING", "PAID"] as const;
type PaymentStatusFilter = (typeof PAYMENT_STATUS_OPTIONS)[number];

interface PackageWeekSection {
  weekId: string;
  week: ProcessingWeekWithReport | null;
  status: ProcessingWeek["status"];
  packages: PackageRecord[];
  packageCount: number;
  totalWeight: number;
  totalRevenue: number;
}

const initialPackageForm: CreatePackageForm = {
  customerName: "",
  roomNumber: "",
  packageType: "NORMAL_WASH_DRY",
  workerName: "NOBODY",
  clothesCount: "",
  totalWeightKg: "",
  primaryPhone: "",
  secondaryPhone: "",
  etaAt: "",
};

function sumPackageMetrics(packages: PackageRecord[]) {
  return packages.reduce(
    (summary, item) => ({
      totalWeight: summary.totalWeight + item.total_weight_kg,
      totalRevenue: summary.totalRevenue + item.total_price_ghs,
    }),
    { totalWeight: 0, totalRevenue: 0 },
  );
}

function weekStatusPill(status: ProcessingWeek["status"]): string {
  if (status === "ACTIVE") {
    return "bg-emerald-100 text-emerald-700";
  }

  return "bg-slate-100 text-slate-700";
}

function getWeekRangeLabel(week: Pick<ProcessingWeek, "start_at" | "end_at">): string {
  return `${formatAccraDateTime(week.start_at)} - ${formatAccraDateTime(week.end_at)}`;
}

function sortPackagesForDisplay(
  packages: PackageRecord[],
  sortDescending: boolean,
): PackageRecord[] {
  return [...packages].sort((a, b) => {
    const statusDelta = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (statusDelta !== 0) {
      return sortDescending ? -statusDelta : statusDelta;
    }

    const createdDelta = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    return sortDescending ? -createdDelta : createdDelta;
  });
}

function matchesSearch(record: PackageRecord, query: string): boolean {
  if (!query) {
    return true;
  }

  const normalized = query.toLowerCase();
  return (
    record.order_id.toLowerCase().includes(normalized) ||
    record.customer_name.toLowerCase().includes(normalized) ||
    record.room_number.toLowerCase().includes(normalized) ||
    record.primary_phone.toLowerCase().includes(normalized)
  );
}

function statusPill(status: PackageStatus): string {
  if (status === "PICKED_UP") {
    return "bg-emerald-100 text-emerald-700";
  }
  if (status === "READY_FOR_PICKUP") {
    return "bg-blue-100 text-blue-700";
  }
  if (status === "DRYING") {
    return "bg-cyan-100 text-cyan-700";
  }
  if (status === "WASHING") {
    return "bg-indigo-100 text-indigo-700";
  }
  return "bg-slate-100 text-slate-700";
}

function getCompactPackageTypeLabel(packageType: PackageType): string {
  if (packageType === "NORMAL_WASH_DRY") {
    return "Normal";
  }
  if (packageType === "EXPRESS_WASH_DRY") {
    return "Express";
  }
  return "Wash Only";
}

function getCompactStatusLabel(status: PackageStatus): string {
  if (status === "READY_FOR_PICKUP") {
    return "Ready";
  }
  if (status === "PICKED_UP") {
    return "Picked Up";
  }
  if (status === "WASHING") {
    return "Washing";
  }
  if (status === "DRYING") {
    return "Drying";
  }
  return "Received";
}

function getCompactPaymentLabel(status: PaymentStatus): string {
  if (status === "PAID") {
    return "Paid";
  }
  if (status === "PENDING") {
    return "Pending";
  }
  return "Not Paid";
}

function canRetrySms(deliveryState: string | null): boolean {
  return deliveryState === "FAILED";
}

function readLocalBootstrapCache(): PackagesBootstrapPayload | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(PACKAGES_BOOTSTRAP_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as PackagesBootstrapPayload;
    if (!parsed || !Array.isArray(parsed.packages) || !("week" in parsed)) {
      return null;
    }

    return {
      week: parsed.week,
      weeks: Array.isArray(parsed.weeks) ? parsed.weeks : [],
      packages: parsed.packages,
      stale: Boolean(parsed.stale),
      cachedAt: parsed.cachedAt ?? null,
    };
  } catch {
    return null;
  }
}

function writeLocalBootstrapCache(payload: PackagesBootstrapPayload) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      PACKAGES_BOOTSTRAP_STORAGE_KEY,
      JSON.stringify(payload),
    );
  } catch {
    // Best effort only.
  }
}

function SkeletonPackagesPage() {
  return (
    <>
      <section className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="skeleton-card h-28" />
        ))}
      </section>
      <section className="mt-4 grid gap-4 lg:grid-cols-[1.05fr_1fr]">
        <div className="skeleton-card h-[420px]" />
        <div className="skeleton-card h-[420px]" />
      </section>
      <section className="mt-4 skeleton-card h-[440px]" />
    </>
  );
}

export function PackagesPageClient({
  initialCurrentWeek,
  initialPackages,
  initialWeeks = [],
  initialLoadReady,
  initialLoadError,
}: PackagesPageClientProps) {
  const { toasts, pushToast, dismissToast } = useToasts();

  const [currentWeek, setCurrentWeek] = useState<ProcessingWeek | null>(
    initialCurrentWeek,
  );
  const [weeks, setWeeks] = useState<ProcessingWeekWithReport[]>(initialWeeks);
  const [allPackages, setAllPackages] = useState<PackageRecord[]>(initialPackages);
  const [collapsedWeeks, setCollapsedWeeks] = useState<Record<string, boolean>>({});
  const [weekSearchTerms, setWeekSearchTerms] = useState<Record<string, string>>({});
  const [weekSortDescending, setWeekSortDescending] = useState<Record<string, boolean>>({});
  const [weekStatusFilters, setWeekStatusFilters] = useState<
    Record<string, PackageStatus | "ALL">
  >({});
  const [weekPaymentFilters, setWeekPaymentFilters] = useState<
    Record<string, PaymentStatusFilter>
  >({});
  const [createForm, setCreateForm] = useState<CreatePackageForm>({
    ...initialPackageForm,
    etaAt: toLocalDatetimeValue(getSuggestedEtaDate("NORMAL_WASH_DRY")),
  });
  const [lastCreated, setLastCreated] = useState<LastCreatedInfo | null>(null);
  const [loading, setLoading] = useState(!initialLoadReady);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [pendingSmsRetryPackageId, setPendingSmsRetryPackageId] = useState<
    string | null
  >(null);
  const [statusDialog, setStatusDialog] = useState<StatusDialogState | null>(null);
  const initRef = useRef(false);

  const isBusy = busyAction !== null;
  const activePackages = useMemo(() => getActivePackages(allPackages), [allPackages]);

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
  const currentWeekRemainingCompact = useMemo(() => {
    if (currentWeekRemaining === "No active week") {
      return "No week";
    }

    if (currentWeekRemaining === "Closing soon") {
      return "Soon";
    }

    return currentWeekRemaining.replace(" remaining", "");
  }, [currentWeekRemaining]);
  const currentWeekCompactLabel = useMemo(() => {
    if (!currentWeek) {
      return "No week";
    }

    return new Intl.DateTimeFormat("en-US", {
      timeZone: "Africa/Accra",
      month: "short",
      day: "numeric",
    }).format(new Date(currentWeek.start_at));
  }, [currentWeek]);

  const visibleWeekSections = useMemo(() => {
    const packagesByWeek = new Map<string, PackageRecord[]>();

    for (const pkg of allPackages) {
      const entries = packagesByWeek.get(pkg.week_id);
      if (entries) {
        entries.push(pkg);
      } else {
        packagesByWeek.set(pkg.week_id, [pkg]);
      }
    }

    const sections: PackageWeekSection[] = [];

    for (const week of weeks) {
      const weekPackages = packagesByWeek.get(week.id) ?? [];
      const shouldIncludeWeek =
        weekPackages.length > 0 || week.status === "ACTIVE" || (week.package_count ?? 0) > 0;

      if (!shouldIncludeWeek) {
        continue;
      }

      const metrics = sumPackageMetrics(weekPackages);
      sections.push({
        weekId: week.id,
        week,
        status: week.status,
        packages: weekPackages,
        packageCount: week.package_count ?? weekPackages.length,
        totalWeight: week.total_weight_kg ?? metrics.totalWeight,
        totalRevenue: week.total_price_ghs ?? metrics.totalRevenue,
      });
      packagesByWeek.delete(week.id);
    }

    const fallbackSections = Array.from(packagesByWeek.entries())
      .map(([weekId, weekPackages]) => {
        const metrics = sumPackageMetrics(weekPackages);
        const latestCreatedAt = weekPackages.reduce((latest, item) => {
          const createdAt = new Date(item.created_at).getTime();
          return createdAt > latest ? createdAt : latest;
        }, 0);

        return {
          weekId,
          week: null,
          status: weekPackages[0]?.week_status ?? "CLOSED",
          packages: weekPackages,
          packageCount: weekPackages.length,
          totalWeight: metrics.totalWeight,
          totalRevenue: metrics.totalRevenue,
          latestCreatedAt,
        };
      })
      .sort((a, b) => b.latestCreatedAt - a.latestCreatedAt)
      .map((section) => ({
        weekId: section.weekId,
        week: section.week,
        status: section.status,
        packages: section.packages,
        packageCount: section.packageCount,
        totalWeight: section.totalWeight,
        totalRevenue: section.totalRevenue,
      }));

    return [...sections, ...fallbackSections];
  }, [allPackages, weeks]);

  const displayedMetrics = useMemo(() => {
    const readyCount = activePackages.filter(
      (item) => item.status === "READY_FOR_PICKUP",
    ).length;

    return {
      readyCount,
    };
  }, [activePackages]);

  const pricePreview = useMemo(() => {
    const weightKg = Number(createForm.totalWeightKg);
    return calculatePackagePricing(weightKg, createForm.packageType);
  }, [createForm.packageType, createForm.totalWeightKg]);

  useWorkspaceShell({
    packageCount: activePackages.length,
    refreshing: busyAction === "refresh",
    onRefresh: () => void refreshAll(),
  });

  function showLoadingToast(title: string, message: string): number {
    return pushToast("loading", title, message, { persist: true });
  }

  async function loadBootstrap() {
    const response = await fetchWithTimeout(
      "/api/admin/packages/bootstrap",
      {
        cache: "no-store",
      },
      8000,
    );
    const payload = await parseApiResponse<PackagesBootstrapPayload>(response);
    setCurrentWeek(payload.week);
    setWeeks(payload.weeks);
    setAllPackages(payload.packages);
    writeLocalBootstrapCache(payload);

    if (payload.stale) {
      pushToast(
        "warning",
        "Showing cached package data",
        payload.cachedAt
          ? `Latest successful load: ${formatAccraDateTime(payload.cachedAt)}`
          : "The latest live refresh failed.",
      );
    }
  }

  async function refreshAll(showLoader = false) {
    if (showLoader) {
      setLoading(true);
    }
    setBusyAction("refresh");
    const loadingToastId = showLoadingToast(
      "Refreshing packages",
      "Loading the latest package and week data.",
    );
    try {
      await loadBootstrap();
    } catch (error) {
      const cached = readLocalBootstrapCache();
      if (cached) {
        setCurrentWeek(cached.week);
        setWeeks(cached.weeks);
        setAllPackages(cached.packages);
        pushToast(
          "warning",
          "Showing saved package data",
          "Live refresh failed, so the last browser cache is still on screen.",
        );
      } else {
        pushToast(
          "error",
          "Unable to refresh packages",
          error instanceof Error ? error.message : "Unknown error",
        );
      }
    } finally {
      dismissToast(loadingToastId);
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
      const cached = readLocalBootstrapCache();
      if (cached) {
        setCurrentWeek(cached.week);
        setWeeks(cached.weeks);
        setAllPackages(cached.packages);
        setLoading(false);
        pushToast(
          "info",
          "Loaded saved package data",
          "Refreshing live data in the background.",
        );
        void refreshAll(false);
        return;
      }

      void refreshAll(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLoadError, initialLoadReady]);

  async function handleCreatePackage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyAction("createPackage");
    const loadingToastId = showLoadingToast(
      "Creating package",
      "Saving the package and preparing customer tracking.",
    );

    try {
      const response = await fetchWithTimeout(
        "/api/admin/packages",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customerName: createForm.customerName,
            roomNumber: createForm.roomNumber,
            packageType: createForm.packageType,
            workerName: createForm.workerName,
            clothesCount: createForm.clothesCount,
            totalWeightKg: createForm.totalWeightKg,
            primaryPhone: createForm.primaryPhone,
            secondaryPhone: createForm.secondaryPhone || undefined,
            etaAt: new Date(createForm.etaAt).toISOString(),
          }),
        },
        30000,
      );

      const payload = await parseApiResponse<{
        package: PackageRecord;
        trackingUrl: string;
        notifications: NotificationAttempt[];
      }>(response);

      setCreateForm({
        ...initialPackageForm,
        workerName: createForm.workerName,
        etaAt: toLocalDatetimeValue(getSuggestedEtaDate("NORMAL_WASH_DRY")),
      });
      setLastCreated({
        orderId: payload.package.order_id,
        trackingUrl: payload.trackingUrl,
      });
      setAllPackages((prev) => [
        payload.package,
        ...prev.filter((item) => item.id !== payload.package.id),
      ]);
      pushToast("success", "Package created", payload.package.order_id);

      if (
        payload.notifications.length === 0 &&
        payload.package.last_delivery_state === "PENDING"
      ) {
        pushToast("info", "Package created", "SMS is sending in the background.");
      }

      const failedNotifications = payload.notifications.filter((item) => !item.ok);
      if (failedNotifications.length > 0) {
        pushToast(
          "warning",
          "Package created but SMS failed",
          failedNotifications
            .map((item) => `${item.phoneNumber}: ${item.errorText ?? item.deliveryState}`)
            .join(" | "),
        );
      }
    } catch (error) {
      pushToast(
        "error",
        "Failed to create package",
        error instanceof Error ? error.message : "Unknown error",
      );
    } finally {
      dismissToast(loadingToastId);
      setBusyAction(null);
    }
  }

  function handleStatusSelect(pkg: PackageRecord, nextStatus: PackageStatus) {
    if (nextStatus === pkg.status) {
      return;
    }

    if (
      requiresReadyForPickupDetails(pkg.package_type, nextStatus) ||
      getPayableTaskForStatus(pkg.package_type, nextStatus)
    ) {
      setStatusDialog({
        packageId: pkg.id,
        orderId: pkg.order_id,
        packageType: pkg.package_type,
        currentStatus: pkg.status,
        nextStatus,
        workerName: "",
        removeWorkerName: "",
        foldCompleted: pkg.package_type === "EXPRESS_WASH_DRY" ? false : null,
        foldWorkerName: "",
      });
      return;
    }

    void handleStatusChange(pkg.id, pkg.order_id, nextStatus, {});
  }

  function renderWorkerChoices(
    selectedWorker: LaundryWorker | "",
    onSelect: (worker: LaundryWorker) => void,
  ) {
    return (
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {LAUNDRY_WORKERS.map((worker) => {
          const selected = selectedWorker === worker;

          return (
            <button
              key={worker}
              type="button"
              disabled={isBusy}
              onClick={() => onSelect(worker)}
              className={cn(
                "rounded-[1rem] border px-3 py-2 text-sm font-semibold transition",
                selected
                  ? "border-slate-950 bg-slate-950 text-white shadow-[0_10px_18px_rgba(15,23,42,0.16)]"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
              )}
            >
              {getWorkerLabel(worker)}
            </button>
          );
        })}
      </div>
    );
  }

  function renderFoldChoices(
    selectedValue: boolean | null,
    onSelect: (value: boolean) => void,
  ) {
    return (
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {[
          { label: "No Fold", value: false },
          { label: "Folded", value: true },
        ].map((option) => {
          const selected = selectedValue === option.value;

          return (
            <button
              key={option.label}
              type="button"
              disabled={isBusy}
              onClick={() => onSelect(option.value)}
              className={cn(
                "rounded-[1rem] border px-3 py-2 text-sm font-semibold transition",
                selected
                  ? "border-slate-950 bg-slate-950 text-white shadow-[0_10px_18px_rgba(15,23,42,0.16)]"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    );
  }

  function renderStatusControl(pkg: PackageRecord, compact = false) {
    const nextStatus = getStatusOptionsForPackage(pkg.package_type, pkg.status)[1];

    return (
      <div className={cn("flex items-center whitespace-nowrap", compact ? "gap-1.5" : "gap-2")}>
        <span
          className={cn(
            "status-chip",
            compact ? "px-2.5 py-2 text-[0.72rem]" : "",
            statusPill(pkg.status),
          )}
        >
          {getCompactStatusLabel(pkg.status)}
        </span>
        {nextStatus ? (
          <button
            type="button"
            onClick={() => handleStatusSelect(pkg, nextStatus)}
            disabled={isBusy}
            title={`Move to ${getCompactStatusLabel(nextStatus)}`}
            aria-label={`Move ${pkg.order_id} to ${getCompactStatusLabel(nextStatus)}`}
            className={cn(
              "inline-flex items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50",
              compact ? "h-9 w-9 text-base" : "h-8 w-8 text-sm",
            )}
          >
            <span aria-hidden="true">→</span>
          </button>
        ) : (
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
            Done
          </span>
        )}
      </div>
    );
  }

  async function handlePaymentStatusChange(
    packageId: string,
    orderId: string,
    paymentStatus: Extract<PaymentStatus, "UNPAID" | "PAID">,
  ) {
    setBusyAction("updatePayment");
    const loadingToastId = showLoadingToast(
      paymentStatus === "PAID" ? "Marking paid" : "Marking not paid",
      `${orderId} payment is being updated.`,
    );

    try {
      const response = await fetchWithTimeout(
        `/api/admin/packages/${packageId}/payment`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentStatus }),
        },
        20000,
      );
      const payload = await parseApiResponse<{ package: PackageRecord }>(response);

      setAllPackages((prev) =>
        prev.map((row) => (row.id === packageId ? payload.package : row)),
      );
      pushToast(
        "success",
        paymentStatus === "PAID" ? "Marked paid" : "Marked not paid",
        payload.package.order_id,
      );
    } catch (error) {
      pushToast(
        "error",
        "Failed to update payment",
        error instanceof Error ? error.message : "Unknown error",
      );
    } finally {
      dismissToast(loadingToastId);
      setBusyAction(null);
    }
  }

  function renderPaymentControls(pkg: PackageRecord, compact = false) {
    const isPaid = pkg.payment_status === "PAID";
    const nextStatus = isPaid ? "UNPAID" : "PAID";

    return (
      <button
        type="button"
        onClick={() => void handlePaymentStatusChange(pkg.id, pkg.order_id, nextStatus)}
        disabled={isBusy}
        className={cn(
          "status-chip justify-center border transition",
          compact ? "min-w-[4.9rem] px-2.5 py-2 text-[0.72rem]" : "min-w-[5.8rem] px-3 py-2 text-[0.75rem]",
          isPaid
            ? "border-emerald-200 bg-emerald-100 text-emerald-700"
            : "border-slate-200 bg-slate-100 text-slate-700",
        )}
        aria-pressed={isPaid}
      >
        {isPaid ? "Paid" : "Not Paid"}
      </button>
    );
  }

  function renderSmsInfo(pkg: PackageRecord) {
    return (
      <div className="space-y-1">
        <p className="text-sm font-medium text-slate-700">
          {pkg.last_delivery_state ?? "No message yet"}
        </p>
        {pkg.last_notification_at ? (
          <p className="text-xs text-slate-500">
            {formatAccraDateTime(pkg.last_notification_at)}
          </p>
        ) : null}
        {canRetrySms(pkg.last_delivery_state) ? (
          <button
            type="button"
            onClick={() => void handleRetrySms(pkg.id)}
            disabled={isBusy}
            className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            {pendingSmsRetryPackageId === pkg.id ? "Retrying..." : "Retry SMS"}
          </button>
        ) : null}
      </div>
    );
  }

  function renderPackageCard(pkg: PackageRecord) {
    return (
      <article key={pkg.id} className="metric-tile p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="font-display text-xl font-semibold text-slate-950">
              {pkg.order_id}
            </p>
            <p className="mt-1 break-words text-sm leading-5 text-slate-600">
              {pkg.customer_name} • Room {pkg.room_number}
            </p>
          </div>
          <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
            {renderPaymentControls(pkg, true)}
            {renderStatusControl(pkg, true)}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="surface-subtle px-4 py-3">
            <p className="label-kicker">Package</p>
            <p className="mt-2 text-sm font-semibold text-slate-950">
              {getCompactPackageTypeLabel(pkg.package_type)}
            </p>
          </div>
          <div className="surface-subtle px-4 py-3">
            <p className="label-kicker">Phone</p>
            <p className="mt-2 text-sm font-semibold text-slate-950">
              {pkg.primary_phone}
            </p>
          </div>
          <div className="surface-subtle px-4 py-3">
            <p className="label-kicker">Clothes</p>
            <p className="mt-2 text-sm font-semibold text-slate-950">{pkg.clothes_count}</p>
          </div>
          <div className="surface-subtle px-4 py-3">
            <p className="label-kicker">Weight</p>
            <p className="mt-2 text-sm font-semibold text-slate-950">
              {pkg.total_weight_kg.toFixed(2)} kg
            </p>
          </div>
          <div className="surface-subtle px-4 py-3">
            <p className="label-kicker">Price</p>
            <p className="mt-2 text-sm font-semibold text-slate-950">
              {pkg.total_price_ghs.toFixed(2)}
            </p>
          </div>
          <div className="surface-subtle px-4 py-3">
            <p className="label-kicker">SMS</p>
            <div className="mt-2">{renderSmsInfo(pkg)}</div>
          </div>
        </div>
      </article>
    );
  }

  function renderPackageTable(packages: PackageRecord[]) {
    return (
      <div className="table-wrap hidden md:block">
        <table className="data-table compact-table min-w-[1080px]">
          <thead>
            <tr className="text-left">
              <th className="font-semibold">Order</th>
              <th className="font-semibold">Customer</th>
              <th className="font-semibold">Package</th>
              <th className="font-semibold">Phone</th>
              <th className="font-semibold">Clothes</th>
              <th className="font-semibold">Room</th>
              <th className="font-semibold">Weight</th>
              <th className="font-semibold">Price</th>
              <th className="w-[7.5rem] min-w-[7.5rem] font-semibold">Payment</th>
              <th className="w-[11rem] min-w-[11rem] font-semibold">Status</th>
              <th className="w-[11rem] min-w-[11rem] font-semibold">SMS</th>
            </tr>
          </thead>
          <tbody>
            {packages.map((pkg) => (
              <tr key={pkg.id} className="text-slate-700 transition">
                <td className="font-semibold text-slate-900">{pkg.order_id}</td>
                <td>{pkg.customer_name}</td>
                <td className="whitespace-nowrap">
                  {getCompactPackageTypeLabel(pkg.package_type)}
                </td>
                <td>{pkg.primary_phone}</td>
                <td>{pkg.clothes_count}</td>
                <td>{pkg.room_number}</td>
                <td>{pkg.total_weight_kg.toFixed(2)} kg</td>
                <td className="whitespace-nowrap">{pkg.total_price_ghs.toFixed(2)}</td>
                <td className="w-[7.5rem] min-w-[7.5rem]">{renderPaymentControls(pkg)}</td>
                <td className="w-[11rem] min-w-[11rem]">{renderStatusControl(pkg)}</td>
                <td className="w-[11rem] min-w-[11rem]">{renderSmsInfo(pkg)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function submitStatusDialog(nextDialog: StatusDialogState) {
    if (nextDialog.nextStatus === "READY_FOR_PICKUP") {
      if (nextDialog.packageType === "NORMAL_WASH_DRY") {
        if (
          nextDialog.foldCompleted === null ||
          !nextDialog.removeWorkerName ||
          (nextDialog.foldCompleted && !nextDialog.foldWorkerName)
        ) {
          return;
        }

        void handleStatusChange(
          nextDialog.packageId,
          nextDialog.orderId,
          nextDialog.nextStatus,
          {
            readyForPickupDetails: {
              removeWorkerName: nextDialog.removeWorkerName as LaundryWorker,
              foldCompleted: nextDialog.foldCompleted,
              foldWorkerName: nextDialog.foldCompleted
                ? (nextDialog.foldWorkerName as LaundryWorker)
                : undefined,
            },
          },
        );
        return;
      }

      if (nextDialog.packageType === "EXPRESS_WASH_DRY") {
        if (!nextDialog.removeWorkerName) {
          return;
        }

        void handleStatusChange(
          nextDialog.packageId,
          nextDialog.orderId,
          nextDialog.nextStatus,
          {
            readyForPickupDetails: {
              removeWorkerName: nextDialog.removeWorkerName as LaundryWorker,
            },
          },
        );
        return;
      }
    }

    if (!getPayableTaskForStatus(nextDialog.packageType, nextDialog.nextStatus)) {
      return;
    }

    if (!nextDialog.workerName) {
      return;
    }

    void handleStatusChange(
      nextDialog.packageId,
      nextDialog.orderId,
      nextDialog.nextStatus,
      { workerName: nextDialog.workerName as LaundryWorker },
    );
  }

  async function handleStatusChange(
    packageId: string,
    orderId: string,
    nextStatus: PackageStatus,
    input: {
      workerName?: LaundryWorker;
      readyForPickupDetails?: {
        removeWorkerName?: LaundryWorker;
        foldCompleted?: boolean;
        foldWorkerName?: LaundryWorker;
      };
    },
  ) {
    setBusyAction("updateStatus");
    const loadingToastId = showLoadingToast(
      "Updating status",
      `${orderId} is being moved to ${getStatusLabel(nextStatus)}.`,
    );
    try {
      const response = await fetchWithTimeout(
        `/api/admin/packages/${packageId}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: nextStatus,
            workerName: input.workerName,
            readyForPickupDetails: input.readyForPickupDetails,
          }),
        },
        30000,
      );
      const payload = await parseApiResponse<{
        package: PackageRecord;
        skipped: boolean;
        notifications: NotificationAttempt[];
      }>(response);

      setAllPackages((prev) => {
        const updated = prev.map((row) =>
          row.id === packageId ? payload.package : row,
        );
        return updated;
      });
      setStatusDialog(null);

      pushToast(
        "success",
        payload.skipped ? "Status unchanged" : "Status updated",
        payload.package.order_id,
      );

      if (
        !payload.skipped &&
        payload.notifications.length === 0 &&
        payload.package.last_delivery_state === "PENDING"
      ) {
        pushToast("info", "Status updated", "SMS is sending in the background.");
      }

      const failedNotifications = payload.notifications.filter((item) => !item.ok);
      if (failedNotifications.length > 0) {
        pushToast(
          "warning",
          "Status updated but SMS failed",
          failedNotifications
            .map((item) => `${item.phoneNumber}: ${item.errorText ?? item.deliveryState}`)
            .join(" | "),
        );
      }
    } catch (error) {
      pushToast(
        "error",
        "Failed to update status",
        error instanceof Error ? error.message : "Unknown error",
      );
    } finally {
      dismissToast(loadingToastId);
      setBusyAction(null);
    }
  }

  async function handleRetrySms(packageId: string) {
    setBusyAction("retrySms");
    setPendingSmsRetryPackageId(packageId);
    const targetPackage = allPackages.find((item) => item.id === packageId);
    const loadingToastId = showLoadingToast(
      "Retrying SMS",
      targetPackage
        ? `Trying the latest failed SMS again for ${targetPackage.order_id}.`
        : "Trying the latest failed SMS again.",
    );
    try {
      const response = await fetchWithTimeout(
        `/api/admin/packages/${packageId}/notifications`,
        {
          method: "POST",
        },
        25000,
      );
      const payload = await parseApiResponse<{
        package: PackageRecord;
        notifications: NotificationAttempt[];
      }>(response);

      setAllPackages((prev) =>
        prev.map((row) => (row.id === packageId ? payload.package : row)),
      );

      const failedNotifications = payload.notifications.filter((item) => !item.ok);
      if (failedNotifications.length > 0) {
        pushToast(
          "warning",
          "SMS retry failed",
          failedNotifications
            .map((item) => `${item.phoneNumber}: ${item.errorText ?? item.deliveryState}`)
            .join(" | "),
        );
        return;
      }

      pushToast("success", "SMS retried", payload.package.order_id);
    } catch (error) {
      pushToast(
        "error",
        "Failed to retry SMS",
        error instanceof Error ? error.message : "Unknown error",
      );
    } finally {
      dismissToast(loadingToastId);
      setPendingSmsRetryPackageId(null);
      setBusyAction(null);
    }
  }

  if (loading) {
    return <SkeletonPackagesPage />;
  }

  return (
    <>
      <Toaster toasts={toasts} dismiss={dismissToast} />

      <section className="mb-5 grid grid-cols-3 gap-2 sm:gap-4">
        <article className="metric-tile px-3 py-3 sm:px-5 sm:py-5">
          <p className="label-kicker">
            <span className="sm:hidden">Week</span>
            <span className="hidden sm:inline">Active Week</span>
          </p>
          <p
            className="mt-2 truncate text-xs font-semibold text-slate-950 sm:mt-3 sm:text-lg"
            title={currentWeek?.label ?? "No active week"}
          >
            <span className="sm:hidden">{currentWeekCompactLabel}</span>
            <span className="hidden sm:inline">{currentWeek?.label ?? "No active week"}</span>
          </p>
        </article>
        <article className="metric-tile px-3 py-3 sm:px-5 sm:py-5">
          <p className="label-kicker">
            <span className="sm:hidden">Left</span>
            <span className="hidden sm:inline">Time Left</span>
          </p>
          <p
            className="mt-2 truncate text-xs font-semibold text-slate-950 sm:mt-3 sm:text-lg"
            title={currentWeekRemaining}
          >
            <span className="sm:hidden">{currentWeekRemainingCompact}</span>
            <span className="hidden sm:inline">{currentWeekRemaining}</span>
          </p>
        </article>
        <article className="metric-tile px-3 py-3 sm:px-5 sm:py-5">
          <p className="label-kicker">
            <span className="sm:hidden">Ready</span>
            <span className="hidden sm:inline">Ready for Pickup</span>
          </p>
          <p className="font-display mt-2 text-xl font-semibold text-slate-950 sm:mt-3 sm:text-3xl">
            {displayedMetrics.readyCount}
          </p>
        </article>
      </section>

      <section className="mb-5 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <article className="glass-card overflow-hidden">
          <div className="border-b border-slate-200/70 px-5 py-4">
            <p className="label-kicker">Create Package</p>
          </div>
          <form className="grid gap-4 p-5 sm:grid-cols-2" onSubmit={handleCreatePackage}>
            <input
              type="text"
              placeholder="Customer name"
              required
              value={createForm.customerName}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, customerName: event.target.value }))
              }
              className="input-control"
            />
            <input
              type="text"
              placeholder="Room number"
              required
              value={createForm.roomNumber}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, roomNumber: event.target.value }))
              }
              className="input-control"
            />
            <select
              value={createForm.packageType}
              onChange={(event) => {
                const packageType = event.target.value as PackageType;
                setCreateForm((prev) => ({
                  ...prev,
                  packageType,
                  etaAt: toLocalDatetimeValue(getSuggestedEtaDate(packageType)),
                }));
              }}
              className="input-control"
            >
              {PACKAGE_TYPES.map((packageType) => (
                <option key={packageType} value={packageType}>
                  {getPackageTypeOptionLabel(packageType)}
                </option>
              ))}
            </select>
            <select
              value={createForm.workerName}
              onChange={(event) =>
                setCreateForm((prev) => ({
                  ...prev,
                  workerName: event.target.value as LaundryWorker,
                }))
              }
              className="input-control"
            >
              {LAUNDRY_WORKERS.map((worker) => (
                <option key={worker} value={worker}>
                  {getWorkerLabel(worker)}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              step={1}
              placeholder="Number of clothes"
              required
              value={createForm.clothesCount}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, clothesCount: event.target.value }))
              }
              className="input-control"
            />
            <input
              type="number"
              min={0.01}
              step={0.01}
              placeholder="Total weight (kg)"
              required
              value={createForm.totalWeightKg}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, totalWeightKg: event.target.value }))
              }
              className="input-control"
            />
            <input
              type="text"
              readOnly
              value={`GHS ${pricePreview.totalPriceGhs.toFixed(2)}`}
              className="input-control bg-slate-50 font-semibold text-slate-700"
            />
            <input
              type="tel"
              placeholder="Primary phone (+233...)"
              required
              value={createForm.primaryPhone}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, primaryPhone: event.target.value }))
              }
              className="input-control"
            />
            <input
              type="tel"
              placeholder="Secondary phone (optional)"
              value={createForm.secondaryPhone}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, secondaryPhone: event.target.value }))
              }
              className="input-control"
            />
            <input
              type="datetime-local"
              required
              value={createForm.etaAt}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, etaAt: event.target.value }))
              }
              className="input-control"
            />

            <div className="sm:col-span-2 flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={busyAction === "createPackage" || !currentWeek}
                className="btn btn-primary w-full sm:w-auto"
              >
                {busyAction === "createPackage" ? "Creating..." : "Create Package"}
              </button>
              {!currentWeek ? (
                <p className="w-full text-xs text-amber-700">
                  Start a week at /admin/private before creating packages.
                </p>
              ) : null}
            </div>
          </form>
        </article>

        <article className="glass-card overflow-hidden">
          <div className="border-b border-slate-200/70 px-5 py-4">
            <p className="label-kicker">Latest Created Package</p>
          </div>
          <div className="p-5">
            {lastCreated ? (
              <div className="space-y-3">
                <div className="metric-tile p-4">
                  <p className="label-kicker">Order ID</p>
                  <p className="font-display mt-2 text-xl font-semibold text-slate-950">
                    {lastCreated.orderId}
                  </p>
                </div>
                <div className="metric-tile p-4">
                  <p className="label-kicker">Tracking Link</p>
                  <Link
                    href={lastCreated.trackingUrl}
                    target="_blank"
                    className="mt-2 block break-all text-sm leading-6 text-sky-700 underline"
                  >
                    {lastCreated.trackingUrl}
                  </Link>
                </div>
              </div>
            ) : (
              <p className="metric-tile p-4 text-sm leading-6 text-slate-500">
                No package has been created in this session yet.
              </p>
            )}
          </div>
        </article>
      </section>

      <section className="space-y-4">
        {visibleWeekSections.length === 0 ? (
          <article className="glass-card overflow-hidden">
            <p className="p-5 text-center text-sm leading-6 text-slate-500">
              No packages match the current live filters.
            </p>
          </article>
        ) : (
          visibleWeekSections.map((section) => {
            const title = section.week?.label ?? `Week ${section.weekId.slice(0, 8)}`;
            const rangeLabel = section.week
              ? getWeekRangeLabel(section.week)
              : "Week details unavailable for this package batch.";
            const sectionSearch = weekSearchTerms[section.weekId] ?? "";
            const trimmedSectionSearch = sectionSearch.trim();
            const sectionSortIsDescending = weekSortDescending[section.weekId] ?? false;
            const sectionStatusFilter = weekStatusFilters[section.weekId] ?? "ALL";
            const sectionPaymentFilter = weekPaymentFilters[section.weekId] ?? "ALL";
            const sectionIsCollapsed = collapsedWeeks[section.weekId] ?? section.status !== "ACTIVE";
            const sectionVisiblePackages = sortPackagesForDisplay(
              section.packages.filter((pkg) => {
                const matchesStatus =
                  sectionStatusFilter === "ALL" || pkg.status === sectionStatusFilter;
                const matchesPayment =
                  sectionPaymentFilter === "ALL" || pkg.payment_status === sectionPaymentFilter;

                return (
                  matchesStatus &&
                  matchesPayment &&
                  matchesSearch(pkg, trimmedSectionSearch)
                );
              }),
              sectionSortIsDescending,
            );
            const emptyMessage =
              Boolean(trimmedSectionSearch) ||
              sectionStatusFilter !== "ALL" ||
              sectionPaymentFilter !== "ALL"
                ? "No packages in this week match the current filters."
                : section.status === "ACTIVE"
                  ? "No packages have been created for this week yet."
                  : "No packages were found for this week.";

            return (
              <article key={section.weekId} className="glass-card overflow-hidden">
                <div className="border-b border-slate-200/70 px-5 py-4">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-display text-2xl font-semibold text-slate-950">
                            {title}
                          </p>
                          <span className={`status-chip ${weekStatusPill(section.status)}`}>
                            {section.status}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-500">{rangeLabel}</p>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3 lg:justify-end">
                        <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                          <span>{section.packageCount} packages</span>
                          <span>{section.totalWeight.toFixed(2)} kg</span>
                          <span>GHS {section.totalRevenue.toFixed(2)}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setCollapsedWeeks((prev) => ({
                              ...prev,
                              [section.weekId]: !sectionIsCollapsed,
                            }))
                          }
                          className="btn btn-secondary"
                          aria-expanded={!sectionIsCollapsed}
                          aria-controls={`week-panel-${section.weekId}`}
                        >
                          {sectionIsCollapsed ? "Expand" : "Collapse"}
                        </button>
                      </div>
                    </div>

                    <div>
                      <div className="grid gap-2 lg:grid-cols-[minmax(0,1.5fr)_minmax(10rem,0.8fr)_minmax(10rem,0.8fr)_auto]">
                        <input
                          type="text"
                          value={sectionSearch}
                          onChange={(event) =>
                            setWeekSearchTerms((prev) => ({
                              ...prev,
                              [section.weekId]: event.target.value,
                            }))
                          }
                          placeholder="Search this week"
                          className="input-control"
                        />
                        <select
                          value={sectionStatusFilter}
                          onChange={(event) =>
                            setWeekStatusFilters((prev) => ({
                              ...prev,
                              [section.weekId]: event.target.value as PackageStatus | "ALL",
                            }))
                          }
                          className="input-control min-w-[160px]"
                        >
                          <option value="ALL">All statuses</option>
                          {(Object.keys(STATUS_ORDER) as PackageStatus[]).map((status) => (
                            <option key={status} value={status}>
                              {getCompactStatusLabel(status)}
                            </option>
                          ))}
                        </select>
                        <select
                          value={sectionPaymentFilter}
                          onChange={(event) =>
                            setWeekPaymentFilters((prev) => ({
                              ...prev,
                              [section.weekId]: event.target.value as PaymentStatusFilter,
                            }))
                          }
                          className="input-control min-w-[160px]"
                        >
                          <option value="ALL">All payments</option>
                          {PAYMENT_STATUS_OPTIONS.filter((status) => status !== "ALL").map(
                            (status) => (
                              <option key={status} value={status}>
                                {getCompactPaymentLabel(status)}
                              </option>
                            ),
                          )}
                        </select>
                        <button
                          type="button"
                          onClick={() =>
                            setWeekSortDescending((prev) => ({
                              ...prev,
                              [section.weekId]: !sectionSortIsDescending,
                            }))
                          }
                          className="btn btn-secondary w-full lg:w-auto"
                        >
                          Sort {sectionSortIsDescending ? "↓" : "↑"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {sectionIsCollapsed ? null : sectionVisiblePackages.length === 0 ? (
                  <p className="p-5 text-sm leading-6 text-slate-500">{emptyMessage}</p>
                ) : (
                  <div id={`week-panel-${section.weekId}`}>
                    <div className="space-y-4 p-4 md:hidden">
                      {sectionVisiblePackages.map((pkg) => renderPackageCard(pkg))}
                    </div>
                    {renderPackageTable(sectionVisiblePackages)}
                  </div>
                )}
              </article>
            );
          })
        )}
      </section>

      {statusDialog ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/48 px-4 py-6 backdrop-blur-sm">
          <div className="glass-card max-h-[calc(100vh-2rem)] w-full max-w-[720px] overflow-auto">
            <div className="border-b border-slate-200/70 px-5 py-4">
              <p className="label-kicker">Status Update</p>
              <h3 className="font-display mt-2 text-2xl font-semibold text-slate-950">
                {statusDialog.orderId}
              </h3>
            </div>

            <div className="grid gap-4 p-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="metric-tile p-4">
                  <p className="label-kicker">Current Status</p>
                  <p className="mt-2 text-lg font-semibold text-slate-950">
                    {getStatusLabel(statusDialog.currentStatus)}
                  </p>
                </div>
                <div className="metric-tile p-4">
                  <p className="label-kicker">Next Status</p>
                  <p className="mt-2 text-lg font-semibold text-slate-950">
                    {getStatusLabel(statusDialog.nextStatus)}
                  </p>
                </div>
              </div>

              {statusDialog.nextStatus === "READY_FOR_PICKUP" &&
              statusDialog.packageType === "NORMAL_WASH_DRY" ? (
                <div className="grid gap-4">
                  <div className="metric-tile p-4">
                    <p className="label-kicker">Paid Tasks</p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">
                      Removed From Line
                      {statusDialog.foldCompleted ? " + Folded" : ""}
                    </p>
                    <p className="mt-2 text-sm font-medium text-slate-500">Your Side</p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="metric-tile p-4">
                      <p className="label-kicker">Remove Worker</p>
                      {renderWorkerChoices(statusDialog.removeWorkerName, (worker) => {
                        const nextDialog = {
                          ...statusDialog,
                          removeWorkerName: worker,
                        };
                        setStatusDialog(nextDialog);
                        submitStatusDialog(nextDialog);
                      })}
                    </div>
                    <div className="metric-tile p-4">
                      <p className="label-kicker">Folded?</p>
                      {renderFoldChoices(statusDialog.foldCompleted, (value) => {
                        const nextDialog = {
                          ...statusDialog,
                          foldCompleted: value,
                          foldWorkerName: value ? statusDialog.foldWorkerName : "",
                        };
                        setStatusDialog(nextDialog);
                        submitStatusDialog(nextDialog);
                      })}
                    </div>
                  </div>
                  {statusDialog.foldCompleted ? (
                    <div className="metric-tile p-4">
                      <p className="label-kicker">Fold Worker</p>
                      {renderWorkerChoices(statusDialog.foldWorkerName, (worker) => {
                        const nextDialog = {
                          ...statusDialog,
                          foldWorkerName: worker,
                        };
                        setStatusDialog(nextDialog);
                        submitStatusDialog(nextDialog);
                      })}
                    </div>
                  ) : null}
                </div>
              ) : statusDialog.nextStatus === "READY_FOR_PICKUP" &&
                statusDialog.packageType === "EXPRESS_WASH_DRY" ? (
                <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
                  <div className="metric-tile p-4">
                    <p className="label-kicker">Paid Task</p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">
                      Removed and Folded From Dryer
                    </p>
                    <p className="mt-2 text-sm font-medium text-slate-500">
                      {getOwnerSideLabel("PARTNER_SIDE")}
                    </p>
                  </div>

                  <div className="metric-tile p-4">
                    <p className="label-kicker">Worker</p>
                    {renderWorkerChoices(statusDialog.removeWorkerName, (worker) => {
                        const nextDialog = {
                          ...statusDialog,
                          removeWorkerName: worker,
                        };
                        setStatusDialog(nextDialog);
                        submitStatusDialog(nextDialog);
                    })}
                  </div>
                </div>
              ) : getPayableTaskForStatus(
                statusDialog.packageType,
                statusDialog.nextStatus,
              ) ? (
                <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
                  <div className="metric-tile p-4">
                    <p className="label-kicker">Paid Task</p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">
                      {
                        getTaskLabel(
                          getPayableTaskForStatus(
                            statusDialog.packageType,
                            statusDialog.nextStatus,
                          )!.taskType,
                        )
                      }
                    </p>
                    <p className="mt-2 text-sm font-medium text-slate-500">
                      {
                        getOwnerSideLabel(
                          getPayableTaskForStatus(
                            statusDialog.packageType,
                            statusDialog.nextStatus,
                          )!.ownerSide,
                        )
                      }
                    </p>
                  </div>

                  <div className="metric-tile p-4">
                    <p className="label-kicker">Worker</p>
                    {renderWorkerChoices(statusDialog.workerName, (worker) => {
                        const nextDialog = {
                          ...statusDialog,
                          workerName: worker,
                        };
                        setStatusDialog(nextDialog);
                        submitStatusDialog(nextDialog);
                    })}
                  </div>
                </div>
              ) : (
                <div className="metric-tile p-4">
                  <p className="label-kicker">Worker Assignment</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    No worker payout is attached to this status change.
                  </p>
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setStatusDialog(null);
                  }}
                  disabled={isBusy}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
