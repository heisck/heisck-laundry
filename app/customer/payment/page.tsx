import Image from "next/image";

import { getPackageTypeLabel } from "@/lib/package-pricing";
import { getCustomerPaymentStatusPageData } from "@/lib/services/payments";
import { formatAccraDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0]?.trim() || null;
  }

  return value?.trim() || null;
}

function toneClasses(tone: "success" | "warning" | "danger" | "neutral"): string {
  if (tone === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (tone === "warning") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  if (tone === "danger") {
    return "border-rose-200 bg-rose-50 text-rose-800";
  }

  return "border-slate-200 bg-slate-100 text-slate-700";
}

function formatMoney(kobo: number | null): string {
  if (kobo === null) {
    return "Not available";
  }

  return `GHS ${(kobo / 100).toFixed(2)}`;
}

function formatExactAmountState(value: boolean | null): string {
  if (value === true) {
    return "Yes";
  }

  if (value === false) {
    return "No";
  }

  return "Pending";
}

function formatDate(value: string | null): string {
  return value ? formatAccraDateTime(value) : "Not available";
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

export default async function CustomerPaymentPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const token = firstValue(resolvedSearchParams.token);
  const reference = firstValue(resolvedSearchParams.reference);
  const data = await getCustomerPaymentStatusPageData({ token, reference });
  const trackingHref = data.trackingPath ?? "/";
  const trackingLabel = data.trackingPath ? "Return to tracking" : "Go home";
  const packageTypeLabel = data.packageType
    ? getPackageTypeLabel(data.packageType)
    : "Not available";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1260px] flex-col px-5 py-8 md:px-8">
      <header className="admin-topbar mb-6 flex items-center gap-3 px-4 py-3 md:px-5">
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
          <div className="min-w-0">
            <p className="label-kicker">Customer Payment</p>
            <p className="font-display text-lg font-semibold text-slate-950 sm:text-xl">
              Payment status
            </p>
          </div>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <a href={trackingHref} className="btn btn-secondary">
            {trackingLabel}
          </a>
        </div>
      </header>

      <section className="panel-hero mb-6 p-6 md:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="label-kicker">Paystack Result</p>
            <h1 className="font-display mt-3 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
              {data.title}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-700 md:text-lg">
              {data.summary}
            </p>
            {data.failureReason ? (
              <p className="mt-4 text-sm leading-6 text-slate-600">
                Reason: {data.failureReason}
              </p>
            ) : null}
            {data.verificationMessage && data.verificationMessage !== data.failureReason ? (
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Paystack message: {data.verificationMessage}
              </p>
            ) : null}
          </div>

          <div
            className={`status-chip border px-4 py-3 text-sm font-semibold ${toneClasses(data.tone)}`}
          >
            {data.state.replaceAll("_", " ")}
          </div>
        </div>
      </section>

      <section className="mb-6 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <article className="glass-card p-5 md:p-6">
          <p className="label-kicker">Order Details</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <InfoCard label="Order Number" value={data.orderId ?? "Not available"} />
            <InfoCard label="Customer Name" value={data.customerName ?? "Not available"} />
            <InfoCard label="Room Number" value={data.roomNumber ?? "Not available"} />
            <InfoCard label="Package Type" value={packageTypeLabel} />
          </div>
        </article>

        <article className="glass-card p-5 md:p-6">
          <p className="label-kicker">Verification Summary</p>
          <div className="mt-5 grid gap-4">
            <InfoCard label="Expected Amount" value={formatMoney(data.amountExpectedKobo)} />
            <InfoCard
              label="Amount Received"
              value={
                data.amountPaidKobo === null && data.state === "PENDING"
                  ? "Awaiting confirmation"
                  : formatMoney(data.amountPaidKobo)
              }
            />
            <InfoCard
              label="Exact Full Amount Received"
              value={formatExactAmountState(data.exactAmountReceived)}
            />
          </div>
        </article>
      </section>

      <section className="glass-card p-5 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="label-kicker">Payment Record</p>
            <h2 className="font-display mt-2 text-2xl font-semibold text-slate-950">
              Backend payment state
            </h2>
          </div>
          <p className="text-sm leading-6 text-slate-600">
            This page reflects backend verification, not just the redirect result.
          </p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <InfoCard
            label="Package Payment Status"
            value={data.packagePaymentStatus ?? "Not available"}
          />
          <InfoCard
            label="Payment Source"
            value={data.packagePaymentSource ?? "Not available"}
          />
          <InfoCard
            label="Payment Reference"
            value={data.paymentReference ?? "Not available"}
          />
          <InfoCard label="Paid At" value={formatDate(data.paidAt)} />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <InfoCard label="Verified At" value={formatDate(data.verifiedAt)} />
          <InfoCard label="Return Path" value={data.trackingPath ?? "Not available"} />
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <a href={trackingHref} className="btn btn-primary">
            {data.trackingPath ? "Return to tracking page" : "Back to home"}
          </a>
          {data.state !== "SUCCESS" && data.state !== "PAID" && data.trackingPath ? (
            <a href={data.trackingPath} className="btn btn-secondary">
              Back and try again
            </a>
          ) : null}
        </div>
      </section>
    </main>
  );
}
