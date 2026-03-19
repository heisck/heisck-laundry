import { AppError } from "@/lib/app-error";
import { getDb, withDbConnectionRetry } from "@/lib/db";
import {
  initializePaystackPayment,
  verifyPaystackPayment,
} from "@/lib/paystack";
import { verifyTrackingToken } from "@/lib/tracking-token";
import type {
  PackagePaymentAttemptRecord,
  PackagePaymentAttemptStatus,
  PackageType,
  PaymentSource,
  PaymentStatus,
} from "@/lib/types";

import { invalidateAdminPackagesCache } from "./admin-packages";
import { invalidatePackagesListCache } from "./packages";

interface PaymentPackageRecord {
  id: string;
  order_id: string;
  tracking_token_id: string;
  customer_name: string;
  room_number: string;
  package_type: PackageType;
  total_price_ghs: number;
  expires_at: string;
  payment_status: PaymentStatus;
  payment_source: PaymentSource;
  payment_reference: string | null;
  payment_paid_at: string | null;
}

interface StartPackagePaymentResult {
  redirectUrl: string;
  reference: string | null;
}

type PaymentStatusTone = "success" | "warning" | "danger" | "neutral";

export interface CustomerPaymentStatusPageData {
  state:
    | PackagePaymentAttemptStatus
    | "PAID"
    | "NO_RECORD"
    | "INVALID_TRACKING";
  tone: PaymentStatusTone;
  title: string;
  summary: string;
  exactAmountReceived: boolean | null;
  orderId: string | null;
  customerName: string | null;
  roomNumber: string | null;
  packageType: PackageType | null;
  packagePaymentStatus: PaymentStatus | null;
  packagePaymentSource: PaymentSource | null;
  paymentReference: string | null;
  amountExpectedKobo: number | null;
  amountPaidKobo: number | null;
  customerEmail: string | null;
  verificationMessage: string | null;
  failureReason: string | null;
  paidAt: string | null;
  verifiedAt: string | null;
  trackingPath: string | null;
}

interface FinalizeAttemptOutcome {
  attemptStatus: PackagePaymentAttemptStatus;
  packageStatus: PaymentStatus;
  packageSource: PaymentSource;
  amountPaidKobo: number | null;
  currency: string;
  paystackStatus: string | null;
  verificationMessage: string | null;
  failureReason: string | null;
  paidAt: string | null;
  paystackResponse: Record<string, unknown>;
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toInteger(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.round(parsed);
}

function normalizeJsonRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function normalizeNullableJsonRecord(
  value: unknown,
): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return null;
}

function toIsoStringOrNull(value: unknown): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function getAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

function invalidatePaymentCaches() {
  invalidatePackagesListCache();
  invalidateAdminPackagesCache();
}

function toKobo(amountGhs: number): number {
  return Math.round(Number(amountGhs) * 100);
}

function sanitizeEmailLocalPart(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function buildFallbackPaymentEmail(record: PaymentPackageRecord): string {
  const orderSegment = sanitizeEmailLocalPart(record.order_id) || "order";
  const tokenSegment =
    sanitizeEmailLocalPart(record.tracking_token_id).slice(0, 12) || "token";
  return `pay-${orderSegment}-${tokenSegment}@heiscklaundry.local`;
}

function resolvePaymentEmail(record: PaymentPackageRecord): string {
  const configured = process.env.PAYSTACK_DEFAULT_CUSTOMER_EMAIL?.trim();
  if (configured) {
    return configured;
  }

  return buildFallbackPaymentEmail(record);
}

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() <= Date.now();
}

function buildReference(orderId: string): string {
  const base = sanitizeEmailLocalPart(orderId).replace(/-/g, "");
  return `hl.${base || "order"}.${Date.now()}`;
}

