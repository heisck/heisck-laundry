import Link from "next/link";

import { getPackageTypeLabel } from "@/lib/package-pricing";
import { getDb, withDbConnectionRetry } from "@/lib/db";
import { getStatusLabel } from "@/lib/status";
import { formatAccraDateTime } from "@/lib/time";
import { verifyTrackingToken } from "@/lib/tracking-token";
import type { PackageStatus, PackageType } from "@/lib/types";

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
  payment_status: "UNPAID" | "PENDING" | "PAID";
}


const STATUS_STEPS: PackageStatus[] = [
  "RECEIVED",
  "WASHING",
  "DRYING",
  "READY_FOR_PICKUP",
  "PICKED_UP",
];

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

function ExpiredView() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1120px] items-center px-5 py-8 md:px-8">
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
        payment_status
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

  const currentIndex = STATUS_STEPS.indexOf(record.status);

  return (
    <main className="mx-auto w-full max-w-[1260px] px-5 py-8 md:px-8">
      <section className="panel-hero mb-6 overflow-hidden px-6 py-6 md:px-8 md:py-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="label-kicker">Customer Tracking</p>
            <div className="mt-4 flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[1.45rem] bg-gradient-to-br from-teal-600 to-sky-700 text-base font-extrabold tracking-[0.24em] text-white">
                HL
              </div>
              <div>
                <h1 className="font-display text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
                  Order {record.order_id}
                </h1>
                <p className="mt-2 text-base leading-7 text-slate-600 md:text-lg">
                  Track the progress of your laundry package in real time.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <span className={`status-chip border ${statusPill(record.status)}`}>
              {getStatusLabel(record.status)}
            </span>
            <span className="pill-soft">
              Estimated completion: {formatAccraDateTime(record.eta_at)}
            </span>
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
            <InfoCard label="Payment" value={record.payment_status} />
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
        {record.payment_status !== "PAID" ? (
          <div className="mb-4">
            <Link href={`/api/track/${token}/pay`} className="btn btn-primary">Pay now with Paystack</Link>
          </div>
        ) : null}
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
          {STATUS_STEPS.map((status, index) => {
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
