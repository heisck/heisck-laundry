import { NextResponse } from "next/server";

import { buildTrackingPath, startPackagePayment } from "@/lib/services/payments";

interface Params {
  params: Promise<{ token: string }>;
}

function getAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export async function GET(_: Request, { params }: Params) {
  const { token } = await params;
  return NextResponse.redirect(new URL(buildTrackingPath(token), getAppUrl()), 303);
}

export async function POST(_: Request, { params }: Params) {
  const { token } = await params;
  try {
    const result = await startPackagePayment(token);
    return NextResponse.redirect(new URL(result.redirectUrl), 303);
  } catch {
    return NextResponse.redirect(new URL(buildTrackingPath(token), getAppUrl()), 303);
  }
}
