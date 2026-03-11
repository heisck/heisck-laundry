import { getDb } from "@/lib/db";
import { addDays } from "@/lib/time";
import type {
  ProcessingWeek,
  ProcessingWeekWithReport,
  WeekReportRow,
  WeekReportSummary,
  WeekSnapshot,
} from "@/lib/types";
import { AppError } from "@/lib/app-error";

export const SYSTEM_ACTOR_ID = "00000000-0000-0000-0000-000000000001";

function toNumber(value: unknown): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function mapWeek(row: Record<string, unknown>): ProcessingWeek {
  return {
    id: String(row.id),
    label: String(row.label),
    start_at: new Date(String(row.start_at)).toISOString(),
    end_at: new Date(String(row.end_at)).toISOString(),
    status: String(row.status) as ProcessingWeek["status"],
    closed_at: row.closed_at ? new Date(String(row.closed_at)).toISOString() : null,
    closed_by: row.closed_by ? String(row.closed_by) : null,
    created_at: new Date(String(row.created_at)).toISOString(),
  };
}

function mapWeekWithReport(row: Record<string, unknown>): ProcessingWeekWithReport {
  const week = mapWeek(row);
  return {
    ...week,
    package_count:
      row.package_count === null || row.package_count === undefined
        ? null
        : Number(row.package_count),
    total_clothes_count:
      row.total_clothes_count === null || row.total_clothes_count === undefined
        ? null
        : Number(row.total_clothes_count),
    total_weight_kg:
      row.total_weight_kg === null || row.total_weight_kg === undefined
        ? null
        : toNumber(row.total_weight_kg),
    total_price_ghs:
      row.total_price_ghs === null || row.total_price_ghs === undefined
        ? null
        : toNumber(row.total_price_ghs),
    generated_at: row.generated_at
      ? new Date(String(row.generated_at)).toISOString()
      : null,
  };
}

function defaultWeekLabel(startAt: Date): string {
  return `Week ${startAt.toISOString().slice(0, 10)}`;
}

export async function getCurrentProcessingWeek(): Promise<ProcessingWeek | null> {
  const sql = getDb();
  const rows = await sql`
    select id, label, start_at, end_at, status, closed_at, closed_by, created_at
    from processing_weeks
    where status = 'ACTIVE'
    order by start_at desc
    limit 1
  `;

  return rows.length > 0 ? mapWeek(rows[0] as Record<string, unknown>) : null;
}

export async function listProcessingWeeks(): Promise<ProcessingWeekWithReport[]> {
  const sql = getDb();
  const rows = await sql`
    select
      w.id,
      w.label,
      w.start_at,
      w.end_at,
      w.status,
      w.closed_at,
      w.closed_by,
      w.created_at,
      r.package_count,
      r.total_clothes_count,
      r.total_weight_kg,
      r.total_price_ghs,
      r.generated_at
    from processing_weeks w
    left join week_reports r on r.week_id = w.id
    order by w.start_at desc
  `;

  return rows.map((row) => mapWeekWithReport(row as Record<string, unknown>));
}

export async function startProcessingWeek(
  label: string | undefined,
): Promise<ProcessingWeek> {
  const sql = getDb();
  const now = new Date();
  const endAt = addDays(now, 7);
  const safeLabel = label?.trim() || defaultWeekLabel(now);

  try {
    const created = await sql.begin(async (tx) => {
      const trx = tx as unknown as ReturnType<typeof getDb>;
      const activeRows = await trx`
        select id
        from processing_weeks
        where status = 'ACTIVE'
        for update
      `;

      if (activeRows.length > 0) {
        throw new AppError(
          "ACTIVE_WEEK_EXISTS",
          409,
          "An active processing week already exists.",
        );
      }

      const inserted = await trx`
        insert into processing_weeks
          (label, start_at, end_at, status, closed_at, closed_by, created_at)
        values
          (${safeLabel}, ${now.toISOString()}, ${endAt.toISOString()}, 'ACTIVE', null, null, now())
        returning id, label, start_at, end_at, status, closed_at, closed_by, created_at
      `;

      return inserted[0] as Record<string, unknown>;
    });

    return mapWeek(created);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError("WEEK_START_FAILED", 500, "Unable to start processing week.");
  }
}