function mapPackageRow(row: Record<string, unknown>): PaymentPackageRecord {
  return {
    id: String(row.id),
    order_id: String(row.order_id),
    tracking_token_id: String(row.tracking_token_id),
    customer_name: String(row.customer_name),
    room_number: String(row.room_number),
    package_type: String(row.package_type) as PackageType,
    total_price_ghs: toNumber(row.total_price_ghs),
    expires_at: new Date(String(row.expires_at)).toISOString(),
    payment_status: String(row.payment_status ?? "UNPAID") as PaymentStatus,
    payment_source: String(row.payment_source ?? "NONE") as PaymentSource,
    payment_reference: row.payment_reference ? String(row.payment_reference) : null,
    payment_paid_at: toIsoStringOrNull(row.payment_paid_at),
  };
}

function mapPaymentAttemptRow(
  row: Record<string, unknown>,
): PackagePaymentAttemptRecord {
  return {
    id: String(row.id),
    package_id: String(row.package_id),
    tracking_token_id: String(row.tracking_token_id),
    order_id: String(row.order_id),
    paystack_reference: String(row.paystack_reference),
    paystack_access_code: row.paystack_access_code
      ? String(row.paystack_access_code)
      : null,
    paystack_authorization_url: row.paystack_authorization_url
      ? String(row.paystack_authorization_url)
      : null,
    status: String(row.status) as PackagePaymentAttemptStatus,
    amount_expected_kobo: Number(row.amount_expected_kobo ?? 0),
    amount_paid_kobo:
      row.amount_paid_kobo === null || row.amount_paid_kobo === undefined
        ? null
        : Number(row.amount_paid_kobo),
    currency: String(row.currency ?? "GHS"),
    paystack_status: row.paystack_status ? String(row.paystack_status) : null,
    verification_message: row.verification_message
      ? String(row.verification_message)
      : null,
    failure_reason: row.failure_reason ? String(row.failure_reason) : null,
    customer_email: String(row.customer_email),
    metadata: normalizeJsonRecord(row.metadata),
    paystack_response: normalizeNullableJsonRecord(row.paystack_response),
    paid_at: toIsoStringOrNull(row.paid_at),
    verified_at: toIsoStringOrNull(row.verified_at),
    created_at: new Date(String(row.created_at)).toISOString(),
    updated_at: new Date(String(row.updated_at)).toISOString(),
  };
}

async function getPackageForTrackingToken(
  token: string,
): Promise<PaymentPackageRecord> {
  const payload = await verifyTrackingToken(token);
  const rows = await withDbConnectionRetry(async () => {
    const sql = getDb();
    return sql`
      select
        id,
        order_id,
        tracking_token_id,
        customer_name,
        room_number,
        package_type,
        total_price_ghs,
        expires_at,
        payment_status,
        payment_source,
        payment_reference,
        payment_paid_at
      from packages
      where id = ${payload.packageId}
        and tracking_token_id = ${payload.tokenId}
      limit 1
    `;
  });

  if (rows.length === 0) {
    throw new AppError("PACKAGE_NOT_FOUND", 404, "Package not found.");
  }

  return mapPackageRow(rows[0] as Record<string, unknown>);
}

async function getPaymentAttemptForPackage(params: {
  packageId: string;
  trackingTokenId: string;
  reference?: string | null;
}): Promise<PackagePaymentAttemptRecord | null> {
  const rows = await withDbConnectionRetry(async () => {
    const sql = getDb();
    if (params.reference?.trim()) {
      return sql`
        select *
        from package_payment_attempts
        where package_id = ${params.packageId}
          and tracking_token_id = ${params.trackingTokenId}
          and paystack_reference = ${params.reference.trim()}
        order by created_at desc
        limit 1
      `;
    }

    return sql`
      select *
      from package_payment_attempts
      where package_id = ${params.packageId}
        and tracking_token_id = ${params.trackingTokenId}
      order by created_at desc
      limit 1
    `;
  });

  return rows.length > 0
    ? mapPaymentAttemptRow(rows[0] as Record<string, unknown>)
    : null;
}

