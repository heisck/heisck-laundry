import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api";
import { buildWeekPdf } from "@/lib/services/reports";
import { getWeekSnapshot } from "@/lib/services/weeks";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: Params) {
  const auth = await requireApiUser();
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const { id } = await params;
    const snapshot = await getWeekSnapshot(id);
    const pdfBytes = await buildWeekPdf(snapshot);

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="week-${snapshot.week.label.replace(/\s+/g, "-").toLowerCase()}.pdf"`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
