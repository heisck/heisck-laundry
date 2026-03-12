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
import { getStatusLabel } from "@/lib/status";
import { formatAccraDateTime } from "@/lib/time";
import {
  PACKAGE_STATUSES,
  PACKAGE_TYPES,
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

interface CurrentWeekPayload {
  week: ProcessingWeek | null;
  remainingSeconds: number;
}

interface PackagesPayload {
  packages: PackageRecord[];
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
  const [packages, setPackages] = useState<PackageRecord[]>(initialPackages);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PackageStatus | "ALL">("ALL");
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

  const displayedMetrics = useMemo(() => {
    const packageCount = packages.length;
    const totalKg = packages.reduce((sum, item) => sum + item.total_weight_kg, 0);
    const totalRevenue = packages.reduce(
      (sum, item) => sum + item.total_price_ghs,
      0,
    );
    const readyCount = packages.filter(
      (item) => item.status === "READY_FOR_PICKUP",
    ).length;

    return {
      packageCount,
      totalKg,
      totalRevenue,
      readyCount,
    };
  }, [packages]);

  const pricePreview = useMemo(() => {
    const weightKg = Number(createForm.totalWeightKg);
    return calculatePackagePricing(weightKg, createForm.packageType);
  }, [createForm.packageType, createForm.totalWeightKg]);

  async function loadPackages(query?: {
    search?: string;
    status?: PackageStatus | "ALL";
  }) {
    const q = query?.search ?? search.trim();
    const status = query?.status ?? statusFilter;
    const params = new URLSearchParams();
    if (q) {
      params.set("q", q);
    }
    if (status !== "ALL") {
      params.set("status", status);
    }

    const queryString = params.toString();
    const response = await fetchWithTimeout(
      `/api/admin/packages${queryString ? `?${queryString}` : ""}`,
      { cache: "no-store" },
    );
    const payload = await parseApiResponse<PackagesPayload>(response);
    setPackages(payload.packages);
  }

  async function loadPackagesAndWeek(query?: {
    search?: string;
    status?: PackageStatus | "ALL";
  }) {
    const currentWeekResponse = await fetchWithTimeout("/api/admin/weeks/current", {
      cache: "no-store",
    });
    const currentWeekPayload =
      await parseApiResponse<CurrentWeekPayload>(currentWeekResponse);
    setCurrentWeek(currentWeekPayload.week);
    await loadPackages(query);
  }

  async function refreshAll(showLoader = false) {
    if (showLoader) {
      setLoading(true);
    }
    setBusyAction("refresh");
    try {
      await loadPackagesAndWeek();
    } catch (error) {
      pushToast(
        "error",
        "Unable to refresh packages",
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

  async function handleCreatePackage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyAction("createPackage");

    try {
      const response = await fetchWithTimeout("/api/admin/packages", {
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
      });

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
      setPackages((prev) => {
        const includeByStatus =
          statusFilter === "ALL" || payload.package.status === statusFilter;
        const includeBySearch = matchesSearch(payload.package, search.trim());
        if (!includeByStatus || !includeBySearch) {
          return prev;
        }
        return [payload.package, ...prev];
      });
      pushToast("success", "Package created", payload.package.order_id);

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
      setBusyAction(null);
    }
  }

  async function handleStatusChange(packageId: string, nextStatus: PackageStatus) {
    setBusyAction("updateStatus");
    setPendingStatusUpdate({ packageId, nextStatus });
    try {
      const response = await fetchWithTimeout(`/api/admin/packages/${packageId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const payload = await parseApiResponse<{
        package: PackageRecord;
        skipped: boolean;
        notifications: NotificationAttempt[];
      }>(response);

      setPackages((prev) => {
        const updated = prev.map((row) =>
          row.id === packageId ? payload.package : row,
        );
        return statusFilter === "ALL"
          ? updated
          : updated.filter((item) => item.status === statusFilter);
      });

      pushToast(
        "success",
        payload.skipped ? "Status unchanged" : "Status updated",
        payload.package.order_id,
      );

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
      setPendingStatusUpdate(null);
      setBusyAction(null);
    }
  }

  async function handleFilterSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyAction("search");
    try {
      await loadPackages({
        search: search.trim(),
        status: statusFilter,
      });
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
    try {
      const response = await fetchWithTimeout(
        `/api/admin/packages/${packageId}/notifications`,
        {
          method: "POST",
        },
      );
      const payload = await parseApiResponse<{
        package: PackageRecord;
        notifications: NotificationAttempt[];
      }>(response);

      setPackages((prev) =>
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

      <section className="glass-card mb-4 overflow-hidden border border-slate-200">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">
            Current Processing Week
          </h3>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white/90 px-3 py-3">
            <p className="text-xs uppercase tracking-wider text-slate-500">Label</p>
            <p className="mt-1 font-semibold text-slate-900">
              {currentWeek?.label ?? "No active week"}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white/90 px-3 py-3">
            <p className="text-xs uppercase tracking-wider text-slate-500">Week End</p>
            <p className="mt-1 font-semibold text-slate-900">
              {currentWeek ? formatAccraDateTime(currentWeek.end_at) : "-"}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white/90 px-3 py-3">
            <p className="text-xs uppercase tracking-wider text-slate-500">Time Left</p>
            <p className="mt-1 font-semibold text-slate-900">{currentWeekRemaining}</p>
          </div>
        </div>
      </section>

      <section className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="glass-card border border-slate-200 p-4">
          <p className="text-xs uppercase tracking-wider text-slate-500">Packages</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {displayedMetrics.packageCount}
          </p>
        </article>
        <article className="glass-card border border-slate-200 p-4">
          <p className="text-xs uppercase tracking-wider text-slate-500">Total Weight</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {displayedMetrics.totalKg.toFixed(2)} kg
          </p>
        </article>
        <article className="glass-card border border-slate-200 p-4">
          <p className="text-xs uppercase tracking-wider text-slate-500">Total Revenue</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            GHS {displayedMetrics.totalRevenue.toFixed(2)}
          </p>
        </article>
        <article className="glass-card border border-slate-200 p-4">
          <p className="text-xs uppercase tracking-wider text-slate-500">Ready for Pickup</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {displayedMetrics.readyCount}
          </p>
        </article>
      </section>

      <section className="mb-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <article className="glass-card overflow-hidden border border-slate-200">
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">
              Create Package
            </h3>
          </div>
          <form className="grid gap-3 p-4 sm:grid-cols-2" onSubmit={handleCreatePackage}>
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

            <div className="sm:col-span-2 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 md:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                <p className="text-xs uppercase tracking-wider text-slate-500">
                  Rounded Weight
                </p>
                <p className="mt-1 font-semibold text-slate-900">
                  {pricePreview.roundedWeightKg.toFixed(1)} kg
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                <p className="text-xs uppercase tracking-wider text-slate-500">
                  Package Rate
                </p>
                <p className="mt-1 font-semibold text-slate-900">
                  GHS {pricePreview.ratePerKg.toFixed(2)}/kg
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                <p className="text-xs uppercase tracking-wider text-slate-500">
                  Fixed Charge
                </p>
                <p className="mt-1 font-semibold text-slate-900">
                  GHS {pricePreview.fixedChargeGhs.toFixed(2)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                <p className="text-xs uppercase tracking-wider text-slate-500">Total Price</p>
                <p className="mt-1 font-semibold text-slate-900">
                  GHS {pricePreview.totalPriceGhs.toFixed(2)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                <p className="text-xs uppercase tracking-wider text-slate-500">Turnaround</p>
                <p className="mt-1 font-semibold text-slate-900">
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

        <article className="glass-card overflow-hidden border border-slate-200">
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">
              Latest Created Package
            </h3>
          </div>
          <div className="p-4">
            {lastCreated ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-200 bg-white/80 p-3">
                  <p className="text-xs uppercase tracking-wider text-slate-500">Order ID</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{lastCreated.orderId}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white/80 p-3">
                  <p className="text-xs uppercase tracking-wider text-slate-500">Tracking Link</p>
                  <Link
                    href={lastCreated.trackingUrl}
                    target="_blank"
                    className="mt-1 block break-all text-sm text-blue-700 underline"
                  >
                    {lastCreated.trackingUrl}
                  </Link>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white/80 p-3">
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
              <p className="rounded-xl border border-slate-200 bg-white/80 p-4 text-sm text-slate-500">
                No package has been created in this session yet.
              </p>
            )}
          </div>
        </article>
      </section>

      <section className="glass-card overflow-hidden border border-slate-200">
        <div className="border-b border-slate-200 px-4 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">
              Package Tracking Table
            </h3>
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

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="px-3 py-3 font-semibold">Order</th>
                <th className="px-3 py-3 font-semibold">Customer</th>
                <th className="px-3 py-3 font-semibold">Package</th>
                <th className="px-3 py-3 font-semibold">Room</th>
                <th className="px-3 py-3 font-semibold">Weight</th>
                <th className="px-3 py-3 font-semibold">Price</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 font-semibold">Update</th>
                <th className="px-3 py-3 font-semibold">SMS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80">
              {packages.map((pkg) => (
                <tr key={pkg.id} className="text-slate-700 transition hover:bg-slate-50/60">
                  <td className="px-3 py-3 font-semibold text-slate-900">{pkg.order_id}</td>
                  <td className="px-3 py-3">{pkg.customer_name}</td>
                  <td className="px-3 py-3">{getPackageTypeLabel(pkg.package_type)}</td>
                  <td className="px-3 py-3">{pkg.room_number}</td>
                  <td className="px-3 py-3">{pkg.total_weight_kg.toFixed(2)} kg</td>
                  <td className="px-3 py-3">GHS {pkg.total_price_ghs.toFixed(2)}</td>
                  <td className="px-3 py-3">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
                        statusPill(pkg.status),
                      )}
                    >
                      {getStatusLabel(pkg.status)}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {pendingStatusUpdate?.packageId === pkg.id ? (
                      <p className="mb-1 text-xs font-medium text-blue-700">
                        Updating to {getStatusLabel(pendingStatusUpdate.nextStatus)}...
                      </p>
                    ) : null}
                    <select
                      value={
                        pendingStatusUpdate?.packageId === pkg.id
                          ? pendingStatusUpdate.nextStatus
                          : pkg.status
                      }
                      disabled={isBusy || pkg.status === "PICKED_UP"}
                      onChange={(event) =>
                        void handleStatusChange(
                          pkg.id,
                          event.target.value as PackageStatus,
                        )
                      }
                      className="input-control py-2 text-xs"
                    >
                      {statusOptionsFor(pkg.status).map((status) => (
                        <option key={status} value={status}>
                          {getStatusLabel(status)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3">
                    {pendingStatusUpdate?.packageId === pkg.id ? (
                      <p className="text-xs font-medium text-blue-700">Sending update...</p>
                    ) : null}
                    <p>{pkg.last_delivery_state ?? "No message yet"}</p>
                    {pkg.last_notification_at ? (
                      <p className="mt-1 text-xs text-slate-500">
                        {formatAccraDateTime(pkg.last_notification_at)}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void handleRetrySms(pkg.id)}
                      disabled={isBusy}
                      className="btn btn-secondary mt-2"
                    >
                      {pendingSmsRetryPackageId === pkg.id ? "Retrying..." : "Retry SMS"}
                    </button>
                  </td>
                </tr>
              ))}
              {packages.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                    No packages match the current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

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