function buildCallbackUrl(token: string): string {
  return `${getAppUrl()}/api/track/${token}/pay/callback`;
}

export function buildTrackingPath(token: string): string {
  return `/track/${token}`;
}

export function buildCustomerPaymentStatusPath(params: {
  token: string;
  reference?: string | null;
}): string {
  const searchParams = new URLSearchParams();
  searchParams.set("token", params.token);
  if (params.reference) {
    searchParams.set("reference", params.reference);
  }

  return `/customer/payment?${searchParams.toString()}`;
}

export function buildCustomerPaymentStatusUrl(params: {
  token: string;
  reference?: string | null;
}): string {
  return `${getAppUrl()}${buildCustomerPaymentStatusPath(params)}`;
}

function buildCancelActionUrl(token: string, reference: string): string {
  const searchParams = new URLSearchParams({
    reference,
    state: "cancelled",
  });

  return `${buildCallbackUrl(token)}?${searchParams.toString()}`;
}

function buildPaystackMetadata(params: {
  token: string;
  reference: string;
  record: PaymentPackageRecord;
}): Record<string, unknown> {
  return {
    cancel_action: buildCancelActionUrl(params.token, params.reference),
    orderId: params.record.order_id,
    customerId: params.record.id,
    customerName: params.record.customer_name,
    roomNumber: params.record.room_number,
    trackingToken: params.token,
    trackingTokenId: params.record.tracking_token_id,
    packageId: params.record.id,
    packageType: params.record.package_type,
    internalReference: params.reference,
    source: "heisck-laundry-tracking",
  };
}

function isTerminalAttemptStatus(status: PackagePaymentAttemptStatus): boolean {
  return status !== "PENDING";
}

function matchesMetadata(
  attempt: PackagePaymentAttemptRecord,
  metadata: Record<string, unknown>,
): boolean {
  const orderId = metadata.orderId;
  const packageId = metadata.packageId;
  const trackingTokenId = metadata.trackingTokenId;

  if (orderId !== undefined && String(orderId) !== attempt.order_id) {
    return false;
  }

  if (packageId !== undefined && String(packageId) !== attempt.package_id) {
    return false;
  }

  if (
    trackingTokenId !== undefined &&
    String(trackingTokenId) !== attempt.tracking_token_id
  ) {
    return false;
  }

  return true;
}

function deriveFailedReason(
  value: string | null | undefined,
  fallback: string,
): string {
  return value?.trim() ? value : fallback;
}

