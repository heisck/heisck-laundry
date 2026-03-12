import { getPackageTypeLabel } from "@/lib/package-pricing";
import { getDb } from "@/lib/db";
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
    return "bg-emerald-100 text-emerald-700 border-emerald-200";
  }
  if (status === "READY_FOR_PICKUP") {
    return "bg-blue-100 text-blue-700 border-blue-200";
  }
  if (status === "DRYING") {
    return "bg-cyan-100 text-cyan-700 border-cyan-200";
  }
  if (status === "WASHING") {
    return "bg-indigo-100 text-indigo-700 border-indigo-200";
  }
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function ExpiredView() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-[1080px] px-4 py-8 md:px-8">
      <section className="glass-card overflow-hidden border border-amber-200">
        <div className="border-b border-amber-200 bg-amber-50 px-5 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-amber-700">
            Tracking Session
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-amber-900">
            Session Expired
          </h1>
        </div>
        <div className="space-y-3 px-5 py-5">
          <p className="text-sm text-amber-900">
            This tracking page is no longer active. Please contact laundry staff for
            assistance with this order.
          </p>
        </div>
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
    <article className="rounded-xl border border-slate-200 bg-white/90 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.15em] text-slate-500">{label}</p>
      <p className="mt-1 text-base font-semibold text-slate-900">{value}</p>
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

  const sql = getDb();
  const rows = await sql<TrackPackageRow[]>`
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
      picked_up_at
    from packages
    where id = ${tokenPayload.packageId}
      and tracking_token_id = ${tokenPayload.tokenId}
    limit 1
  `;

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
    <main className="mx-auto min-h-screen w-full max-w-[1080px] px-4 py-8 md:px-8">
      <header className="glass-card mb-4 overflow-hidden border border-slate-200">
        <div className="flex flex-col gap-4 border-b border-slate-200 bg-white/90 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-sm font-bold text-white shadow-md shadow-blue-500/30">
              HL
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                Heisck Laundry
              </p>
              <h1 className="text-2xl font-semibold text-slate-900">Customer Tracking</h1>
            </div>
          </div>
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${statusPill(
              record.status,
            )}`}
          >
            {getStatusLabel(record.status)}
          </span>
        </div>
        <div className="grid gap-3 px-5 py-4 md:grid-cols-2">
          <InfoCard label="Order ID" value={record.order_id} />
          <InfoCard label="Estimated Fulfillment" value={formatAccraDateTime(record.eta_at)} />
        </div>
      </header>

      <section className="glass-card mb-4 overflow-hidden border border-slate-200">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">
            Package Details
          </h2>
        </div>
        <div className="grid gap-3 p-5 md:grid-cols-2">
          <InfoCard label="Customer Name" value={record.customer_name} />
          <InfoCard label="Room Number" value={record.room_number} />
          <InfoCard label="Package Type" value={getPackageTypeLabel(record.package_type)} />
          <InfoCard label="Clothes Count" value={String(record.clothes_count)} />
          <InfoCard label="Weight" value={`${Number(record.total_weight_kg).toFixed(2)} kg`} />
          <InfoCard label="Total Price" value={`GHS ${Number(record.total_price_ghs).toFixed(2)}`} />
          <InfoCard label="Tracking Expires" value={formatAccraDateTime(record.expires_at)} />
        </div>
      </section>

      <section className="glass-card overflow-hidden border border-slate-200">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">
            Laundry Progress
          </h2>
        </div>
        <div className="divide-y divide-slate-200">
          {STATUS_STEPS.map((status, index) => {
            const reached = index <= currentIndex;
            const isCurrent = index === currentIndex;
            return (
              <article
                key={status}
                className={`flex items-center justify-between px-5 py-3 ${
                  reached ? "bg-blue-50/45" : "bg-white/70"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                      reached
                        ? "bg-blue-600 text-white"
                        : "border border-slate-300 bg-white text-slate-500"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <p className={`text-sm ${reached ? "font-semibold text-slate-900" : "text-slate-500"}`}>
                    {getStatusLabel(status)}
                  </p>
                </div>
                {isCurrent ? (
                  <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">
                    Current
                  </span>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
