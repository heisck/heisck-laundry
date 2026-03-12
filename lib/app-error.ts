export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

const DB_CONNECTION_ERROR_CODES = new Set([
  "CONNECT_TIMEOUT",
  "CONNECTION_CLOSED",
  "CONNECTION_DESTROYED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EPIPE",
]);

function isDbConnectionError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code =
    "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  return DB_CONNECTION_ERROR_CODES.has(code);
}

export function toErrorResponse(error: unknown): {
  status: number;
  body: { error: string; code?: string };
} {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: {
        error: error.message,
        code: error.code,
      },
    };
  }

  if (isDbConnectionError(error)) {
    return {
      status: 503,
      body: {
        error: "Database connection timed out. Retry in a moment.",
        code: "DATABASE_CONNECT_TIMEOUT",
      },
    };
  }

  return {
    status: 500,
    body: {
      error: "Internal server error.",
    },
  };
}