function mapVerificationOutcome(
  attempt: PackagePaymentAttemptRecord,
  verification: Awaited<ReturnType<typeof verifyPaystackPayment>>,
): FinalizeAttemptOutcome {
  const data = verification.data;
  const paystackStatus = String(data.status ?? "").toLowerCase() || null;
  const amountPaidKobo = toInteger(data.amount);
  const currency = String(data.currency ?? "GHS").toUpperCase();
  const metadata = normalizeJsonRecord(data.metadata);
  const verificationMessage =
    typeof verification.message === "string" && verification.message.trim()
      ? verification.message
      : typeof data.gateway_response === "string" && data.gateway_response.trim()
        ? data.gateway_response
        : null;
  const paidAt = toIsoStringOrNull(data.paid_at);

  if (!paystackStatus) {
    return {
      attemptStatus: "VERIFICATION_FAILED",
      packageStatus: "UNPAID",
      packageSource: "NONE",
      amountPaidKobo,
      currency,
      paystackStatus: null,
      verificationMessage,
      failureReason: "Paystack did not return a transaction status.",
      paidAt,
      paystackResponse: normalizeJsonRecord(data),
    };
  }

  if (currency !== "GHS") {
    return {
      attemptStatus: "VERIFICATION_FAILED",
      packageStatus: "UNPAID",
      packageSource: "NONE",
      amountPaidKobo,
      currency,
      paystackStatus,
      verificationMessage,
      failureReason: `Unexpected payment currency: ${currency}.`,
      paidAt,
      paystackResponse: normalizeJsonRecord(data),
    };
  }

  if (paystackStatus !== "success") {
    const cancelledStatuses = new Set(["abandoned", "cancelled"]);
    const pendingStatuses = new Set(["pending", "ongoing", "processing", "queued"]);
    const nextStatus = cancelledStatuses.has(paystackStatus)
      ? "CANCELLED"
      : pendingStatuses.has(paystackStatus)
        ? "PENDING"
        : "FAILED";

    return {
      attemptStatus: nextStatus,
      packageStatus: nextStatus === "PENDING" ? "PENDING" : "UNPAID",
      packageSource: nextStatus === "PENDING" ? "PAYSTACK" : "NONE",
      amountPaidKobo,
      currency,
      paystackStatus,
      verificationMessage,
      failureReason:
        nextStatus === "CANCELLED"
          ? deriveFailedReason(
              verificationMessage,
              "The payment was cancelled before completion.",
            )
          : nextStatus === "PENDING"
            ? deriveFailedReason(
                verificationMessage,
                "Paystack is still processing the payment.",
              )
            : deriveFailedReason(
                verificationMessage,
                `Paystack reported the transaction as ${paystackStatus}.`,
              ),
      paidAt,
      paystackResponse: normalizeJsonRecord(data),
    };
  }

  if (!matchesMetadata(attempt, metadata)) {
    return {
      attemptStatus: "VERIFICATION_FAILED",
      packageStatus: "UNPAID",
      packageSource: "NONE",
      amountPaidKobo,
      currency,
      paystackStatus,
      verificationMessage,
      failureReason:
        "The payment metadata did not match the expected order details.",
      paidAt,
      paystackResponse: normalizeJsonRecord(data),
    };
  }

  if (amountPaidKobo === null) {
    return {
      attemptStatus: "VERIFICATION_FAILED",
      packageStatus: "UNPAID",
      packageSource: "NONE",
      amountPaidKobo: null,
      currency,
      paystackStatus,
      verificationMessage,
      failureReason: "Paystack did not return the amount that was paid.",
      paidAt,
      paystackResponse: normalizeJsonRecord(data),
    };
  }

  if (amountPaidKobo !== attempt.amount_expected_kobo) {
    return {
      attemptStatus: "AMOUNT_MISMATCH",
      packageStatus: "UNPAID",
      packageSource: "NONE",
      amountPaidKobo,
      currency,
      paystackStatus,
      verificationMessage,
      failureReason: `Expected GHS ${(attempt.amount_expected_kobo / 100).toFixed(2)}, but Paystack returned GHS ${(amountPaidKobo / 100).toFixed(2)}.`,
      paidAt,
      paystackResponse: normalizeJsonRecord(data),
    };
  }

  return {
    attemptStatus: "SUCCESS",
    packageStatus: "PAID",
    packageSource: "PAYSTACK",
    amountPaidKobo,
    currency,
    paystackStatus,
    verificationMessage,
    failureReason: null,
    paidAt,
    paystackResponse: normalizeJsonRecord(data),
  };
}

function buildAttemptPresentation(
  attempt: PackagePaymentAttemptRecord | null,
  packageRecord: PaymentPackageRecord | null,
): Pick<
  CustomerPaymentStatusPageData,
  "state" | "tone" | "title" | "summary" | "exactAmountReceived"
