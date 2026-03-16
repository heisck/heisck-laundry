import Image from "next/image";
import Link from "next/link";

import { getPackageTypeLabel } from "@/lib/package-pricing";
import { getDb, withDbConnectionRetry } from "@/lib/db";
import { getStatusFlow, getStatusLabel } from "@/lib/status";
import { formatAccraDateTime } from "@/lib/time";
import { verifyTrackingToken } from "@/lib/tracking-token";
import type {
  PackageStatus,
  PackageType,
  PaymentSource,
  PaymentStatus,
} from "@/lib/types";

interface Params {
  params: Promise<{ token: string }>;
}

interface TrackPackageRow {
  id: string;
  order_id: string;
  tracking_token_id: string;
  customer_name: string;
  room_number: string;
  package_type: PackageType;
  clothes_count: number;
  total_weight_kg: number;
  total_price_ghs: number;
  status: PackageStatus;
  eta_at: string;
  expires_at: string;
  picked_up_at: string | null;
  payment_status: PaymentStatus;
  payment_source: PaymentSource;
}

function statusPill(status: PackageStatus): string {
  if (status === "PICKED_UP") {
    return "border-emerald-200 bg-emerald-100 text-emerald-800";
  }
  if (status === "READY_FOR_PICKUP") {
    return "border-sky-200 bg-sky-100 text-sky-800";
  }
  if (status === "DRYING") {
    return "border-cyan-200 bg-cyan-100 text-cyan-800";
  }
  if (status === "WASHING") {
    return "border-indigo-200 bg-indigo-100 text-indigo-800";
  }
  return "border-slate-200 bg-slate-100 text-slate-700";
}

function paymentPill(status: PaymentStatus): string {
  if (status === "PAID") {
    return "border-emerald-200 bg-emerald-100 text-emerald-800";
  }

  if (status === "PENDING") {
    return "border-amber-200 bg-amber-100 text-amber-800";
  }

  return "border-slate-200 bg-slate-100 text-slate-700";
}

function TrackingHeader({
  rightContent,
}: {
  rightContent?: React.ReactNode;
}) {
  return (
    <header className="admin-topbar mb-6 flex items-center gap-2 px-4 py-3 md:gap-3 md:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-cyan-200 bg-white shadow-sm sm:h-16 sm:w-16">
          <Image
            src="/web-app-manifest-192x192.png"
            alt="Heisck Laundry logo"
            width={64}
            height={64}
            className="h-full w-full object-cover"
            priority
          />
        </div>
      </div>

      {rightContent ? (
        <div className="ml-auto flex shrink-0 items-center justify-end gap-1.5 sm:gap-2 md:gap-3">
          {rightContent}
        </div>
      ) : null}
    </header>
  );
}

function ExpiredView() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1260px] flex-col px-5 py-8 md:px-8">
      <TrackingHeader />

      <section className="panel-hero w-full p-6 md:p-8">
        <p className="label-kicker">Tracking Session</p>
        <h1 className="font-display mt-3 text-3xl font-semibold tracking-tight text-amber-950 md:text-4xl">
          Session expired
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-700 md:text-lg">
          This private tracking link is no longer active. Please contact the laundry desk for help with the order.
        </p>
      </section>
    </main>
  );
}

function InfoCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <article className="metric-tile px-4 py-4">
      <p className="label-kicker">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-950">{value}</p>
    </article>
  );
}

function getPaymentLabel(status: PaymentStatus, source: PaymentSource): string {
  if (status === "PAID" && source === "MANUAL") {
    return "Paid (Manual)";
  }

  if (status === "PAID" && source === "PAYSTACK") {
    return "Paid (Paystack)";
  }

  if (status === "PENDING") {
    return "Pending Payment";
  }

  return "Not Paid";
}

