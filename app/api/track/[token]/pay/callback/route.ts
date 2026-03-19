import { NextResponse } from "next/server";

import { handlePaystackRedirect } from "@/lib/services/payments";

interface Params {
  params: Promise<{ token: string }>;
}

export async function GET(request: Request, { params }: Params) {
  const { token } = await params;
  const { searchParams } = new URL(request.url);
  const reference = searchParams.get("reference");
  const state = searchParams.get("state");
  const redirectUrl = await handlePaystackRedirect({ token, reference, state });
  return NextResponse.redirect(new URL(redirectUrl), 303);
}