> {
  if (!packageRecord) {
    return {
      state: "INVALID_TRACKING",
      tone: "danger",
      title: "Payment session unavailable",
      summary:
        "We could not match this payment session to a valid tracking record.",
      exactAmountReceived: null,
    };
  }

  if (!attempt) {
    if (packageRecord.payment_status === "PAID") {
      return {
        state: "PAID",
        tone: "success",
        title: "Payment already accepted",
        summary:
          "This order is already marked as paid in the backend payment record.",
        exactAmountReceived: true,
      };
    }

    return {
      state: "NO_RECORD",
      tone: "neutral",
      title: "No payment record found",
      summary:
        "There is no Paystack payment attempt linked to this tracking session yet.",
      exactAmountReceived: null,
    };
  }

  if (attempt.status === "SUCCESS") {
    return {
      state: attempt.status,
      tone: "success",
      title: "Payment successful",
      summary:
        "The backend verified the transaction and received the exact full amount for this order.",
      exactAmountReceived: true,
    };
  }

  if (attempt.status === "AMOUNT_MISMATCH") {
    return {
      state: attempt.status,
      tone: "danger",
      title: "Amount mismatch",
      summary:
        "The payment was not accepted because the amount received did not match the exact amount due.",
      exactAmountReceived: false,
    };
  }

  if (attempt.status === "CANCELLED") {
    return {
      state: attempt.status,
      tone: "warning",
      title: "Payment cancelled",
      summary:
        "The payment was cancelled before the order could be marked as paid.",
      exactAmountReceived: false,
    };
  }

  if (attempt.status === "VERIFICATION_FAILED") {
    return {
      state: attempt.status,
      tone: "danger",
      title: "Payment verification failed",
      summary:
        "Paystack returned a result we could not accept, so the order remains unpaid.",
      exactAmountReceived: false,
    };
  }

  if (attempt.status === "FAILED") {
    return {
      state: attempt.status,
      tone: "danger",
      title: "Payment failed",
      summary:
        "The transaction was not completed successfully, so the order remains unpaid.",
      exactAmountReceived: false,
    };
  }

  return {
    state: attempt.status,
    tone: "warning",
    title: "Payment pending",
    summary:
      "Paystack has not confirmed a final successful payment yet, so the order is still pending.",
    exactAmountReceived: null,
  };
}

