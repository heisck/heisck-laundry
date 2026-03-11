import { randomUUID } from "crypto";
import QRCode from "qrcode";

import { AppError } from "@/lib/app-error";
import { getDb } from "@/lib/db";
import { buildOrderId, buildOrderPrefix } from "@/lib/order-id";
import { dedupePhones, normalizeGhanaPhone } from "@/lib/phone";
import { sendArkeselSms } from "@/lib/sms/arkesel";
import { getStatusLabel, isForwardTransition } from "@/lib/status";
import { addDays, formatAccraDateTime } from "@/lib/time";
import { signTrackingToken } from "@/lib/tracking-token";
import type {
  NotificationLogRecord,
  NotificationTriggerType,
  PackageRecord,
  PackageStatus,
} from "@/lib/types";

interface CreatePackageInput {
  customerName: string;
  roomNumber: string;
  clothesCount: number;
  totalWeightKg: number;
  totalPriceGhs: number;
  primaryPhone: string;
  secondaryPhone?: string | null;
  etaAt: string;
}

interface SmsDispatchResult {
  phoneNumber: string;
  ok: boolean;
  deliveryState: string;
  providerMessageId: string | null;
  errorText: string | null;
}

interface CreatePackageResult {
  package: PackageRecord;
  trackingUrl: string;
  qrCodeDataUrl: string;
  notifications: SmsDispatchResult[];
}

function toNumber(value: unknown): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mapPackage(row: Record<string, unknown>): PackageRecord {
  return {
    id: String(row.id),
    week_id: String(row.week_id),
    order_id: String(row.order_id),
    tracking_token_id: String(row.tracking_token_id),
    customer_name: String(row.customer_name),
    room_number: String(row.room_number),
    clothes_count: Number(row.clothes_count ?? 0),
    total_weight_kg: toNumber(row.total_weight_kg),
    total_price_ghs: toNumber(row.total_price_ghs),
    primary_phone: String(row.primary_phone),
    secondary_phone: row.secondary_phone ? String(row.secondary_phone) : null,
    status: String(row.status) as PackageStatus,
    eta_at: new Date(String(row.eta_at)).toISOString(),
    created_by: String(row.created_by),
    created_at: new Date(String(row.created_at)).toISOString(),
    updated_at: new Date(String(row.updated_at)).toISOString(),
    picked_up_at: row.picked_up_at ? new Date(String(row.picked_up_at)).toISOString() : null,
    expires_at: new Date(String(row.expires_at)).toISOString(),
    week_status: String(row.week_status ?? "ACTIVE") as PackageRecord["week_status"],
    last_delivery_state: row.last_delivery_state
      ? String(row.last_delivery_state)
      : null,
    last_notification_at: row.last_notification_at
      ? new Date(String(row.last_notification_at)).toISOString()
      : null,
  };
}

function mapNotification(row: Record<string, unknown>): NotificationLogRecord {
  return {
    id: String(row.id),
    package_id: String(row.package_id),
    trigger_type: String(row.trigger_type) as NotificationTriggerType,
    status_context: row.status_context
      ? (String(row.status_context) as PackageStatus)
      : null,
    phone_number: String(row.phone_number),
    provider: String(row.provider),
    provider_message_id: row.provider_message_id
      ? String(row.provider_message_id)
      : null,
    delivery_state: String(row.delivery_state),
    error_text: row.error_text ? String(row.error_text) : null,
    sent_at: new Date(String(row.sent_at)).toISOString(),
  };
}

function getAppBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

async function createTrackingUrl(
  packageId: string,
  tokenId: string,
  expiresAt: Date,
): Promise<string> {
  const token = await signTrackingToken(packageId, tokenId, expiresAt);
  return `${getAppBaseUrl()}/track/${token}`;
}

function buildMessage({
  orderId,
  status,
  trackingUrl,
  etaAt,
}: {
  orderId: string;
  status: PackageStatus;
  trackingUrl: string;
  etaAt: string;
}): string {
  const statusLabel = getStatusLabel(status);

  if (status === "RECEIVED") {
    return `Laundry update for order ${orderId}: package received. ETA ${formatAccraDateTime(etaAt)}. Track: ${trackingUrl}`;
  }

  return `Laundry update for order ${orderId}: status is now ${statusLabel}. ETA ${formatAccraDateTime(etaAt)}. Track: ${trackingUrl}`;
}