function mapSummary(row: Record<string, unknown>): WeekReportSummary {
  return {
    week_id: String(row.week_id),
    package_count: Number(row.package_count ?? 0),
    total_clothes_count: Number(row.total_clothes_count ?? 0),
    total_weight_kg: toNumber(row.total_weight_kg),
    total_price_ghs: toNumber(row.total_price_ghs),
    generated_at: new Date(String(row.generated_at)).toISOString(),
    generated_by: row.generated_by ? String(row.generated_by) : null,
  };
}

function mapReportRow(row: Record<string, unknown>): WeekReportRow {
  return {
    id: String(row.id),
    week_id: String(row.week_id),
    package_id: String(row.package_id),
    order_id: String(row.order_id),
    customer_name: String(row.customer_name),
    room_number: String(row.room_number),
    clothes_count: Number(row.clothes_count ?? 0),
    total_weight_kg: toNumber(row.total_weight_kg),
    total_price_ghs: toNumber(row.total_price_ghs),
    primary_phone: String(row.primary_phone),
    secondary_phone: row.secondary_phone ? String(row.secondary_phone) : null,
    status_at_close: String(row.status_at_close) as WeekReportRow["status_at_close"],
    created_at: new Date(String(row.created_at)).toISOString(),
  };
}

export async function closeProcessingWeek(
  weekId: string,
  userId: string,
): Promise<{
  closedWeek: ProcessingWeek;
  nextWeek: ProcessingWeek;
  report: WeekReportSummary;
}> {
  const sql = getDb();

  return sql.begin(async (tx) => {
    const trx = tx as unknown as ReturnType<typeof getDb>;
    const weekRows = await trx`
      select id, label, start_at, end_at, status, closed_at, closed_by, created_at
      from processing_weeks
      where id = ${weekId}
      for update
    `;

    if (weekRows.length === 0) {
      throw new AppError("WEEK_NOT_FOUND", 404, "Processing week was not found.");
    }

    const currentWeek = weekRows[0] as Record<string, unknown>;
    if (String(currentWeek.status) !== "ACTIVE") {
      throw new AppError(
        "WEEK_NOT_ACTIVE",
        409,
        "Only an active week can be closed.",
      );
    }

    const closeTime = new Date();

    const closedRows = await trx`
      update processing_weeks
      set status = 'CLOSED',
          closed_at = ${closeTime.toISOString()},
          closed_by = ${userId}
      where id = ${weekId}
      returning id, label, start_at, end_at, status, closed_at, closed_by, created_at
    `;

    const aggregateRows = await trx`
      select
        count(*)::int as package_count,
        coalesce(sum(clothes_count), 0)::int as total_clothes_count,
        coalesce(sum(total_weight_kg), 0)::numeric(12,2) as total_weight_kg,
        coalesce(sum(total_price_ghs), 0)::numeric(12,2) as total_price_ghs
      from packages
      where week_id = ${weekId}
    `;

    const aggregate = aggregateRows[0] as Record<string, unknown>;

    const reportRows = await trx`
      insert into week_reports
        (
          week_id,
          package_count,
          total_clothes_count,
          total_weight_kg,
          total_price_ghs,
          generated_at,
          generated_by
        )
      values
        (
          ${weekId},
          ${Number(aggregate.package_count ?? 0)},
          ${Number(aggregate.total_clothes_count ?? 0)},
          ${toNumber(aggregate.total_weight_kg)},
          ${toNumber(aggregate.total_price_ghs)},
          ${closeTime.toISOString()},
          ${userId}
        )
      returning
        week_id,
        package_count,
        total_clothes_count,
        total_weight_kg,
        total_price_ghs,
        generated_at,
        generated_by
    `;

    await trx`
      insert into week_report_rows
        (
          week_id,
          package_id,
          order_id,
          customer_name,
          room_number,
          clothes_count,
          total_weight_kg,
          total_price_ghs,
          primary_phone,
          secondary_phone,
          status_at_close,
          created_at
        )
      select
        ${weekId},
        p.id,
        p.order_id,
        p.customer_name,
        p.room_number,
        p.clothes_count,
        p.total_weight_kg,
        p.total_price_ghs,
        p.primary_phone,
        p.secondary_phone,
        p.status,
        p.created_at
      from packages p
      where p.week_id = ${weekId}
    `;

    const nextStart = closeTime;
    const nextEnd = addDays(nextStart, 7);

    const nextRows = await trx`
      insert into processing_weeks
        (label, start_at, end_at, status, closed_at, closed_by, created_at)
      values
        (${defaultWeekLabel(nextStart)}, ${nextStart.toISOString()}, ${nextEnd.toISOString()}, 'ACTIVE', null, null, now())
      returning id, label, start_at, end_at, status, closed_at, closed_by, created_at
    `;

    return {
      closedWeek: mapWeek(closedRows[0] as Record<string, unknown>),
      nextWeek: mapWeek(nextRows[0] as Record<string, unknown>),
      report: mapSummary(reportRows[0] as Record<string, unknown>),
    };
  });
}

