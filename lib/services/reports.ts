import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import {
  getOwnerSideLabel,
  getTaskLabel,
  getWorkerLabel,
} from "@/lib/payouts";
import { getPackageTypeLabel } from "@/lib/package-pricing";
import { formatAccraDateTime } from "@/lib/time";
import type { WeekSnapshot } from "@/lib/types";

function csvEscape(value: string | number | null): string {
  if (value === null) {
    return "";
  }

  const text = String(value);
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

export function buildWeekCsv(snapshot: WeekSnapshot): string {
  const headers = [
    "Order ID",
    "Customer Name",
    "Room Number",
    "Package Type",
    "Clothes Count",
    "Total Weight (kg)",
    "Total Price (GHS)",
    "Primary Phone",
    "Secondary Phone",
    "Status At Close",
    "Created At (Accra)",
  ];

  const lines = [headers.join(",")];

  for (const row of snapshot.rows) {
    lines.push(
      [
        row.order_id,
        row.customer_name,
        row.room_number,
        getPackageTypeLabel(row.package_type),
        row.clothes_count,
        row.total_weight_kg.toFixed(2),
        row.total_price_ghs.toFixed(2),
        row.primary_phone,
        row.secondary_phone ?? "",
        row.status_at_close,
        formatAccraDateTime(row.created_at),
      ]
        .map((value) => csvEscape(value))
        .join(","),
    );
  }

  lines.push("");
  lines.push(csvEscape("Totals"));
  lines.push(`Package Count,${csvEscape(snapshot.report.package_count)}`);
  lines.push(`Clothes Count,${csvEscape(snapshot.report.total_clothes_count)}`);
  lines.push(`Total Weight (kg),${csvEscape(snapshot.report.total_weight_kg.toFixed(2))}`);
  lines.push(`Total Price (GHS),${csvEscape(snapshot.report.total_price_ghs.toFixed(2))}`);
  lines.push(`Wash Only Packages,${csvEscape(snapshot.package_type_summary.wash_only_count)}`);
  lines.push(
    `Normal Packages,${csvEscape(snapshot.package_type_summary.normal_wash_dry_count)}`,
  );
  lines.push(
    `Express Packages,${csvEscape(snapshot.package_type_summary.express_wash_dry_count)}`,
  );

  lines.push("");
  lines.push(csvEscape("Express Business Summary"));
  lines.push(
    `Express Package Count,${csvEscape(snapshot.express_business_summary.express_package_count)}`,
  );
  lines.push(
    `Express Total Weight (kg),${csvEscape(snapshot.express_business_summary.express_total_weight_kg.toFixed(2))}`,
  );
  lines.push(
    `Your Express Share (GHS),${csvEscape(snapshot.express_business_summary.your_express_share_ghs.toFixed(2))}`,
  );
  lines.push(
    `Partner Express Share (GHS),${csvEscape(snapshot.express_business_summary.partner_express_share_ghs.toFixed(2))}`,
  );
  lines.push(
    `Express Fixed Charges (GHS),${csvEscape(snapshot.express_business_summary.express_fixed_charge_total_ghs.toFixed(2))}`,
  );

  lines.push("");
  lines.push(csvEscape("Worker Salary Summary"));
  lines.push(
    [
      "Worker",
      "Intake",
      "Washing",
      "Drying Downstairs",
      "Removed From Line",
      "Folded",
      "Dryer Operation",
      "Express Remove + Fold",
      "Your Side Total (GHS)",
      "Partner Side Total (GHS)",
      "Grand Total (GHS)",
    ].join(","),
  );
  for (const summary of snapshot.worker_payout_summaries) {
    lines.push(
      [
        getWorkerLabel(summary.worker_name),
        summary.intake_count,
        summary.washing_count,
        summary.drying_downstairs_count,
        summary.removed_from_line_count,
        summary.folded_count,
        summary.dryer_operation_count,
        summary.removed_and_folded_from_dryer_count,
        summary.your_side_total_ghs.toFixed(2),
        summary.partner_side_total_ghs.toFixed(2),
        summary.grand_total_ghs.toFixed(2),
      ]
        .map((value) => csvEscape(value))
        .join(","),
    );
  }

  lines.push("");
  lines.push(csvEscape("Worker Proof Entries"));
  lines.push(
    [
      "Date (Accra)",
      "Worker",
      "Order ID",
      "Room Number",
      "Package Type",
      "Task",
      "Amount (GHS)",
      "Paid By",
    ].join(","),
  );
  for (const entry of snapshot.task_entries.filter((entry) => entry.worker_name !== "NOBODY")) {
    lines.push(
      [
        formatAccraDateTime(entry.assigned_at),
        getWorkerLabel(entry.worker_name),
        entry.order_id,
        entry.room_number,
        getPackageTypeLabel(entry.package_type),
        getTaskLabel(entry.task_type),
        entry.amount_ghs.toFixed(2),
        getOwnerSideLabel(entry.owner_side),
      ]
        .map((value) => csvEscape(value))
        .join(","),
    );
  }

  return lines.join("\n");
}

interface TextRow {
  label: string;
  value: string;
}

export async function buildWeekPdf(snapshot: WeekSnapshot): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([595.28, 841.89]); // A4
  const marginX = 40;
  const lineHeight = 16;
  let y = 800;

  function writeLine(text: string, font = regular, size = 11) {
    if (y < 60) {
      page = pdf.addPage([595.28, 841.89]);
      y = 800;
    }

    page.drawText(text, {
      x: marginX,
      y,
      size,
      font,
      color: rgb(0.1, 0.1, 0.1),
      maxWidth: 520,
    });
    y -= lineHeight;
  }

  writeLine("Laundry Weekly Report", bold, 18);
  y -= 4;
  writeLine(`Week Label: ${snapshot.week.label}`);
  writeLine(`Week Start: ${formatAccraDateTime(snapshot.week.start_at)}`);
  writeLine(`Week End: ${formatAccraDateTime(snapshot.week.end_at)}`);
  writeLine(`Generated: ${formatAccraDateTime(snapshot.report.generated_at)}`);
  y -= 6;

  const summaryRows: TextRow[] = [
    { label: "Package Count", value: String(snapshot.report.package_count) },
    {
      label: "Total Clothes Count",
      value: String(snapshot.report.total_clothes_count),
    },
    {
      label: "Total Weight (kg)",
      value: snapshot.report.total_weight_kg.toFixed(2),
    },
    {
      label: "Total Price (GHS)",
      value: snapshot.report.total_price_ghs.toFixed(2),
    },
    {
      label: "Wash Only Packages",
      value: String(snapshot.package_type_summary.wash_only_count),
    },
    {
      label: "Normal Packages",
      value: String(snapshot.package_type_summary.normal_wash_dry_count),
    },
    {
      label: "Express Packages",
      value: String(snapshot.package_type_summary.express_wash_dry_count),
    },
  ];

  writeLine("Summary", bold, 13);
  for (const row of summaryRows) {
    writeLine(`${row.label}: ${row.value}`);
  }
  y -= 8;

  writeLine("Rows", bold, 13);
  writeLine(
    "Order ID | Name | Room | Package | Clothes | Kg | Price(GHS) | Status",
    bold,
    10,
  );

  for (const row of snapshot.rows) {
    const line = `${row.order_id} | ${row.customer_name} | ${row.room_number} | ${getPackageTypeLabel(row.package_type)} | ${row.clothes_count} | ${row.total_weight_kg.toFixed(2)} | ${row.total_price_ghs.toFixed(2)} | ${row.status_at_close}`;
    writeLine(line, regular, 9);
  }

  y -= 8;
  writeLine("Express Business Summary", bold, 13);
  writeLine(
    `Express Package Count: ${snapshot.express_business_summary.express_package_count}`,
  );
  writeLine(
    `Express Total Kg: ${snapshot.express_business_summary.express_total_weight_kg.toFixed(2)}`,
  );
  writeLine(
    `Your Express Share (GHS): ${snapshot.express_business_summary.your_express_share_ghs.toFixed(2)}`,
  );
  writeLine(
    `Partner Express Share (GHS): ${snapshot.express_business_summary.partner_express_share_ghs.toFixed(2)}`,
  );
  writeLine(
    `Express Fixed Charges (GHS): ${snapshot.express_business_summary.express_fixed_charge_total_ghs.toFixed(2)}`,
  );

  y -= 8;
  writeLine("Worker Salary Summary", bold, 13);
  for (const summary of snapshot.worker_payout_summaries) {
    writeLine(`${getWorkerLabel(summary.worker_name)}`, bold, 11);
    writeLine(`Intake: ${summary.intake_count}`);
    writeLine(`Washing: ${summary.washing_count}`);
    writeLine(`Drying Downstairs: ${summary.drying_downstairs_count}`);
    writeLine(`Removed From Line: ${summary.removed_from_line_count}`);
    writeLine(`Folded: ${summary.folded_count}`);
    writeLine(`Dryer Operation: ${summary.dryer_operation_count}`);
    writeLine(
      `Express Remove + Fold: ${summary.removed_and_folded_from_dryer_count}`,
    );
    writeLine(`Your Side Total (GHS): ${summary.your_side_total_ghs.toFixed(2)}`);
    writeLine(
      `Partner Side Total (GHS): ${summary.partner_side_total_ghs.toFixed(2)}`,
    );
    writeLine(`Grand Total (GHS): ${summary.grand_total_ghs.toFixed(2)}`);
    y -= 4;
  }

  y -= 8;
  writeLine("Worker Proof Entries", bold, 13);
  for (const workerName of ["GIFTY_BLESSING", "EUGEN"] as const) {
    writeLine(getWorkerLabel(workerName), bold, 11);
    const workerEntries = snapshot.task_entries.filter(
      (entry) => entry.worker_name === workerName,
    );
    if (workerEntries.length === 0) {
      writeLine("No paid entries.");
      y -= 4;
      continue;
    }

    for (const entry of workerEntries) {
      const line = `${formatAccraDateTime(entry.assigned_at)} | ${entry.order_id} | ${entry.room_number} | ${getPackageTypeLabel(entry.package_type)} | ${getTaskLabel(entry.task_type)} | ${entry.amount_ghs.toFixed(2)} | ${getOwnerSideLabel(entry.owner_side)}`;
      writeLine(line, regular, 9);
    }
    y -= 4;
  }

  return pdf.save();
}