export async function startPackagePayment(
  token: string,
): Promise<StartPackagePaymentResult> {
  const payload = await verifyTrackingToken(token);

  const transactionResult = await withDbConnectionRetry(async () => {
    const sql = getDb();
    return sql.begin(async (tx) => {
      const trx = tx as unknown as ReturnType<typeof getDb>;
      const packageRows = await trx`
        select
          id,
          order_id,
          tracking_token_id,
          customer_name,
          room_number,
          package_type,
          total_price_ghs,
          expires_at,
          payment_status,
          payment_source,
          payment_reference,
          payment_paid_at
        from packages
        where id = ${payload.packageId}
          and tracking_token_id = ${payload.tokenId}
        limit 1
        for update
      `;

      if (packageRows.length === 0) {
        throw new AppError("PACKAGE_NOT_FOUND", 404, "Package not found.");
      }

      const packageRecord = mapPackageRow(
        packageRows[0] as Record<string, unknown>,
      );

      if (isExpired(packageRecord.expires_at)) {
        throw new AppError(
          "TRACKING_SESSION_EXPIRED",
          410,
          "This tracking link has expired.",
        );
      }

      if (
        packageRecord.payment_status === "PENDING" &&
        packageRecord.payment_reference
      ) {
        return {
          mode: "existing" as const,
          reference: packageRecord.payment_reference,
        };
      }

      if (
        packageRecord.payment_status === "PAID"
      ) {
        return {
          mode: "existing" as const,
          reference: packageRecord.payment_reference,
        };
      }

      const reference = buildReference(packageRecord.order_id);
      const customerEmail = resolvePaymentEmail(packageRecord);
      const metadata = buildPaystackMetadata({
        token,
        reference,
        record: packageRecord,
      });

      await trx`
        insert into package_payment_attempts
          (
            package_id,
            tracking_token_id,
            order_id,
            paystack_reference,
            status,
            amount_expected_kobo,
            currency,
            customer_email,
            metadata
          )
        values
          (
            ${packageRecord.id},
            ${packageRecord.tracking_token_id},
            ${packageRecord.order_id},
            ${reference},
            'PENDING',
            ${toKobo(packageRecord.total_price_ghs)},
            'GHS',
            ${customerEmail},
            ${JSON.stringify(metadata)}
          )
      `;

      await trx`
        update packages
        set
          payment_status = 'PENDING',
          payment_source = 'PAYSTACK',
          payment_reference = ${reference},
          payment_paid_at = null,
          updated_at = now()
        where id = ${packageRecord.id}
      `;

      return {
        mode: "created" as const,
        record: packageRecord,
        reference,
        customerEmail,
        metadata,
      };
    });
  });

  if (transactionResult.mode === "existing") {
    return {
      redirectUrl: transactionResult.reference
        ? buildCustomerPaymentStatusUrl({
            token,
            reference: transactionResult.reference,
          })
        : `${getAppUrl()}${buildTrackingPath(token)}`,
      reference: transactionResult.reference,
    };
  }

  const expectedReference = transactionResult.reference;
  const statusUrl = buildCustomerPaymentStatusUrl({
    token,
    reference: expectedReference,
  });

  try {
    const initialized = await initializePaystackPayment({
      email: transactionResult.customerEmail,
      amountKobo: toKobo(transactionResult.record.total_price_ghs),
      reference: expectedReference,
      callbackUrl: buildCallbackUrl(token),
      metadata: transactionResult.metadata,
    });

    await withDbConnectionRetry(async () => {
      const sql = getDb();
      await sql`
        update package_payment_attempts
        set
          paystack_access_code = ${initialized.data.access_code},
          paystack_authorization_url = ${initialized.data.authorization_url},
          updated_at = now()
        where paystack_reference = ${expectedReference}
      `;
    });

    invalidatePaymentCaches();

    return {
      redirectUrl: initialized.data.authorization_url,
      reference: expectedReference,
    };
  } catch (error) {
    const failureReason =
      error instanceof Error
        ? error.message
        : "Unable to initialize a Paystack payment session.";

    await withDbConnectionRetry(async () => {
      const sql = getDb();
      await sql.begin(async (tx) => {
        const trx = tx as unknown as ReturnType<typeof getDb>;
        await trx`
          update package_payment_attempts
          set
            status = 'FAILED',
            paystack_status = 'initialize_failed',
            verification_message = ${failureReason},
            failure_reason = ${failureReason},
            verified_at = now(),
            updated_at = now()
          where paystack_reference = ${expectedReference}
        `;

        await trx`
          update packages
          set
            payment_status = 'UNPAID',
            payment_source = 'NONE',
            payment_reference = null,
            payment_paid_at = null,
            updated_at = now()
          where id = ${transactionResult.record.id}
            and payment_reference = ${expectedReference}
        `;
      });
    });

    invalidatePaymentCaches();

    return {
      redirectUrl: statusUrl,
      reference: expectedReference,
    };
  }
}

