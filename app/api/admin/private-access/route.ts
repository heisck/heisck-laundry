import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import {
  getPrivateAccessCookieOptions,
  getPrivateAccessCookieValue,
  isPrivateAccessPassword,
  PRIVATE_ACCESS_COOKIE_NAME,
  PRIVATE_ACCESS_COOKIE_PATH,
} from "@/lib/private-access";

const unlockSchema = z.object({
  password: z.string().trim().min(1).max(64),
});

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const rawBody = await request.json().catch(() => null);
    const parsed = unlockSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Enter the private password." },
        { status: 400 },
      );
    }

    if (!(await isPrivateAccessPassword(parsed.data.password))) {
      return NextResponse.json(
        { error: "Incorrect private password." },
        { status: 401 },
      );
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set(
      PRIVATE_ACCESS_COOKIE_NAME,
      await getPrivateAccessCookieValue(),
      getPrivateAccessCookieOptions(),
    );
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE() {
  const auth = await requireApiUser();
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const response = NextResponse.json({ success: true });
    response.cookies.set(PRIVATE_ACCESS_COOKIE_NAME, "", {
      httpOnly: true,
      maxAge: 0,
      path: PRIVATE_ACCESS_COOKIE_PATH,
      sameSite: "strict" as const,
      secure: process.env.NODE_ENV === "production",
    });
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
