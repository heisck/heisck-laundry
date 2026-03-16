import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import {
  getPrivateAccessCookieOptions,
  isPrivateAccessCookieValueValid,
  PRIVATE_ACCESS_COOKIE_NAME,
  updatePrivateAccessPassword,
} from "@/lib/private-access";

const bodySchema = z.object({
  password: z.string().trim().min(4).max(64),
});

export async function PATCH(request: Request) {
  const auth = await requireApiUser();
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const cookieStore = await cookies();
    const hasPrivateAccess = await isPrivateAccessCookieValueValid(
      cookieStore.get(PRIVATE_ACCESS_COOKIE_NAME)?.value,
    );

    if (!hasPrivateAccess) {
      return NextResponse.json(
        { error: "Private access is required." },
        { status: 403 },
      );
    }

    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Enter a valid new private password." },
        { status: 400 },
      );
    }

    const cookieValue = await updatePrivateAccessPassword(
      parsed.data.password,
      auth.user.id,
    );

    const response = NextResponse.json({ success: true });
    response.cookies.set(
      PRIVATE_ACCESS_COOKIE_NAME,
      cookieValue,
      getPrivateAccessCookieOptions(),
    );
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
