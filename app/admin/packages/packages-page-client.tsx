"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  calculatePackagePricing,
  getPackageTypeLabel,
  getPackageTypeOptionLabel,
  getPackageTypeTurnaroundLabel,
  getSuggestedEtaDate,
} from "@/lib/package-pricing";
import {
  getOwnerSideLabel,
  getPayableTaskForStatus,
  getTaskLabel,
  getWorkerLabel,
} from "@/lib/payouts";
import { getStatusLabel } from "@/lib/status";
import { formatAccraDateTime } from "@/lib/time";
import {
  LAUNDRY_WORKERS,
  PACKAGE_STATUSES,
  PACKAGE_TYPES,
  type LaundryWorker,
  type PackageRecord,
  type PackageStatus,
  type PackageType,
  type ProcessingWeek,
} from "@/lib/types";

import { AdminShell } from "../_components/admin-shell";
import {
  cn,
  fetchWithTimeout,
  parseApiResponse,
  toLocalDatetimeValue,
} from "../_components/client-utils";
import { Toaster, useToasts } from "../_components/toaster";

interface PackagesPageClientProps {
  userEmail: string;
  initialCurrentWeek: ProcessingWeek | null;
  initialPackages: PackageRecord[];
  initialLoadReady: boolean;
  initialLoadError: string | null;
}

interface CreatePackageForm {
  customerName: string;
  roomNumber: string;
  packageType: PackageType;
  clothesCount: string;
  totalWeightKg: string;
  primaryPhone: string;
  secondaryPhone: string;
  etaAt: string;
}

interface LastCreatedInfo {
  orderId: string;
  trackingUrl: string;
  qrCodeDataUrl: string;
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
  workerName: LaundryWorker;
}

type BusyAction =
  | null
  | "refresh"
  | "search"
  | "createPackage"
  | "updateStatus"
  | "retrySms";
type PendingStatusUpdate = {
  packageId: string;
  nextStatus: PackageStatus;
} | null;
type StatusDrafts = Record<string, PackageStatus>;
type WorkerDrafts = Record<string, LaundryWorker>;

const PACKAGES_BOOTSTRAP_STORAGE_KEY = "heisck.admin.packages.bootstrap";

const STATUS_ORDER: Record<PackageStatus, number> = {
  RECEIVED: 0,
  WASHING: 1,
  DRYING: 2,
  READY_FOR_PICKUP: 3,
  PICKED_UP: 4,
};

const initialPackageForm: CreatePackageForm = {
  customerName: "",
  roomNumber: "",
  packageType: "NORMAL_WASH_DRY",
  clothesCount: "",
  totalWeightKg: "",
  primaryPhone: "",
  secondaryPhone: "",
  etaAt: "",
};

function matchesSearch(record: PackageRecord, query: string): boolean {
  if (!query) {
    return true;
  }

  const normalized = query.toLowerCase();
  return (
    record.order_id.toLowerCase().includes(normalized) ||
    record.customer_name.toLowerCase().includes(normalized) ||
    record.room_number.toLowerCase().includes(normalized)
  );
}

