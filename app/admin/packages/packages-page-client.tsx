"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

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
type PendingStatusUpdate = {
  packageId: string;
  nextStatus: PackageStatus;
} | null;
type StatusDrafts = Record<string, PackageStatus>;

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

function paymentPill(status: PaymentStatus): string {
  if (status === "PAID") {
    return "bg-emerald-100 text-emerald-700";
  }
  if (status === "PENDING") {
    return "bg-amber-100 text-amber-700";
  }
  return "bg-slate-100 text-slate-700";
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
  const [paymentFilter, setPaymentFilter] =
    useState<PaymentStatusFilter>("ALL");
  const [sortDescending, setSortDescending] = useState(false);
  const [createForm, setCreateForm] = useState<CreatePackageForm>({
    ...initialPackageForm,
    etaAt: toLocalDatetimeValue(getSuggestedEtaDate("NORMAL_WASH_DRY")),
  });
  const [lastCreated, setLastCreated] = useState<LastCreatedInfo | null>(null);
  const [loading, setLoading] = useState(!initialLoadReady);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [pendingStatusUpdate, setPendingStatusUpdate] =
    useState<PendingStatusUpdate>(null);
  const [pendingSmsRetryPackageId, setPendingSmsRetryPackageId] = useState<
    string | null
  >(null);
  const [statusDrafts, setStatusDrafts] = useState<StatusDrafts>({});
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
    const filtered = allPackages.filter((record) => {
      const matchesStatus = statusFilter === "ALL" || record.status === statusFilter;
      const matchesPayment =
        paymentFilter === "ALL" || record.payment_status === paymentFilter;
      return matchesStatus && matchesPayment && matchesSearch(record, search.trim());
    });

    return filtered.sort((a, b) => {
      const statusDelta = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (statusDelta !== 0) {
        return sortDescending ? -statusDelta : statusDelta;
      }
      const createdDelta = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sortDescending ? -createdDelta : createdDelta;
    });
  }, [allPackages, paymentFilter, search, sortDescending, statusFilter]);

  const displayedMetrics = useMemo(() => {
    const packageCount = visiblePackages.length;
    const readyCount = visiblePackages.filter(
      (item) => item.status === "READY_FOR_PICKUP",
    ).length;

    return {
      packageCount,
      readyCount,
    };
  }, [visiblePackages]);

  const pricePreview = useMemo(() => {
    const weightKg = Number(createForm.totalWeightKg);
    return calculatePackagePricing(weightKg, createForm.packageType);
  }, [createForm.packageType, createForm.totalWeightKg]);

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

  function getSelectedStatus(pkg: PackageRecord): PackageStatus {
    if (pendingStatusUpdate?.packageId === pkg.id) {
      return pendingStatusUpdate.nextStatus;
    }

    return statusDrafts[pkg.id] ?? pkg.status;
  }

  function handleStatusSelect(pkg: PackageRecord, nextStatus: PackageStatus) {
    setStatusDrafts((prev) => ({
      ...prev,
      [pkg.id]: nextStatus,
    }));

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

  function renderStatusUpdateControls(pkg: PackageRecord) {
    const selectedStatus = getSelectedStatus(pkg);

    return (
      <>
        <select
          value={selectedStatus}
          disabled={isBusy || pkg.status === "PICKED_UP"}
          onChange={(event) =>
            handleStatusSelect(pkg, event.target.value as PackageStatus)
          }
          className="input-control min-w-0 py-2 text-[0.74rem]"
        >
          {getStatusOptionsForPackage(pkg.package_type, pkg.status).map((status) => (
            <option key={status} value={status}>
              {getCompactStatusLabel(status)}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          Status saves right away. Worker details only show when that step needs payout info.
        </p>
      </>
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

  function renderPaymentControls(pkg: PackageRecord) {
    return (
      <div className="space-y-2">
        <span
          className={cn(
            "status-chip",
            paymentPill(pkg.payment_status),
          )}
        >
          {getCompactPaymentLabel(pkg.payment_status)}
        </span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handlePaymentStatusChange(pkg.id, pkg.order_id, "PAID")}
            disabled={isBusy || pkg.payment_status === "PAID"}
            className="btn btn-secondary px-3 py-2 text-[0.72rem]"
          >
            Paid
          </button>
          <button
            type="button"
            onClick={() => void handlePaymentStatusChange(pkg.id, pkg.order_id, "UNPAID")}
            disabled={isBusy || pkg.payment_status === "UNPAID"}
            className="btn btn-secondary px-3 py-2 text-[0.72rem]"
          >
            Not Paid
          </button>
        </div>
      </div>
    );
  }

  function renderSmsInfo(pkg: PackageRecord) {
    return (
      <>
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
            className="btn btn-secondary mt-2 w-full sm:w-auto"
          >
            {pendingSmsRetryPackageId === pkg.id ? "Retrying..." : "Retry SMS"}
          </button>
        ) : null}
      </>
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
      setStatusDrafts((prev) => ({
        ...prev,
        [packageId]: payload.package.status,
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
      const currentStatus =
        allPackages.find((item) => item.id === packageId)?.status ?? null;
      if (currentStatus) {
        setStatusDrafts((prev) => ({
          ...prev,
          [packageId]: currentStatus,
        }));
      }
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
          <p className="label-kicker">Active Week</p>
          <p className="mt-3 text-lg font-semibold text-slate-950">
            {currentWeek?.label ?? "No active week"}
          </p>
        </article>
        <article className="metric-tile px-5 py-5">
          <p className="label-kicker">Time Left</p>
          <p className="mt-3 text-lg font-semibold text-slate-950">{currentWeekRemaining}</p>
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
                  Intake Worker: {getWorkerLabel(worker)}
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
                  Start a processing week on /admin/private before creating packages.
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

      <section className="glass-card overflow-hidden">
        <div className="border-b border-slate-200/70 px-5 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="label-kicker">Package Tracking Table</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Filter locally for faster lookup and cleaner status management.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
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
                {(Object.keys(STATUS_ORDER) as PackageStatus[]).map((status) => (
                  <option key={status} value={status}>
                    {getCompactStatusLabel(status)}
                  </option>
                ))}
              </select>
              <select
                value={paymentFilter}
                onChange={(event) =>
                  setPaymentFilter(event.target.value as PaymentStatusFilter)
                }
                className="input-control min-w-[180px]"
              >
                <option value="ALL">All payments</option>
                {PAYMENT_STATUS_OPTIONS.filter((status) => status !== "ALL").map((status) => (
                  <option key={status} value={status}>
                    {getCompactPaymentLabel(status)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setSortDescending((prev) => !prev)}
                className="btn btn-secondary"
              >
                Sort {sortDescending ? "↓" : "↑"}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4 p-4 md:hidden">
          {visiblePackages.map((pkg) => (
            <article key={pkg.id} className="metric-tile p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-display text-xl font-semibold text-slate-950">
                    {pkg.order_id}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {pkg.customer_name} • Room {pkg.room_number}
                  </p>
                </div>
                <span className={cn("status-chip", statusPill(pkg.status))}>
                  {getCompactStatusLabel(pkg.status)}
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="surface-subtle px-4 py-3">
                  <p className="label-kicker">Package</p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">
                    {getCompactPackageTypeLabel(pkg.package_type)}
                  </p>
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
                  <p className="label-kicker">Payment</p>
                  <div className="mt-2">{renderPaymentControls(pkg)}</div>
                </div>
                <div className="surface-subtle px-4 py-3">
                  <p className="label-kicker">SMS</p>
                  <div className="mt-2 text-sm text-slate-700">{renderSmsInfo(pkg)}</div>
                </div>
              </div>

              <div className="mt-4 rounded-[1.1rem] border border-slate-200 bg-white/82 p-4">
                <p className="label-kicker">Update Status</p>
                <div className="mt-3">{renderStatusUpdateControls(pkg)}</div>
              </div>
            </article>
          ))}
          {visiblePackages.length === 0 ? (
            <p className="metric-tile p-5 text-center text-sm leading-6 text-slate-500">
              No packages match the current live filters.
            </p>
          ) : null}
        </div>

        <div className="table-wrap hidden md:block">
          <table className="data-table min-w-[1020px]">
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
                <th className="w-[11rem] min-w-[11rem] font-semibold">Payment</th>
                <th className="font-semibold">Status</th>
                <th className="w-[10rem] min-w-[10rem] font-semibold">Update</th>
                <th className="w-[13rem] min-w-[13rem] font-semibold">SMS</th>
              </tr>
            </thead>
            <tbody>
              {visiblePackages.map((pkg) => (
                <tr key={pkg.id} className="text-slate-700 transition">
                  <td className="font-semibold text-slate-900">{pkg.order_id}</td>
                  <td>{pkg.customer_name}</td>
                  <td className="whitespace-nowrap">{getCompactPackageTypeLabel(pkg.package_type)}</td>
                  <td>{pkg.primary_phone}</td>
                  <td>{pkg.clothes_count}</td>
                  <td>{pkg.room_number}</td>
                  <td>{pkg.total_weight_kg.toFixed(2)} kg</td>
                  <td className="whitespace-nowrap">{pkg.total_price_ghs.toFixed(2)}</td>
                  <td className="w-[11rem] min-w-[11rem]">
                    {renderPaymentControls(pkg)}
                  </td>
                  <td>
                    <span
                      className={cn(
                        "status-chip",
                        statusPill(pkg.status),
                      )}
                    >
                      {getCompactStatusLabel(pkg.status)}
                    </span>
                  </td>
                  <td className="w-[10rem] min-w-[10rem]">
                    {renderStatusUpdateControls(pkg)}
                  </td>
                  <td className="w-[13rem] min-w-[13rem]">
                    {renderSmsInfo(pkg)}
                  </td>
                </tr>
              ))}
              {visiblePackages.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-10 text-center text-slate-500">
                    No packages match the current live filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {statusDialog ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/48 px-4 py-6 backdrop-blur-sm">
          <div className="glass-card max-h-[calc(100vh-2rem)] w-full max-w-[720px] overflow-auto">
            <div className="border-b border-slate-200/70 px-5 py-4">
              <p className="label-kicker">Status Update</p>
              <h3 className="font-display mt-2 text-2xl font-semibold text-slate-950">
                {statusDialog.orderId}
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                This step saves automatically as soon as the needed worker details are filled.
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
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Your side covers this ready-for-pickup work.
                    </p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="metric-tile p-4">
                      <p className="label-kicker">Remove Worker</p>
                      <select
                        value={statusDialog.removeWorkerName}
                        disabled={isBusy}
                        onChange={(event) => {
                          const nextDialog = {
                            ...statusDialog,
                            removeWorkerName: event.target.value as LaundryWorker,
                          };
                          setStatusDialog(nextDialog);
                          submitStatusDialog(nextDialog);
                        }}
                        className="input-control mt-3"
                      >
                        <option value="">Choose worker</option>
                        {LAUNDRY_WORKERS.map((worker) => (
                          <option key={worker} value={worker}>
                            {getWorkerLabel(worker)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="metric-tile p-4">
                      <p className="label-kicker">Folded?</p>
                      <select
                        value={
                          statusDialog.foldCompleted === null
                            ? ""
                            : statusDialog.foldCompleted
                              ? "YES"
                              : "NO"
                        }
                        disabled={isBusy}
                        onChange={(event) => {
                          const foldCompleted = event.target.value === "YES";
                          const nextDialog = {
                            ...statusDialog,
                            foldCompleted:
                              event.target.value === ""
                                ? null
                                : foldCompleted,
                          };
                          setStatusDialog(nextDialog);
                          submitStatusDialog(nextDialog);
                        }}
                        className="input-control mt-3"
                      >
                        <option value="">Choose fold step</option>
                        <option value="NO">No</option>
                        <option value="YES">Yes</option>
                      </select>
                    </div>
                  </div>
                  {statusDialog.foldCompleted ? (
                    <div className="metric-tile p-4">
                      <p className="label-kicker">Fold Worker</p>
                      <select
                        value={statusDialog.foldWorkerName}
                        disabled={isBusy}
                        onChange={(event) => {
                          const nextDialog = {
                            ...statusDialog,
                            foldWorkerName: event.target.value as LaundryWorker,
                          };
                          setStatusDialog(nextDialog);
                          submitStatusDialog(nextDialog);
                        }}
                        className="input-control mt-3"
                      >
                        <option value="">Choose worker</option>
                        {LAUNDRY_WORKERS.map((worker) => (
                          <option key={worker} value={worker}>
                            {getWorkerLabel(worker)}
                          </option>
                        ))}
                      </select>
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
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Owner side: {getOwnerSideLabel("PARTNER_SIDE")}
                    </p>
                  </div>

                  <div className="metric-tile p-4">
                    <p className="label-kicker">Worker</p>
                    <select
                      value={statusDialog.removeWorkerName}
                      disabled={isBusy}
                      onChange={(event) => {
                        const nextDialog = {
                          ...statusDialog,
                          removeWorkerName: event.target.value as LaundryWorker,
                        };
                        setStatusDialog(nextDialog);
                        submitStatusDialog(nextDialog);
                      }}
                      className="input-control mt-3"
                      >
                        <option value="">Choose worker</option>
                        {LAUNDRY_WORKERS.map((worker) => (
                          <option key={worker} value={worker}>
                            {getWorkerLabel(worker)}
                          </option>
                        ))}
                    </select>
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
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Owner side: {
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
                    <select
                      value={statusDialog.workerName}
                      disabled={isBusy}
                      onChange={(event) => {
                        const nextDialog = {
                          ...statusDialog,
                          workerName: event.target.value as LaundryWorker,
                        };
                        setStatusDialog(nextDialog);
                        submitStatusDialog(nextDialog);
                      }}
                      className="input-control mt-3"
                    >
                      <option value="">Choose worker</option>
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
                  onClick={() => {
                    setStatusDrafts((prev) => ({
                      ...prev,
                      [statusDialog.packageId]: statusDialog.currentStatus,
                    }));
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
    </AdminShell>
  );
}
