import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api";
import { getAdminPackagesBootstrap } from "@/lib/services/admin-packages";

export async function GET() {
  const auth = await requireApiUser();
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const result = await getAdminPackagesBootstrap();
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