function statusOptionsFor(current: PackageStatus): PackageStatus[] {
  return PACKAGE_STATUSES.filter(
    (status) =>
      status === current || STATUS_ORDER[status] > STATUS_ORDER[current],
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

    return parsed;
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

function SkeletonPackagesPage({ userEmail }: { userEmail: string }) {
  return (
    <AdminShell
      userEmail={userEmail}
      title="Packages"
      subtitle="Create customer packages, track updates, and manage status changes."
    >
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
    </AdminShell>
  );
}

export function PackagesPageClient({
  userEmail,
  initialCurrentWeek,
  initialPackages,
  initialLoadReady,
  initialLoadError,
}: PackagesPageClientProps) {
  const { toasts, pushToast, dismissToast } = useToasts();

  const [currentWeek, setCurrentWeek] = useState<ProcessingWeek | null>(
    initialCurrentWeek,
  );
  const [allPackages, setAllPackages] = useState<PackageRecord[]>(initialPackages);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PackageStatus | "ALL">("ALL");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [appliedStatusFilter, setAppliedStatusFilter] = useState<
    PackageStatus | "ALL"
  >("ALL");
  const [createForm, setCreateForm] = useState<CreatePackageForm>({
    ...initialPackageForm,
    etaAt: toLocalDatetimeValue(getSuggestedEtaDate("NORMAL_WASH_DRY")),
  });
  const [lastCreated, setLastCreated] = useState<LastCreatedInfo | null>(null);
  const [qrFullscreenOpen, setQrFullscreenOpen] = useState(false);
  const [loading, setLoading] = useState(!initialLoadReady);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [pendingStatusUpdate, setPendingStatusUpdate] =
    useState<PendingStatusUpdate>(null);
  const [pendingSmsRetryPackageId, setPendingSmsRetryPackageId] = useState<
    string | null
  >(null);
  const [statusDrafts, setStatusDrafts] = useState<StatusDrafts>({});
  const [workerDrafts, setWorkerDrafts] = useState<WorkerDrafts>({});
  const [statusDialog, setStatusDialog] = useState<StatusDialogState | null>(null);
  const initRef = useRef(false);

  const isBusy = busyAction !== null;

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

  const visiblePackages = useMemo(() => {
    return allPackages.filter((record) => {
      const matchesStatus =
        appliedStatusFilter === "ALL" || record.status === appliedStatusFilter;
      return matchesStatus && matchesSearch(record, appliedSearch);
    });
  }, [allPackages, appliedSearch, appliedStatusFilter]);

  const displayedMetrics = useMemo(() => {
    const packageCount = visiblePackages.length;
    const totalKg = visiblePackages.reduce(
      (sum, item) => sum + item.total_weight_kg,
      0,
    );
    const totalRevenue = visiblePackages.reduce(
      (sum, item) => sum + item.total_price_ghs,
      0,
    );
    const readyCount = visiblePackages.filter(
      (item) => item.status === "READY_FOR_PICKUP",
    ).length;

    return {
      packageCount,
      totalKg,
      totalRevenue,
      readyCount,
    };
  }, [visiblePackages]);

  const pricePreview = useMemo(() => {
    const weightKg = Number(createForm.totalWeightKg);
    return calculatePackagePricing(weightKg, createForm.packageType);
  }, [createForm.packageType, createForm.totalWeightKg]);

  const statusDialogTask = useMemo(() => {
    if (!statusDialog) {
      return null;
    }

    return getPayableTaskForStatus(
      statusDialog.packageType,
      statusDialog.nextStatus,
    );
  }, [statusDialog]);

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
        qrCodeDataUrl: string;
        notifications: NotificationAttempt[];
      }>(response);

      setCreateForm({
        ...initialPackageForm,
        etaAt: toLocalDatetimeValue(getSuggestedEtaDate("NORMAL_WASH_DRY")),
      });
      setLastCreated({
        orderId: payload.package.order_id,
        trackingUrl: payload.trackingUrl,
        qrCodeDataUrl: payload.qrCodeDataUrl,
      });
      setQrFullscreenOpen(true);
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

  function getSelectedStatus(pkg: PackageRecord): PackageStatus {
    if (pendingStatusUpdate?.packageId === pkg.id) {
      return pendingStatusUpdate.nextStatus;
    }

    return statusDrafts[pkg.id] ?? pkg.status;
  }

  function getSelectedWorker(packageId: string): LaundryWorker {
    return workerDrafts[packageId] ?? "NOBODY";
  }

  function handleOpenStatusDialog(pkg: PackageRecord) {
    const nextStatus = getSelectedStatus(pkg);
    if (nextStatus === pkg.status) {
      return;
    }

    setStatusDialog({
      packageId: pkg.id,
      orderId: pkg.order_id,
      packageType: pkg.package_type,
      currentStatus: pkg.status,
      nextStatus,
      workerName: getSelectedWorker(pkg.id),
    });
  }

  async function handleConfirmStatusDialog() {
    if (!statusDialog) {
      return;
    }

    await handleStatusChange(
      statusDialog.packageId,
      statusDialog.orderId,
      statusDialog.nextStatus,
      statusDialog.workerName,
    );
  }

  async function handleStatusChange(
    packageId: string,
    orderId: string,
    nextStatus: PackageStatus,
    workerName: LaundryWorker,
  ) {
    setBusyAction("updateStatus");
    setPendingStatusUpdate({ packageId, nextStatus });
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
          body: JSON.stringify({ status: nextStatus, workerName }),
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
      setStatusDrafts((prev) => ({
        ...prev,
        [packageId]: payload.package.status,
      }));
      setWorkerDrafts((prev) => ({
        ...prev,
        [packageId]: "NOBODY",
      }));
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
      setPendingStatusUpdate(null);
      setBusyAction(null);
    }
  }

  async function handleFilterSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyAction("search");
    try {
      setAppliedSearch(search.trim());
      setAppliedStatusFilter(statusFilter);
      pushToast("info", "Filters applied");
    } catch (error) {
      pushToast(
        "error",
        "Failed to apply filters",
        error instanceof Error ? error.message : "Unknown error",
      );
    } finally {
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
    return <SkeletonPackagesPage userEmail={userEmail} />;
  }

  return (
    <AdminShell
      userEmail={userEmail}
      title="Packages"
      subtitle="Create customer packages, track updates, and manage status changes."
    >
      <Toaster toasts={toasts} dismiss={dismissToast} />

      <section className="glass-card mb-5 overflow-hidden">
        <div className="border-b border-slate-200/70 px-5 py-4">
          <p className="label-kicker">Current Processing Week</p>
        </div>
        <div className="grid gap-4 p-5 md:grid-cols-3">
          <div className="metric-tile px-4 py-4">
            <p className="label-kicker">Label</p>
            <p className="mt-2 text-lg font-semibold text-slate-950">
              {currentWeek?.label ?? "No active week"}
            </p>
          </div>
          <div className="metric-tile px-4 py-4">
            <p className="label-kicker">Week End</p>
            <p className="mt-2 text-lg font-semibold text-slate-950">
              {currentWeek ? formatAccraDateTime(currentWeek.end_at) : "-"}
            </p>
          </div>
          <div className="metric-tile px-4 py-4">
            <p className="label-kicker">Time Left</p>
            <p className="mt-2 text-lg font-semibold text-slate-950">{currentWeekRemaining}</p>
          </div>
        </div>
      </section>

      <section className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="metric-tile px-5 py-5">
          <p className="label-kicker">Packages</p>
          <p className="font-display mt-3 text-3xl font-semibold text-slate-950">
            {displayedMetrics.packageCount}
          </p>
        </article>
        <article className="metric-tile px-5 py-5">
          <p className="label-kicker">Total Weight</p>
          <p className="font-display mt-3 text-3xl font-semibold text-slate-950">
            {displayedMetrics.totalKg.toFixed(2)} kg
          </p>
        </article>
        <article className="metric-tile px-5 py-5">
          <p className="label-kicker">Total Revenue</p>
          <p className="font-display mt-3 text-3xl font-semibold text-slate-950">
            GHS {displayedMetrics.totalRevenue.toFixed(2)}
          </p>
        </article>
        <article className="metric-tile px-5 py-5">
          <p className="label-kicker">Ready for Pickup</p>
          <p className="font-display mt-3 text-3xl font-semibold text-slate-950">
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

            <div className="surface-subtle sm:col-span-2 grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-5">
              <div className="metric-tile px-4 py-4">
                <p className="label-kicker">
                  Rounded Weight
                </p>
                <p className="mt-2 text-base font-semibold text-slate-950">
                  {pricePreview.roundedWeightKg.toFixed(1)} kg
                </p>
              </div>
              <div className="metric-tile px-4 py-4">
                <p className="label-kicker">
                  Package Rate
                </p>
                <p className="mt-2 text-base font-semibold text-slate-950">
                  GHS {pricePreview.ratePerKg.toFixed(2)}/kg
                </p>
              </div>
              <div className="metric-tile px-4 py-4">
                <p className="label-kicker">
                  Fixed Charge
                </p>
                <p className="mt-2 text-base font-semibold text-slate-950">
                  GHS {pricePreview.fixedChargeGhs.toFixed(2)}
                </p>
              </div>
              <div className="metric-tile px-4 py-4">
                <p className="label-kicker">Total Price</p>
                <p className="mt-2 text-base font-semibold text-slate-950">
                  GHS {pricePreview.totalPriceGhs.toFixed(2)}
                </p>
              </div>
              <div className="metric-tile px-4 py-4">
                <p className="label-kicker">Turnaround</p>
                <p className="mt-2 text-base font-semibold text-slate-950">
                  {getPackageTypeTurnaroundLabel(createForm.packageType)}
                </p>
              </div>
            </div>

            <div className="sm:col-span-2 flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={busyAction === "createPackage" || !currentWeek}
                className="btn btn-primary"
              >
                {busyAction === "createPackage" ? "Creating..." : "Create Package"}
              </button>
              <button
                type="button"
                onClick={() => void refreshAll()}
                disabled={isBusy}
                className="btn btn-secondary"
              >
                {busyAction === "refresh" ? "Refreshing..." : "Refresh"}
              </button>
              {!currentWeek ? (
                <p className="w-full text-xs text-amber-700">
                  Start a processing week on the Weeks page before creating packages.
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
                <div className="metric-tile p-4">
                  <Image
                    src={lastCreated.qrCodeDataUrl}
                    alt="Package tracking QR code"
                    width={210}
                    height={210}
                    unoptimized
                    className="mx-auto h-52 w-52 rounded-xl border border-slate-300 bg-white p-2"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setQrFullscreenOpen(true)}
                  className="btn btn-primary w-full"
                >
                  View QR Fullscreen
                </button>
              </div>
            ) : (
              <p className="metric-tile p-4 text-sm leading-6 text-slate-500">
                No package has been created in this session yet.
              </p>
            )}
          </div>
        </article>
      </section>

      <section className="glass-card overflow-hidden">
        <div className="border-b border-slate-200/70 px-5 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="label-kicker">Package Tracking Table</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Filter locally for faster lookup and cleaner status management.
              </p>
            </div>
            <form className="flex flex-col gap-2 sm:flex-row" onSubmit={handleFilterSubmit}>
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search order, room, customer"
                className="input-control"
              />
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as PackageStatus | "ALL")
                }
                className="input-control min-w-[180px]"
              >
                <option value="ALL">All statuses</option>
                {PACKAGE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {getStatusLabel(status)}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={busyAction === "search"}
                className="btn btn-secondary"
              >
                {busyAction === "search" ? "Applying..." : "Apply"}
              </button>
            </form>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table min-w-[980px]">
            <thead>
              <tr className="text-left">
                <th className="font-semibold">Order</th>
                <th className="font-semibold">Customer</th>
                <th className="font-semibold">Package</th>
                <th className="font-semibold">Room</th>
                <th className="font-semibold">Weight</th>
                <th className="font-semibold">Price</th>
                <th className="font-semibold">Status</th>
                <th className="w-[20rem] min-w-[20rem] font-semibold">Update</th>
                <th className="w-[13rem] min-w-[13rem] font-semibold">SMS</th>
              </tr>
            </thead>
            <tbody>
              {visiblePackages.map((pkg) => (
                <tr key={pkg.id} className="text-slate-700 transition">
                  <td className="font-semibold text-slate-900">{pkg.order_id}</td>
                  <td>{pkg.customer_name}</td>
                  <td>{getPackageTypeLabel(pkg.package_type)}</td>
                  <td>{pkg.room_number}</td>
                  <td>{pkg.total_weight_kg.toFixed(2)} kg</td>
                  <td>GHS {pkg.total_price_ghs.toFixed(2)}</td>
                  <td>
                    <span
                      className={cn(
                        "status-chip",
                        statusPill(pkg.status),
                      )}
                    >
                      {getStatusLabel(pkg.status)}
                    </span>
                  </td>
                  <td className="w-[20rem] min-w-[20rem]">
                    {(() => {
                      const selectedStatus = getSelectedStatus(pkg);
                      const payableTask = getPayableTaskForStatus(
                        pkg.package_type,
                        selectedStatus,
                      );
                      const needsWorker = selectedStatus !== pkg.status && payableTask !== null;

                      return (
                        <>
                          <select
                            value={selectedStatus}
                            disabled={isBusy || pkg.status === "PICKED_UP"}
                            onChange={(event) =>
                              setStatusDrafts((prev) => ({
                                ...prev,
                                [pkg.id]: event.target.value as PackageStatus,
                              }))
                            }
                            className="input-control py-2 text-xs"
                          >
                            {statusOptionsFor(pkg.status).map((status) => (
                              <option key={status} value={status}>
                                {getStatusLabel(status)}
                              </option>
                            ))}
                          </select>
                          {needsWorker ? (
                            <p className="mt-2 text-xs leading-5 text-slate-500">
                              Worker selection opens in the next step for{" "}
                              {getTaskLabel(payableTask.taskType)}.
                            </p>
                          ) : null}
                          {selectedStatus !== pkg.status ? (
                            <button
                              type="button"
                              onClick={() =>
                                needsWorker
                                  ? handleOpenStatusDialog(pkg)
                                  : void handleStatusChange(
                                      pkg.id,
                                      pkg.order_id,
                                      selectedStatus,
                                      "NOBODY",
                                    )
                              }
                              disabled={isBusy}
                              className="btn btn-secondary mt-2 w-full"
                            >
                              {needsWorker ? "Choose Worker" : "Apply Status"}
                            </button>
                          ) : null}
                        </>
                      );
                    })()}
                  </td>
                  <td className="w-[13rem] min-w-[13rem]">
                    <p>{pkg.last_delivery_state ?? "No message yet"}</p>
                    {pkg.last_notification_at ? (
                      <p className="mt-1 text-xs text-slate-500">
                        {formatAccraDateTime(pkg.last_notification_at)}
                      </p>
                    ) : null}
                    {canRetrySms(pkg.last_delivery_state) ? (
                      <button
                        type="button"
                        onClick={() => void handleRetrySms(pkg.id)}
                        disabled={isBusy}
                        className="btn btn-secondary mt-2"
                      >
                        {pendingSmsRetryPackageId === pkg.id ? "Retrying..." : "Retry SMS"}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {visiblePackages.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-slate-500">
                    No packages match the current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {statusDialog ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/48 px-4 py-6 backdrop-blur-sm">
          <div className="glass-card w-full max-w-[720px] overflow-hidden">
            <div className="border-b border-slate-200/70 px-5 py-4">
              <p className="label-kicker">Status Update</p>
              <h3 className="font-display mt-2 text-2xl font-semibold text-slate-950">
                {statusDialog.orderId}
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Confirm the next status and assign the worker outside the table layout.
              </p>
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
                  <select
                    value={statusDialog.nextStatus}
                    disabled={isBusy}
                    onChange={(event) => {
                      const nextStatus = event.target.value as PackageStatus;
                      const nextTask = getPayableTaskForStatus(
                        statusDialog.packageType,
                        nextStatus,
                      );

                      setStatusDrafts((prev) => ({
                        ...prev,
                        [statusDialog.packageId]: nextStatus,
                      }));
                      setStatusDialog((prev) =>
                        prev
                          ? {
                              ...prev,
                              nextStatus,
                              workerName: nextTask ? prev.workerName : "NOBODY",
                            }
                          : prev,
                      );
                    }}
                    className="input-control mt-3"
                  >
                    {statusOptionsFor(statusDialog.currentStatus).map((status) => (
                      <option key={status} value={status}>
                        {getStatusLabel(status)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {statusDialogTask ? (
                <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
                  <div className="metric-tile p-4">
                    <p className="label-kicker">Paid Task</p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">
                      {getTaskLabel(statusDialogTask.taskType)}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Owner side: {getOwnerSideLabel(statusDialogTask.ownerSide)}
                    </p>
                  </div>

                  <div className="metric-tile p-4">
                    <p className="label-kicker">Worker</p>
                    <select
                      value={statusDialog.workerName}
                      disabled={isBusy}
                      onChange={(event) => {
                        const workerName = event.target.value as LaundryWorker;
                        setWorkerDrafts((prev) => ({
                          ...prev,
                          [statusDialog.packageId]: workerName,
                        }));
                        setStatusDialog((prev) =>
                          prev ? { ...prev, workerName } : prev,
                        );
                      }}
                      className="input-control mt-3"
                    >
                      {LAUNDRY_WORKERS.map((worker) => (
                        <option key={worker} value={worker}>
                          {getWorkerLabel(worker)}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      Choose <span className="font-semibold">Nobody</span> if you handled this task yourself.
                    </p>
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
                  onClick={() => setStatusDialog(null)}
                  disabled={isBusy}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmStatusDialog()}
                  disabled={isBusy}
                  className="btn btn-primary"
                >
                  {busyAction === "updateStatus" ? "Saving..." : "Confirm Status Update"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {qrFullscreenOpen && lastCreated ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/72 px-4 py-6 backdrop-blur-sm">
          <div className="glass-card max-h-full w-full max-w-[860px] overflow-auto border border-slate-300 bg-white p-6">
            <div className="mb-4 flex items-start justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Tracking QR</p>
                <h3 className="text-xl font-semibold text-slate-900">{lastCreated.orderId}</h3>
                <p className="mt-1 text-xs text-slate-600">
                  Scan to open the private customer tracking page.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQrFullscreenOpen(false)}
                className="btn btn-secondary"
              >
                Close
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-[1fr_1.1fr] md:items-center">
              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <Image
                  src={lastCreated.qrCodeDataUrl}
                  alt="Fullscreen package tracking QR code"
                  width={540}
                  height={540}
                  unoptimized
                  className="mx-auto h-auto w-full max-w-[520px]"
                />
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <p className="text-xs uppercase tracking-wider text-slate-500">Tracking URL</p>
                <Link
                  href={lastCreated.trackingUrl}
                  target="_blank"
                  className="mt-2 block break-all text-sm text-blue-700 underline"
                >
                  {lastCreated.trackingUrl}
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}