async function logNotification(params: {
  packageId: string;
  triggerType: NotificationTriggerType;
  statusContext: PackageStatus | null;
  phoneNumber: string;
  providerMessageId: string | null;
  deliveryState: string;
  errorText: string | null;
}) {
  const sql = getDb();
  await sql`
    insert into notification_logs
      (
        package_id,
        trigger_type,
        status_context,
        phone_number,
        provider,
        provider_message_id,
        delivery_state,
        error_text,
        sent_at
      )
    values
      (
        ${params.packageId},
        ${params.triggerType},
        ${params.statusContext},
        ${params.phoneNumber},
        'arkesel',
        ${params.providerMessageId},
        ${params.deliveryState},
        ${params.errorText},
        now()
      )
  `;
}

async function dispatchPackageSms(params: {
  packageRecord: PackageRecord;
  triggerType: NotificationTriggerType;
  statusContext: PackageStatus | null;
  trackingUrl: string;
}): Promise<SmsDispatchResult[]> {
  const message = buildMessage({
    orderId: params.packageRecord.order_id,
    status: params.statusContext ?? params.packageRecord.status,
    trackingUrl: params.trackingUrl,
    etaAt: params.packageRecord.eta_at,
  });

  const recipients = dedupePhones(
    params.packageRecord.primary_phone,
    params.packageRecord.secondary_phone,
  );

  const results: SmsDispatchResult[] = [];

  for (const phoneNumber of recipients) {
    try {
      const sendResult = await sendArkeselSms({
        to: phoneNumber,
        content: message,
      });

      await logNotification({
        packageId: params.packageRecord.id,
        triggerType: params.triggerType,
        statusContext: params.statusContext,
        phoneNumber,
        providerMessageId: sendResult.providerMessageId,
        deliveryState: sendResult.deliveryState,
        errorText: sendResult.errorText,
      });

      results.push({
        phoneNumber,
        ok: sendResult.ok,
        deliveryState: sendResult.deliveryState,
        providerMessageId: sendResult.providerMessageId,
        errorText: sendResult.errorText,
      });
    } catch (error) {
      const errorText =
        error instanceof Error ? error.message : "Failed to send SMS.";

      await logNotification({
        packageId: params.packageRecord.id,
        triggerType: params.triggerType,
        statusContext: params.statusContext,
        phoneNumber,
        providerMessageId: null,
        deliveryState: "FAILED",
        errorText,
      });

      results.push({
        phoneNumber,
        ok: false,
        deliveryState: "FAILED",
        providerMessageId: null,
        errorText,
      });
    }
  }

  return results;
}