function getCompactStatusLabel(status: PackageStatus): string {
  if (status === "READY_FOR_PICKUP") {
    return "Ready";
  }

  if (status === "PICKED_UP") {
    return "Picked Up";
  }

  if (status === "DRYING") {
    return "Drying";
  }

  if (status === "WASHING") {
    return "Washing";
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

export default async function TrackPackagePage({ params }: Params) {
  const { token } = await params;

  let tokenPayload: { packageId: string; tokenId: string } | null = null;
  try {
    tokenPayload = await verifyTrackingToken(token);
  } catch {
    return <ExpiredView />;
  }

  const rows = await withDbConnectionRetry(async () => {
    const sql = getDb();
    return sql<TrackPackageRow[]>`
      select
        id,
        order_id,
        tracking_token_id,
        customer_name,
        room_number,
        package_type,
        clothes_count,
        total_weight_kg,
        total_price_ghs,
        status,
        eta_at,
        expires_at,
        picked_up_at,
        payment_status,
        payment_source
      from packages
      where id = ${tokenPayload.packageId}
        and tracking_token_id = ${tokenPayload.tokenId}
      limit 1
    `;
  });

  if (rows.length === 0) {
    return <ExpiredView />;
  }

  const record = rows[0];
  const isExpired = new Date(record.expires_at).getTime() <= Date.now();
  if (isExpired) {
    return <ExpiredView />;
  }

  const statusSteps = getStatusFlow(record.package_type);
  const currentIndex = statusSteps.indexOf(record.status);

  return (
    <main className="mx-auto w-full max-w-[1260px] px-5 py-8 md:px-8">
      <TrackingHeader
        rightContent={
          <>
            <span
              className={`status-chip border px-2.5 py-2 text-[0.72rem] sm:text-[0.76rem] ${statusPill(record.status)}`}
            >
              <span className="sm:hidden">{getCompactStatusLabel(record.status)}</span>
              <span className="hidden sm:inline">{getStatusLabel(record.status)}</span>
            </span>
            <span
              className={`status-chip border px-2.5 py-2 text-[0.72rem] sm:text-[0.76rem] ${paymentPill(record.payment_status)}`}
            >
              <span className="sm:hidden">{getCompactPaymentLabel(record.payment_status)}</span>
              <span className="hidden sm:inline">
                {getPaymentLabel(record.payment_status, record.payment_source)}
              </span>
            </span>
            {record.payment_status !== "PAID" ? (
              <Link
                href={`/api/track/${token}/pay`}
                className="btn btn-primary min-h-[2.45rem] px-3 text-[0.72rem] sm:min-h-[2.9rem] sm:px-4 sm:text-[0.82rem]"
              >
                <span className="sm:hidden">Pay Now</span>
                <span className="hidden sm:inline">Pay now with Paystack</span>
              </Link>
            ) : null}
          </>
        }
      />

      <section className="panel-hero mb-6 overflow-hidden px-6 py-6 md:px-8 md:py-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="label-kicker">Customer Tracking</p>
            <div className="mt-4">
              <h1 className="font-display text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
                Order {record.order_id}
              </h1>
              <p className="mt-2 text-base leading-7 text-slate-600 md:text-lg">
                Track the progress of your laundry package in real time.
              </p>
              <p className="mt-4 text-sm font-medium leading-6 text-slate-600">
                Estimated completion: {formatAccraDateTime(record.eta_at)}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-6 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="glass-card p-5 md:p-6">
          <p className="label-kicker">Package Details</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <InfoCard label="Customer Name" value={record.customer_name} />
            <InfoCard label="Room Number" value={record.room_number} />
            <InfoCard label="Package Type" value={getPackageTypeLabel(record.package_type)} />
            <InfoCard label="Clothes Count" value={String(record.clothes_count)} />
            <InfoCard label="Weight" value={`${Number(record.total_weight_kg).toFixed(2)} kg`} />
            <InfoCard label="Total Price" value={`GHS ${Number(record.total_price_ghs).toFixed(2)}`} />
          </div>
        </article>

        <article className="glass-card p-5 md:p-6">
          <p className="label-kicker">Tracking Window</p>
          <div className="mt-5 grid gap-4">
            <InfoCard label="Estimated Fulfillment" value={formatAccraDateTime(record.eta_at)} />
            <InfoCard label="Tracking Expires" value={formatAccraDateTime(record.expires_at)} />
            <InfoCard
              label="Pickup Status"
              value={
                record.picked_up_at
                  ? `Collected at ${formatAccraDateTime(record.picked_up_at)}`
                  : "Not yet collected"
              }
            />
          </div>
        </article>
      </section>

      <section className="glass-card p-5 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="label-kicker">Laundry Progress</p>
            <h2 className="font-display mt-2 text-2xl font-semibold text-slate-950">
              Current package stage
            </h2>
          </div>
          <p className="text-sm leading-6 text-slate-600">
            Only the latest completed step is highlighted.
          </p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {statusSteps.map((status, index) => {
            const reached = index <= currentIndex;
            const isCurrent = index === currentIndex;

            return (
              <article
                key={status}
                className={`rounded-[1.35rem] border px-4 py-4 ${
                  isCurrent
                    ? "border-teal-200 bg-teal-50"
                    : reached
                      ? "border-sky-100 bg-sky-50/70"
                      : "border-slate-200 bg-white/82"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span
                    className={`font-display inline-flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold ${
                      reached
                        ? "bg-slate-950 text-white"
                        : "border border-slate-300 bg-white text-slate-500"
                    }`}
                  >
                    {index + 1}
                  </span>
                  {isCurrent ? (
                    <span className="pill-soft border-teal-200 bg-white text-teal-700">
                      Current
                    </span>
                  ) : null}
                </div>
                <p
                  className={`mt-5 text-base leading-6 ${
                    reached ? "font-semibold text-slate-950" : "text-slate-500"
                  }`}
                >
                  {getStatusLabel(status)}
                </p>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