export async function autoCloseOverdueWeeks(
  closedBy: string = SYSTEM_ACTOR_ID,
): Promise<Array<{ closedWeekId: string; nextWeekId: string }>> {
  const sql = getDb();
  const overdue = await sql`
    select id
    from processing_weeks
    where status = 'ACTIVE'
      and end_at <= now()
    order by end_at asc
  `;

  const results: Array<{ closedWeekId: string; nextWeekId: string }> = [];

  for (const row of overdue) {
    const outcome = await closeProcessingWeek(String((row as { id: string }).id), closedBy);
    results.push({
      closedWeekId: outcome.closedWeek.id,
      nextWeekId: outcome.nextWeek.id,
    });
  }

  return results;
}

export async function getWeekSnapshot(weekId: string): Promise<WeekSnapshot> {
  const sql = getDb();

  const weekRows = await sql`
    select id, label, start_at, end_at, status, closed_at, closed_by, created_at
    from processing_weeks
    where id = ${weekId}
    limit 1
  `;

  if (weekRows.length === 0) {
    throw new AppError("WEEK_NOT_FOUND", 404, "Processing week was not found.");
  }

  const week = mapWeek(weekRows[0] as Record<string, unknown>);
  if (week.status !== "CLOSED") {
    throw new AppError(
      "WEEK_NOT_CLOSED",
      409,
      "Week report is only available after week closure.",
    );
  }

  const reportRows = await sql`
    select
      week_id,
      package_count,
      total_clothes_count,
      total_weight_kg,
      total_price_ghs,
      generated_at,
      generated_by
    from week_reports
    where week_id = ${weekId}
    limit 1
  `;

  if (reportRows.length === 0) {
    throw new AppError("WEEK_REPORT_NOT_FOUND", 404, "Week report snapshot not found.");
  }

  const rows = await sql`
    select
      id,
      week_id,
      package_id,
      order_id,
      customer_name,
      room_number,
      clothes_count,
      total_weight_kg,
      total_price_ghs,
      primary_phone,
      secondary_phone,
      status_at_close,
      created_at
    from week_report_rows
    where week_id = ${weekId}
    order by created_at asc
  `;

  return {
    week,
    report: mapSummary(reportRows[0] as Record<string, unknown>),
    rows: rows.map((row) => mapReportRow(row as Record<string, unknown>)),
  };
}