export async function handlePaystackRedirect(params: {
  token: string;
  reference: string | null;
  state?: string | null;
}): Promise<string> {
  const fallbackUrl = buildCustomerPaymentStatusUrl({
    token: params.token,
    reference: params.reference,
  });

  if (!params.reference) {
    return fallbackUrl;
  }

  let payload: Awaited<ReturnType<typeof verifyTrackingToken>>;
  try {
    payload = await verifyTrackingToken(params.token);
  } catch {
    return fallbackUrl;
  }

  const reference = params.reference;

  if (params.state === "cancelled") {
    await withDbConnectionRetry(async () => {
      const sql = getDb();
      await sql.begin(async (tx) => {
        const trx = tx as unknown as ReturnType<typeof getDb>;
        const attemptRows = await trx`
          select id, status
          from package_payment_attempts
          where package_id = ${payload.packageId}
            and tracking_token_id = ${payload.tokenId}
            and paystack_reference = ${reference}
          limit 1
          for update
        `;

        if (attemptRows.length === 0) {
          return;
        }

        const attemptStatus = String(
          (attemptRows[0] as { status: string }).status,
        ) as PackagePaymentAttemptStatus;

        if (attemptStatus === "PENDING") {
          await trx`
            update package_payment_attempts
            set
              status = 'CANCELLED',
              paystack_status = 'cancelled',
              verification_message = 'Customer cancelled the payment on Paystack.',
              failure_reason = 'Customer cancelled the payment on Paystack.',
              verified_at = now(),
              updated_at = now()
            where id = ${(attemptRows[0] as { id: string }).id}
          `;

          await trx`
            update packages
            set
              payment_status = 'UNPAID',
              payment_source = 'NONE',
              payment_reference = null,
              payment_paid_at = null,
              updated_at = now()
            where id = ${payload.packageId}
              and payment_reference = ${reference}
          `;
        }
      });
    });

    invalidatePaymentCaches();
    return fallbackUrl;
  }

  const attemptRows = await withDbConnectionRetry(async () => {
    const sql = getDb();
    return sql`
      select *
      from package_payment_attempts
      where package_id = ${payload.packageId}
        and tracking_token_id = ${payload.tokenId}
        and paystack_reference = ${reference}
      limit 1
    `;
  });

  if (attemptRows.length === 0) {
    return fallbackUrl;
  }

  const attempt = mapPaymentAttemptRow(attemptRows[0] as Record<string, unknown>);
  if (isTerminalAttemptStatus(attempt.status)) {
    return fallbackUrl;
  }

  let verification: Awaited<ReturnType<typeof verifyPaystackPayment>>;
  try {
    verification = await verifyPaystackPayment(reference);
  } catch (error) {
    const failureReason =
      error instanceof Error
        ? error.message
        : "Unable to verify the Paystack payment.";

    await withDbConnectionRetry(async () => {
      const sql = getDb();
      await sql.begin(async (tx) => {
        const trx = tx as unknown as ReturnType<typeof getDb>;
        await trx`
          update package_payment_attempts
          set
            status = 'VERIFICATION_FAILED',
            verification_message = ${failureReason},
            failure_reason = ${failureReason},
            verified_at = now(),
            updated_at = now()
          where package_id = ${payload.packageId}
            and tracking_token_id = ${payload.tokenId}
            and paystack_reference = ${reference}
            and status = 'PENDING'
        `;

        await trx`
          update packages
          set
            payment_status = 'UNPAID',
            payment_source = 'NONE',
            payment_reference = null,
            payment_paid_at = null,
            updated_at = now()
          where id = ${payload.packageId}
            and payment_reference = ${reference}
            and payment_status = 'PENDING'
        `;
      });
    });

    invalidatePaymentCaches();
    return fallbackUrl;
  }

  const outcome = mapVerificationOutcome(attempt, verification);

  await withDbConnectionRetry(async () => {
    const sql = getDb();
    await sql.begin(async (tx) => {
      const trx = tx as unknown as ReturnType<typeof getDb>;
      const lockedAttemptRows = await trx`
        select id, status
        from package_payment_attempts
        where package_id = ${payload.packageId}
          and tracking_token_id = ${payload.tokenId}
          and paystack_reference = ${reference}
        limit 1
        for update
      `;

      if (lockedAttemptRows.length === 0) {
        return;
      }

      const lockedStatus = String(
        (lockedAttemptRows[0] as { status: string }).status,
      ) as PackagePaymentAttemptStatus;

      if (lockedStatus !== "PENDING") {
        return;
      }

      await trx`
        update package_payment_attempts
        set
          status = ${outcome.attemptStatus},
          amount_paid_kobo = ${outcome.amountPaidKobo},
          currency = ${outcome.currency},
          paystack_status = ${outcome.paystackStatus},
          verification_message = ${outcome.verificationMessage},
          failure_reason = ${outcome.failureReason},
          paystack_response = ${JSON.stringify(outcome.paystackResponse)},
          paid_at = ${outcome.paidAt},
          verified_at = now(),
          updated_at = now()
        where id = ${(lockedAttemptRows[0] as { id: string }).id}
      `;

      await trx`
        update packages
        set
          payment_status = ${outcome.packageStatus},
          payment_source = ${outcome.packageSource},
          payment_reference = ${
            outcome.packageStatus === "PAID" || outcome.packageStatus === "PENDING"
              ? reference
              : null
          },
          payment_paid_at = ${outcome.packageStatus === "PAID" ? outcome.paidAt : null},
          updated_at = now()
        where id = ${payload.packageId}
      `;
    });
  });

  invalidatePaymentCaches();
  return fallbackUrl;
}

