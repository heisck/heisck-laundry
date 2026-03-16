import { NextResponse } from "next/server";

import { getDb, withDbConnectionRetry } from "@/lib/db";
import { initializePaystackPayment } from "@/lib/paystack";
import { verifyTrackingToken } from "@/lib/tracking-token";

interface Params {
  params: Promise<{ token: string }>;
}

function getAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export async function GET(_: Request, { params }: Params) {
  const { token } = await params;
  return NextResponse.redirect(new URL(`/track/${token}`, getAppUrl()), 303);
}

export async function POST(_: Request, { params }: Params) {
  const { token } = await params;
  const payload = await verifyTrackingToken(token);

  const rows = await withDbConnectionRetry(async () => {
    const sql = getDb();
    return sql`select id, order_id, total_price_ghs, payment_status from packages where id=${payload.packageId} and tracking_token_id=${payload.tokenId} limit 1`;
  });

  if (rows.length === 0) {
    return NextResponse.redirect(new URL(`/track/${token}`, getAppUrl()), 303);
  }

  const row = rows[0] as { id: string; order_id: string; total_price_ghs: number; payment_status: string };
  if (row.payment_status === "PAID") {
    return NextResponse.redirect(new URL(`/track/${token}`, getAppUrl()), 303);
  }

  const reference = `hl-${row.order_id}-${Date.now()}`;
  const appUrl = getAppUrl();
  const callbackUrl = `${appUrl}/api/track/${token}/pay/callback`;
  const init = await initializePaystackPayment({
    email: process.env.PAYSTACK_DEFAULT_CUSTOMER_EMAIL ?? "customer@heiscklaundry.local",
    amountKobo: Math.round(Number(row.total_price_ghs) * 100),
    reference,
    callbackUrl,
    metadata: { packageId: row.id, orderId: row.order_id },
  });

  await withDbConnectionRetry(async () => {
    const sql = getDb();
    await sql`
      update packages
      set payment_status='PENDING', payment_source='PAYSTACK', payment_reference=${reference}
      where id=${row.id}
    `;
  });

  return NextResponse.redirect(init.data.authorization_url, 303);
}
