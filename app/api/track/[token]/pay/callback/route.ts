import { NextResponse } from "next/server";

import { getDb, withDbConnectionRetry } from "@/lib/db";
import { verifyPaystackPayment } from "@/lib/paystack";
import { verifyTrackingToken } from "@/lib/tracking-token";

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

  const payload = await verifyTrackingToken(token).catch(() => null);
  if (!payload) {
    return NextResponse.redirect(new URL(`/track/${token}`, process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"));
  }

  const verification = await verifyPaystackPayment(reference);
  if (verification.data.status === "success") {
    await withDbConnectionRetry(async () => {
      const sql = getDb();
      await sql`
        update packages
        set
          payment_status='PAID',
          payment_source='PAYSTACK',
          payment_paid_at=coalesce(${verification.data.paid_at}, now()::text)::timestamptz
        where id=${payload.packageId}
          and tracking_token_id=${payload.tokenId}
          and payment_reference=${reference}
      `;
    });
  }

  return NextResponse.redirect(new URL(`/track/${token}`, process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"));
}