export async function createPackage(
  input: CreatePackageInput,
  userId: string,
): Promise<CreatePackageResult> {
  const sql = getDb();

  const normalizedPrimary = normalizeGhanaPhone(input.primaryPhone);
  if (!normalizedPrimary) {
    throw new AppError(
      "INVALID_PRIMARY_PHONE",
      400,
      "Primary phone number must be a valid Ghana phone number.",
    );
  }

  const normalizedSecondary = input.secondaryPhone?.trim()
    ? normalizeGhanaPhone(input.secondaryPhone)
    : null;

  if (input.secondaryPhone?.trim() && !normalizedSecondary) {
    throw new AppError(
      "INVALID_SECONDARY_PHONE",
      400,
      "Secondary phone number must be a valid Ghana phone number.",
    );
  }

  const eta = new Date(input.etaAt);
  if (Number.isNaN(eta.getTime())) {
    throw new AppError("INVALID_ETA", 400, "ETA must be a valid date/time.");
  }

  const prefix = buildOrderPrefix(input.roomNumber, input.customerName);
  const trackingTokenId = randomUUID();
  const now = new Date();
  const expiresAt = addDays(now, 3);

  const insertedPackage = await sql.begin(async (tx) => {
    const trx = tx as unknown as ReturnType<typeof getDb>;
    const activeWeekRows = await trx`
      select id
      from processing_weeks
      where status = 'ACTIVE'
      order by start_at desc
      limit 1
      for update
    `;

    if (activeWeekRows.length === 0) {
      throw new AppError(
        "NO_ACTIVE_WEEK",
        409,
        "No active processing week. Start a week before creating packages.",
      );
    }

    const weekId = String((activeWeekRows[0] as { id: string }).id);
    const prefixPattern = `${prefix}%`;

    await trx`select pg_advisory_xact_lock(hashtext(${prefix}))`;

    const existingRows = await trx`
      select order_id
      from packages
      where order_id like ${prefixPattern}
    `;

    const sequenceRegex = new RegExp(`^${escapeRegExp(prefix)}(\\d+)$`);
    let baseSequence = 1;

    for (const row of existingRows) {
      const orderId = String((row as { order_id: string }).order_id);
      const match = sequenceRegex.exec(orderId);
      if (!match) {
        continue;
      }

      const parsed = Number(match[1]);
      if (Number.isFinite(parsed) && parsed >= baseSequence) {
        baseSequence = parsed + 1;
      }
    }

    for (let attempt = 0; attempt < 100; attempt += 1) {
      const orderId = buildOrderId(prefix, baseSequence + attempt);

      const rows = await trx`
        insert into packages
          (
            week_id,
            order_id,
            tracking_token_id,
            customer_name,
            room_number,
            clothes_count,
            total_weight_kg,
            total_price_ghs,
            primary_phone,
            secondary_phone,
            status,
            eta_at,
            created_by,
            created_at,
            updated_at,
            picked_up_at,
            expires_at
          )
        values
          (
            ${weekId},
            ${orderId},
            ${trackingTokenId},
            ${input.customerName.trim()},
            ${input.roomNumber.trim()},
            ${input.clothesCount},
            ${input.totalWeightKg},
            ${input.totalPriceGhs},
            ${normalizedPrimary},
            ${normalizedSecondary},
            'RECEIVED',
            ${eta.toISOString()},
            ${userId},
            now(),
            now(),
            null,
            ${expiresAt.toISOString()}
          )
        on conflict (order_id) do nothing
        returning *
      `;

      if (rows.length === 0) {
        continue;
      }

      await trx`
        insert into package_status_events
          (package_id, from_status, to_status, changed_by, changed_at)
        values
          (${rows[0].id}, null, 'RECEIVED', ${userId}, now())
      `;

      const row = rows[0] as Record<string, unknown>;
      return {
        ...row,
        week_status: "ACTIVE",
        last_delivery_state: null,
        last_notification_at: null,
      };
    }

    throw new AppError(
      "ORDER_ID_EXHAUSTED",
      500,
      "Unable to generate a unique order ID after multiple attempts.",
    );
  });

  const mappedPackage = mapPackage(insertedPackage);
  const trackingUrl = await createTrackingUrl(
    mappedPackage.id,
    mappedPackage.tracking_token_id,
    new Date(mappedPackage.expires_at),
  );
  const qrCodeDataUrl = await QRCode.toDataURL(trackingUrl, {
    width: 240,
    margin: 1,
  });

  const notifications = await dispatchPackageSms({
    packageRecord: mappedPackage,
    triggerType: "CREATED",
    statusContext: mappedPackage.status,
    trackingUrl,
  });

  return {
    package: mappedPackage,
    trackingUrl,
    qrCodeDataUrl,
    notifications,
  };
}

export async function listPackages(options?: {
  search?: string;
  status?: PackageStatus;
}): Promise<PackageRecord[]> {
  const sql = getDb();
  const pattern = options?.search ? `%${options.search.trim()}%` : null;

  const rows = await sql`
    select
      p.*,
      w.status as week_status,
      (
        select nl.delivery_state
        from notification_logs nl
        where nl.package_id = p.id
        order by nl.sent_at desc
        limit 1
      ) as last_delivery_state,
      (
        select nl.sent_at
        from notification_logs nl
        where nl.package_id = p.id
        order by nl.sent_at desc
        limit 1
      ) as last_notification_at
    from packages p
    join processing_weeks w on w.id = p.week_id
    where
      (${pattern}::text is null
        or p.order_id ilike ${pattern}
        or p.room_number ilike ${pattern}
        or p.customer_name ilike ${pattern})
      and (${options?.status ?? null}::text is null or p.status = ${options?.status ?? null})
    order by p.created_at desc
    limit 200
  `;

  return rows.map((row) => mapPackage(row as Record<string, unknown>));
}

