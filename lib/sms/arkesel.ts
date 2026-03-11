interface ArkeselSendInput {
  to: string;
  content: string;
}

export interface ArkeselSendResult {
  ok: boolean;
  providerMessageId: string | null;
  deliveryState: string;
  errorText: string | null;
}

interface ArkeselApiResponse {
  status?: string;
  message?: string;
  error?: string;
  data?: {
    message_id?: string;
    messageId?: string;
    sms_id?: string;
    id?: string;
    status?: string;
  };
  message_id?: string;
  messageId?: string;
  sms_id?: string;
  id?: string;
}

function safeToString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function normalizeRecipient(phone: string): string {
  return phone.replace(/^\+/, "");
}

function normalizeDeliveryState(value: string | null, ok: boolean): string {
  if (!value) {
    return ok ? "SENT" : "FAILED";
  }

  const upper = value.toUpperCase();
  if (upper.includes("FAIL") || upper.includes("ERROR")) {
    return "FAILED";
  }

  if (upper.includes("QUEUE")) {
    return "QUEUED";
  }

  if (upper.includes("PEND")) {
    return "PENDING";
  }

  if (upper.includes("SENT") || upper.includes("SUCCESS")) {
    return "SENT";
  }

  return upper;
}

export async function sendArkeselSms(
  input: ArkeselSendInput,
): Promise<ArkeselSendResult> {
  const baseUrl = process.env.ARKESEL_BASE_URL ?? "https://sms.arkesel.com";
  const apiKey = process.env.ARKESEL_API_KEY;
  const senderId = process.env.ARKESEL_SENDER_ID?.trim();

  if (!apiKey || !senderId) {
    return {
      ok: false,
      providerMessageId: null,
      deliveryState: "FAILED",
      errorText:
        "Arkesel configuration is missing. Check ARKESEL_API_KEY and ARKESEL_SENDER_ID.",
    };
  }

  if (senderId.length > 11) {
    return {
      ok: false,
      providerMessageId: null,
      deliveryState: "FAILED",
      errorText: `ARKESEL_SENDER_ID must be 11 characters or fewer (current: ${senderId.length}).`,
    };
  }

  const response = await fetch(
    `${baseUrl.replace(/\/$/, "")}/api/v2/sms/send`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "api-key": apiKey,
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        sender: senderId,
        message: input.content,
        recipients: [normalizeRecipient(input.to)],
      }),
    },
  );

  const payload = (await safeJson(response)) as ArkeselApiResponse | null;
  const providerMessageId =
    safeToString(payload?.data?.message_id) ??
    safeToString(payload?.data?.messageId) ??
    safeToString(payload?.data?.sms_id) ??
    safeToString(payload?.data?.id) ??
    safeToString(payload?.message_id) ??
    safeToString(payload?.messageId) ??
    safeToString(payload?.sms_id) ??
    safeToString(payload?.id);

  const stateSource =
    safeToString(payload?.data?.status) ?? safeToString(payload?.status);

  if (!response.ok) {
    return {
      ok: false,
      providerMessageId,
      deliveryState: normalizeDeliveryState(stateSource, false),
      errorText:
        safeToString(payload?.error) ??
        safeToString(payload?.message) ??
        `Arkesel request failed with status ${response.status}.`,
    };
  }

  const responseStatus = safeToString(payload?.status)?.toLowerCase();
  const hasFailureStatus =
    responseStatus === "failed" ||
    responseStatus === "error" ||
    responseStatus === "false";

  if (hasFailureStatus) {
    return {
      ok: false,
      providerMessageId,
      deliveryState: normalizeDeliveryState(stateSource ?? responseStatus, false),
      errorText:
        safeToString(payload?.error) ??
        safeToString(payload?.message) ??
        "Arkesel rejected the SMS request.",
    };
  }

  return {
    ok: true,
    providerMessageId,
    deliveryState: normalizeDeliveryState(stateSource, true),
    errorText: null,
  };
}
