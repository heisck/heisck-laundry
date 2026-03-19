import { AppError } from "@/lib/app-error";

const PAYSTACK_BASE_URL = "https://api.paystack.co";

function getSecretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    throw new AppError("PAYSTACK_NOT_CONFIGURED", 500, "PAYSTACK_SECRET_KEY is missing.");
  }
  return key;
}

async function paystackFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${PAYSTACK_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getSecretKey()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const payload = await response.json();
  if (!response.ok || payload.status === false) {
    throw new AppError("PAYSTACK_ERROR", 502, payload.message ?? "Paystack request failed.");
  }
  return payload as T;
}

export async function initializePaystackPayment(input: {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}) {
  return paystackFetch<{
    data: {
      authorization_url: string;
      access_code: string;
      reference: string;
    };
  }>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      amount: input.amountKobo,
      reference: input.reference,
      callback_url: input.callbackUrl,
      metadata: input.metadata,
    }),
  });
}

export async function verifyPaystackPayment(reference: string) {
  return paystackFetch<{
    message?: string;
    data: {
      status: string;
      reference: string;
      amount: number | null;
      currency: string | null;
      paid_at: string | null;
      gateway_response?: string | null;
      metadata?: Record<string, unknown> | null;
    };
  }>(`/transaction/verify/${reference}`);
}
