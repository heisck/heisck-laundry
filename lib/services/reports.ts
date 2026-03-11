import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

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
  ];

  writeLine("Summary", bold, 13);
  for (const row of summaryRows) {
    writeLine(`${row.label}: ${row.value}`);
  }
  y -= 8;

  writeLine("Rows", bold, 13);
  writeLine(
    "Order ID | Name | Room | Clothes | Kg | Price(GHS) | Status",
    bold,
    10,
  );

  for (const row of snapshot.rows) {
    const line = `${row.order_id} | ${row.customer_name} | ${row.room_number} | ${row.clothes_count} | ${row.total_weight_kg.toFixed(2)} | ${row.total_price_ghs.toFixed(2)} | ${row.status_at_close}`;
    writeLine(line, regular, 9);
  }

  return pdf.save();
}
