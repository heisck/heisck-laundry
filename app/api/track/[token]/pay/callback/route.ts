import { NextResponse } from "next/server";

import { getDb, withDbConnectionRetry } from "@/lib/db";
import { verifyPaystackPayment } from "@/lib/paystack";

interface Params {
  params: Promise<{ token: string }>;
}

export async function GET(request: Request, { params }: Params) {
  const { token } = await params;
  const { searchParams } = new URL(request.url);
  const reference = searchParams.get("reference");

  if (!reference) {
    return NextResponse.redirect(new URL(`/track/${token}`, process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"));
  }

  const verification = await verifyPaystackPayment(reference);
  if (verification.data.status === "success") {
    await withDbConnectionRetry(async () => {
      const sql = getDb();
      await sql`update packages set payment_status='PAID', payment_paid_at=coalesce(${verification.data.paid_at}, now()::text)::timestamptz where payment_reference=${reference}`;
    });
  }

  return NextResponse.redirect(new URL(`/track/${token}`, process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"));
}
