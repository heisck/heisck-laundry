import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api";
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

  try {
    const { id } = await params;
    const result = await closeProcessingWeek(id, auth.user.id);
    invalidateAdminPackagesCache();
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
