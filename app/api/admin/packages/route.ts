import { NextResponse } from "next/server";
import { z } from "zod";

import { requireApiUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api";
import { createPackage, listPackages } from "@/lib/services/packages";
import { PACKAGE_STATUSES } from "@/lib/types";

const createPackageSchema = z.object({
  customerName: z.string().trim().min(1).max(120),
  roomNumber: z.string().trim().min(1).max(64),
  clothesCount: z.coerce.number().int().nonnegative(),
  totalWeightKg: z.coerce.number().nonnegative(),
  totalPriceGhs: z.coerce.number().nonnegative(),
  primaryPhone: z.string().trim().min(1).max(20),
  secondaryPhone: z.string().trim().max(20).optional(),
  etaAt: z.string().datetime(),
});

const statusSchema = z.enum(PACKAGE_STATUSES);

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("q")?.trim() || undefined;
    const statusInput = searchParams.get("status");
    const status = statusInput ? statusSchema.parse(statusInput) : undefined;

    const packages = await listPackages({ search, status });
    return NextResponse.json({ packages });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const json = await request.json();
    const parsed = createPackageSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid package payload.", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await createPackage(parsed.data, auth.user.id);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
