import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { handleApiError } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import {
  isPrivateAccessAuthorized,
  PRIVATE_ACCESS_HEADER_NAME,
  PRIVATE_ACCESS_COOKIE_NAME,
} from "@/lib/private-access";
import { getPrivateDashboardData } from "@/lib/services/private-dashboard";

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if ("response" in auth) {
    return auth.response;
  }

  const cookieStore = await cookies();
  const hasPrivateAccess = await isPrivateAccessAuthorized({
    cookieValue: cookieStore.get(PRIVATE_ACCESS_COOKIE_NAME)?.value,
    headerValue: request.headers.get(PRIVATE_ACCESS_HEADER_NAME),
    userId: auth.user.id,
  });

  if (!hasPrivateAccess) {
    return NextResponse.json(
      { error: "Private access is required." },
      { status: 403 },
    );
  }

  try {
    const payload = await getPrivateDashboardData();
    return NextResponse.json(payload);
  } catch (error) {
    return handleApiError(error);
  }
}
