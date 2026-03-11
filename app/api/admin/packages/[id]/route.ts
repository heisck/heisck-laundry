import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api";
import { getPackageById } from "@/lib/services/packages";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: Params) {
  const auth = await requireApiUser();
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const { id } = await params;
    const packageRecord = await getPackageById(id);
    return NextResponse.json({ package: packageRecord });
  } catch (error) {
    return handleApiError(error);
  }
}
