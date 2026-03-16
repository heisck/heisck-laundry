import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api";
import {
  isPrivateAccessCookieValueValid,
  PRIVATE_ACCESS_COOKIE_NAME,
} from "@/lib/private-access";
import { invalidateAdminPackagesCache } from "@/lib/services/admin-packages";
import { closeProcessingWeek } from "@/lib/services/weeks";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: Params) {
  const auth = await requireApiUser();
  if ("response" in auth) {
    return auth.response;
  }

  const cookieStore = await cookies();
  const hasPrivateAccess = await isPrivateAccessCookieValueValid(
    cookieStore.get(PRIVATE_ACCESS_COOKIE_NAME)?.value,
  );

  if (!hasPrivateAccess) {
    return NextResponse.json(
      { error: "Private access is required for week changes." },
      { status: 403 },
    );
  }

  try {
    const { id } = await params;
    const result = await closeProcessingWeek(id, auth.user.id);
    invalidateAdminPackagesCache();
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