export async function getPackageById(packageId: string): Promise<PackageRecord> {
  const sql = getDb();
  const rows = await sql`
    select
      p.*,
      w.status as week_status,
      (
        select nl.delivery_state
        from notification_logs nl
        where nl.package_id = p.id
        order by nl.sent_at desc
        limit 1
      ) as last_delivery_state,
      (
        select nl.sent_at
        from notification_logs nl
        where nl.package_id = p.id
        order by nl.sent_at desc
        limit 1
      ) as last_notification_at
    from packages p
    join processing_weeks w on w.id = p.week_id
    where p.id = ${packageId}
    limit 1
  `;

  if (rows.length === 0) {
    throw new AppError("PACKAGE_NOT_FOUND", 404, "Package not found.");
  }

  return mapPackage(rows[0] as Record<string, unknown>);
}

export async function getPackageNotifications(
  packageId: string,
): Promise<NotificationLogRecord[]> {
  const sql = getDb();
  const rows = await sql`
    select
      id,
      package_id,
      trigger_type,
      status_context,
      phone_number,
      provider,
      provider_message_id,
      delivery_state,
      error_text,
      sent_at
    from notification_logs
    where package_id = ${packageId}
    order by sent_at desc
  `;

  return rows.map((row) => mapNotification(row as Record<string, unknown>));
}

export async function updatePackageStatus(
  packageId: string,
  nextStatus: PackageStatus,
  userId: string,
): Promise<{
  package: PackageRecord;
  skipped: boolean;
  notifications: SmsDispatchResult[];
}> {
  const sql = getDb();

  const updatedPackage = await sql.begin(async (tx) => {
    const trx = tx as unknown as ReturnType<typeof getDb>;
    const packageRows = await trx`
      select p.*, w.status as week_status
      from packages p
      join processing_weeks w on w.id = p.week_id
      where p.id = ${packageId}
      for update
    `;

    if (packageRows.length === 0) {
      throw new AppError("PACKAGE_NOT_FOUND", 404, "Package not found.");
    }

    const existing = mapPackage(packageRows[0] as Record<string, unknown>);

    if (existing.status === nextStatus) {
      return { package: existing, skipped: true };
    }

    if (!isForwardTransition(existing.status, nextStatus)) {
      throw new AppError(
        "INVALID_STATUS_TRANSITION",
        409,
        `Cannot move status from ${existing.status} to ${nextStatus}.`,
      );
    }

    const now = new Date();
    const isPickedUp = nextStatus === "PICKED_UP";

    const rows = await trx`
      update packages
      set
        status = ${nextStatus},
        updated_at = ${now.toISOString()},
        picked_up_at = ${isPickedUp ? now.toISOString() : existing.picked_up_at},
        expires_at = ${isPickedUp ? now.toISOString() : existing.expires_at}
      where id = ${packageId}
      returning *
    `;

    await trx`
      insert into package_status_events
        (package_id, from_status, to_status, changed_by, changed_at)
      values
        (${packageId}, ${existing.status}, ${nextStatus}, ${userId}, now())
    `;

    const row = rows[0] as Record<string, unknown>;
    return {
      package: mapPackage({
        ...row,
        week_status: existing.week_status,
        last_delivery_state: existing.last_delivery_state,
        last_notification_at: existing.last_notification_at,
      }),
      skipped: false,
    };
  });

  if (updatedPackage.skipped) {
    return {
      package: updatedPackage.package,
      skipped: true,
      notifications: [],
    };
  }

  const trackingUrl = await createTrackingUrl(
    updatedPackage.package.id,
    updatedPackage.package.tracking_token_id,
    new Date(updatedPackage.package.expires_at),
  );

  const notifications = await dispatchPackageSms({
    packageRecord: updatedPackage.package,
    triggerType: "STATUS_CHANGED",
    statusContext: nextStatus,
    trackingUrl,
  });

  return {
    package: updatedPackage.package,
    skipped: false,
    notifications,
  };
}
