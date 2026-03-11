import { NextResponse } from "next/server";
import { z } from "zod";

import { requireApiUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api";
import { updatePackageStatus } from "@/lib/services/packages";
import { PACKAGE_STATUSES } from "@/lib/types";

const bodySchema = z.object({
  status: z.enum(PACKAGE_STATUSES),
});

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireApiUser();
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid status payload." },
        { status: 400 },
      );
    }

    const { id } = await params;
    const result = await updatePackageStatus(id, parsed.data.status, auth.user.id);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