export async function getCustomerPaymentStatusPageData(params: {
  token?: string | null;
  reference?: string | null;
}): Promise<CustomerPaymentStatusPageData> {
  const token = params.token?.trim();
  if (!token) {
    const presentation = buildAttemptPresentation(null, null);
    return {
      ...presentation,
      orderId: null,
      customerName: null,
      roomNumber: null,
      packageType: null,
      packagePaymentStatus: null,
      packagePaymentSource: null,
      paymentReference: params.reference ?? null,
      amountExpectedKobo: null,
      amountPaidKobo: null,
      customerEmail: null,
      verificationMessage: null,
      failureReason: null,
      paidAt: null,
      verifiedAt: null,
      trackingPath: null,
    };
  }

  let packageRecord: PaymentPackageRecord;
  try {
    packageRecord = await getPackageForTrackingToken(token);
  } catch {
    const presentation = buildAttemptPresentation(null, null);
    return {
      ...presentation,
      orderId: null,
      customerName: null,
      roomNumber: null,
      packageType: null,
      packagePaymentStatus: null,
      packagePaymentSource: null,
      paymentReference: params.reference ?? null,
      amountExpectedKobo: null,
      amountPaidKobo: null,
      customerEmail: null,
      verificationMessage: null,
      failureReason: null,
      paidAt: null,
      verifiedAt: null,
      trackingPath: null,
    };
  }

  const trackingPath = buildTrackingPath(token);
  let attempt = await getPaymentAttemptForPackage({
    packageId: packageRecord.id,
    trackingTokenId: packageRecord.tracking_token_id,
    reference: params.reference,
  });

  if (attempt?.status === "PENDING") {
    await handlePaystackRedirect({
      token,
      reference: attempt.paystack_reference,
    });

    packageRecord = await getPackageForTrackingToken(token).catch(
      () => packageRecord,
    );
    attempt = await getPaymentAttemptForPackage({
      packageId: packageRecord.id,
      trackingTokenId: packageRecord.tracking_token_id,
      reference: attempt.paystack_reference,
    });
  }

  const presentation = buildAttemptPresentation(attempt, packageRecord);

  return {
    ...presentation,
    orderId: packageRecord.order_id,
    customerName: packageRecord.customer_name,
    roomNumber: packageRecord.room_number,
    packageType: packageRecord.package_type,
    packagePaymentStatus: packageRecord.payment_status,
    packagePaymentSource: packageRecord.payment_source,
    paymentReference:
      params.reference?.trim() ||
      attempt?.paystack_reference ||
      packageRecord.payment_reference,
    amountExpectedKobo:
      attempt?.amount_expected_kobo ?? toKobo(packageRecord.total_price_ghs),
    amountPaidKobo:
      attempt?.amount_paid_kobo ??
      (packageRecord.payment_status === "PAID"
        ? toKobo(packageRecord.total_price_ghs)
        : null),
    customerEmail: attempt?.customer_email ?? null,
    verificationMessage: attempt?.verification_message ?? null,
    failureReason: attempt?.failure_reason ?? null,
    paidAt: attempt?.paid_at ?? packageRecord.payment_paid_at,
    verifiedAt: attempt?.verified_at ?? null,
    trackingPath,
  };
}
