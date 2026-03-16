import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireApiUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api";
import {
  isPrivateAccessCookieValueValid,
  PRIVATE_ACCESS_COOKIE_NAME,
} from "@/lib/private-access";
import { invalidateAdminPackagesCache } from "@/lib/services/admin-packages";
import { startProcessingWeek } from "@/lib/services/weeks";

const bodySchema = z.object({
  label: z.string().trim().min(1).max(120).optional(),
});

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if ("response" in auth) {
    return auth.response;
  }

  const cookieStore = await cookies();
  const hasPrivateAccess = await isPrivateAccessCookieValueValid(
    cookieStore.get(PRIVATE_ACCESS_COOKIE_NAME)?.value,
    auth.user.id,
  );

  if (!hasPrivateAccess) {
    return NextResponse.json(
      { error: "Private access is required for week changes." },
      { status: 403 },
    );
  }

  try {
    const json = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body." },
        { status: 400 },
      );
    }

    const week = await startProcessingWeek(parsed.data.label);
    invalidateAdminPackagesCache();
    return NextResponse.json({ week }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
